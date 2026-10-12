import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

RAIZ = Path(__file__).resolve().parent.parent
CAMPOS = (
    "region",
    "c_finca",
    "finca",
    "codigo_modulo",
    "tipo_riego",
    "personas_asignadas",
)


def leer_env():
    archivo = RAIZ / ".env"
    if not archivo.is_file():
        raise RuntimeError("No se encontró el archivo .env del proyecto.")

    config = {}
    for linea in archivo.read_text(encoding="utf-8-sig").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        nombre, valor = linea.split("=", 1)
        config[nombre.strip()] = valor.strip().strip('"').strip("'")

    for nombre in ("SUPABASE_URL", "SUPABASE_SECRET_KEY"):
        if not config.get(nombre):
            raise RuntimeError(f"Falta {nombre} en .env")

    return config


def leer_oracle():
    entorno = os.environ.copy()
    entorno["PYTHONIOENCODING"] = "utf-8"

    proceso = subprocess.run(
        [sys.executable, str(RAIZ / "scripts" / "catalogo_oracle.py")],
        cwd=RAIZ,
        env=entorno,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=180,
        check=False,
    )

    if proceso.returncode != 0:
        raise RuntimeError(
            proceso.stderr.strip() or "Falló la lectura del catálogo Oracle."
        )

    filas = json.loads(proceso.stdout)
    if not isinstance(filas, list) or not filas:
        raise RuntimeError("Oracle no devolvió una lista de módulos.")

    ahora = datetime.now(timezone.utc).isoformat()
    modulos = []
    claves = set()

    for numero, fila in enumerate(filas, start=1):
        if not isinstance(fila, dict) or any(campo not in fila for campo in CAMPOS):
            raise RuntimeError(f"Fila {numero}: faltan campos del catálogo.")

        clave = (
            str(fila["region"]).strip(),
            str(fila["c_finca"]).strip(),
            str(fila["codigo_modulo"]).strip(),
        )
        if not all(clave) or clave in claves:
            raise RuntimeError(f"Fila {numero}: clave vacía o duplicada: {clave}")
        claves.add(clave)

        cantidad = fila["personas_asignadas"]
        modulos.append({
            "region": clave[0],
            "c_finca": fila["c_finca"],
            "finca": str(fila["finca"] or "").strip(),
            "codigo_modulo": clave[2],
            "tipo_riego": fila["tipo_riego"],
            "personas_asignadas": None if cantidad is None else int(cantidad),
            "actualizado_en": ahora,
        })

    return modulos


def enviar_supabase(modulos, config):
    parametros = urlencode({
        "on_conflict": "region,c_finca,codigo_modulo"
    })
    url = (
        config["SUPABASE_URL"].rstrip("/")
        + "/rest/v1/modulos?"
        + parametros
    )

    for inicio in range(0, len(modulos), 100):
        lote = modulos[inicio:inicio + 100]
        peticion = Request(
            url,
            data=json.dumps(lote, ensure_ascii=False).encode("utf-8"),
            headers={
                "apikey": config["SUPABASE_SECRET_KEY"],
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
            method="POST",
        )

        try:
            with urlopen(peticion, timeout=60) as respuesta:
                respuesta.read()
        except HTTPError as error:
            detalle = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Supabase rechazó el lote {inicio // 100 + 1}: "
                f"HTTP {error.code}: {detalle}"
            ) from error

        print(f"Enviados {inicio + len(lote)} de {len(modulos)} módulos.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--verificar",
        action="store_true",
        help="Lee y valida Oracle sin escribir en Supabase.",
    )
    args = parser.parse_args()

    config = leer_env()
    modulos = leer_oracle()
    print(f"Catálogo Oracle validado: {len(modulos)} módulos.")

    if args.verificar:
        print("Modo verificación: no se modificó Supabase.")
        return

    enviar_supabase(modulos, config)
    print("Sincronización terminada.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)