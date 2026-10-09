import csv
from pathlib import Path

from catalogo_oracle import consultar_modulos

ROOT = Path(__file__).resolve().parents[1]
SALIDA = ROOT.parent / "importacion-supabase"

CAMPOS = [
    "region",
    "c_finca",
    "finca",
    "codigo_modulo",
    "tipo_riego",
    "personas_asignadas",
]


def guardar(nombre, campos, registros):
    if not registros:
        return

    ruta = SALIDA / nombre
    with ruta.open("w", newline="", encoding="utf-8-sig") as archivo:
        escritor = csv.DictWriter(
            archivo,
            fieldnames=campos,
            extrasaction="ignore",
        )
        escritor.writeheader()
        escritor.writerows(registros)

    print(f"{len(registros)} módulos: {ruta}")


modulos = consultar_modulos()

if not modulos:
    raise RuntimeError("Oracle no devolvió módulos; no se creó la exportación.")

claves = {
    (m["region"], m["c_finca"], m["codigo_modulo"])
    for m in modulos
}
if len(claves) != len(modulos):
    raise RuntimeError("Hay claves de módulo duplicadas; revisa la consulta.")

SALIDA.mkdir(exist_ok=True)

con_cantidad = [
    m for m in modulos if m["personas_asignadas"] is not None
]
sin_cantidad = [
    m for m in modulos if m["personas_asignadas"] is None
]

guardar("modulos_con_cantidad.csv", CAMPOS, con_cantidad)
guardar("modulos_sin_cantidad.csv", CAMPOS[:-1], sin_cantidad)

print(f"Total exportado: {len(modulos)} módulos")