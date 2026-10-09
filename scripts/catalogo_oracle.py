import json
import os
import sys
from pathlib import Path

import oracledb
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=True)


def consultar_modulos():
    campos = (
        "ORACLE_HOST", "ORACLE_PORT", "ORACLE_SERVICE",
        "ORACLE_USER", "ORACLE_PASSWORD",
    )
    faltantes = [campo for campo in campos if not os.getenv(campo)]
    if faltantes:
        raise RuntimeError("Faltan datos en .env: " + ", ".join(faltantes))

    consulta = (ROOT / "sql" / "modulos.sql").read_text(
        encoding="utf-8-sig"
    ).strip().rstrip(";")

    dsn = (
        f"{os.environ['ORACLE_HOST']}:"
        f"{os.environ['ORACLE_PORT']}/"
        f"{os.environ['ORACLE_SERVICE']}"
    )

    with oracledb.connect(
        user=os.environ["ORACLE_USER"],
        password=os.environ["ORACLE_PASSWORD"],
        dsn=dsn,
    ) as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(consulta)
            columnas = [columna[0].lower() for columna in cursor.description]
            modulos = []

            for fila in cursor:
                dato = dict(zip(columnas, fila))
                cantidad = dato["personas_asignadas"]

                modulos.append({
                    "region": str(dato["region"] or "").strip(),
                    "c_finca": str(dato["c_finca"] or "").strip(),
                    "finca": str(dato["finca"] or "").strip(),
                    "codigo_modulo": str(dato["codigo_modulo"] or "").strip(),
                    "tipo_riego": str(dato["tipo_riego"] or "").strip(),
                    "personas_asignadas": (
                        None if cantidad is None else int(cantidad)
                    ),
                })

    return modulos


if __name__ == "__main__":
    try:
        modulos = consultar_modulos()
        if "--test" in sys.argv:
            print(f"Conexión correcta. Módulos encontrados: {len(modulos)}")
        else:
            sys.stdout.reconfigure(encoding="utf-8")
            print(json.dumps(modulos, ensure_ascii=False))
    except Exception as error:
        print(f"Error al consultar Oracle: {error}", file=sys.stderr)
        sys.exit(1)