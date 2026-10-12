import os
import sys
from collections import Counter
from pathlib import Path

import oracledb
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=True)


def consultar_jefes():
    campos = (
        "ORACLE_HOST", "ORACLE_PORT", "ORACLE_SERVICE",
        "ORACLE_USER", "ORACLE_PASSWORD",
    )
    faltantes = [campo for campo in campos if not os.getenv(campo)]
    if faltantes:
        raise RuntimeError("Faltan datos en .env: " + ", ".join(faltantes))

    archivo_sql = ROOT / "sql" / "jefes.sql"
    if not archivo_sql.is_file():
        raise RuntimeError("No existe sql/jefes.sql")

    consulta = archivo_sql.read_text(
        encoding="utf-8-sig"
    ).strip().rstrip(";")

    dsn = (
        f"{os.environ['ORACLE_HOST']}:"
        f"{os.environ['ORACLE_PORT']}/"
        f"{os.environ['ORACLE_SERVICE']}"
    )

    jefes = []
    correos = set()

    with oracledb.connect(
        user=os.environ["ORACLE_USER"],
        password=os.environ["ORACLE_PASSWORD"],
        dsn=dsn,
    ) as conexion:
        with conexion.cursor() as cursor:
            cursor.execute(consulta)
            columnas = [columna[0].lower() for columna in cursor.description]

            for fila in cursor:
                dato = dict(zip(columnas, fila))
                objectid = dato.get("objectid")
                nombre = str(dato.get("nombre") or "").strip()
                correo = str(dato.get("correo") or "").strip().lower()
                region = str(dato.get("region") or "").strip().upper()

                if objectid is None or not nombre or not correo or not region:
                    raise RuntimeError(
                        "Oracle devolvió un jefe con datos incompletos."
                    )

                if correo.count("@") != 1 or not all(correo.split("@")):
                    raise RuntimeError("Oracle devolvió un correo inválido.")

                if correo in correos:
                    raise RuntimeError(
                        "Oracle devolvió correos repetidos entre los jefes activos."
                    )

                correos.add(correo)
                jefes.append({
                    "objectid": int(objectid),
                    "nombre": nombre,
                    "correo": correo,
                    "region": region,
                })

    if not jefes:
        raise RuntimeError("No se encontraron jefes activos en Oracle.")

    return jefes


if __name__ == "__main__":
    try:
        jefes = consultar_jefes()
        print(f"Lectura correcta: {len(jefes)} jefes activos.")
        for region, cantidad in sorted(
            Counter(jefe["region"] for jefe in jefes).items()
        ):
            print(f"{region}: {cantidad}")
    except Exception as error:
        print(f"Error al consultar jefes en Oracle: {error}", file=sys.stderr)
        sys.exit(1)