import argparse
import sys

from supabase import create_client

from jefes_oracle import consultar_jefes
from sincronizar_modulos import leer_env


def listar_usuarios(cliente):
    usuarios = {}
    pagina = 1
    por_pagina = 100

    while True:
        respuesta = cliente.auth.admin.list_users(
            page=pagina,
            per_page=por_pagina,
        )

        if isinstance(respuesta, (list, tuple)):
            lote = respuesta
        elif isinstance(respuesta, dict):
            lote = respuesta.get("users")
        else:
            lote = getattr(respuesta, "users", None)

        if lote is None:
            raise RuntimeError(
                "No se pudo interpretar la lista de usuarios de Supabase."
            )

        for usuario in lote:
            correo = (usuario.email or "").strip().lower()
            if not correo:
                continue

            if correo in usuarios:
                raise RuntimeError(
                    "Supabase devolvió cuentas repetidas para un correo."
                )

            usuarios[correo] = usuario

        if len(lote) < por_pagina:
            break

        pagina += 1

    return usuarios


def buscar_perfil(cliente, usuario_id):
    respuesta = (
        cliente.table("perfiles")
        .select("usuario_id,nombre,rol,region")
        .eq("usuario_id", usuario_id)
        .execute()
    )

    perfiles = respuesta.data or []

    if len(perfiles) > 1:
        raise RuntimeError(
            f"Hay más de un perfil para el usuario {usuario_id}."
        )

    return perfiles[0] if perfiles else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--aplicar",
        action="store_true",
        help="Crea las cuentas y perfiles que se puedan dar de alta.",
    )
    args = parser.parse_args()

    jefes = consultar_jefes()
    config = leer_env()

    cliente = create_client(
        config["SUPABASE_URL"],
        config["SUPABASE_SECRET_KEY"],
    )

    usuarios = listar_usuarios(cliente)
    plan = []

    cantidades = {
        "crear": 0,
        "completar": 0,
        "omitir": 0,
        "pendiente": 0,
    }

    # Revisa todos los jefes antes de realizar cambios.
    for jefe in jefes:
        usuario = usuarios.get(jefe["correo"])

        if usuario is None:
            usuario_id = None
            prefijo = jefe["correo"].split("@", 1)[0]

            if len(prefijo) < 6:
                accion = "pendiente"
            else:
                accion = "crear"
        else:
            usuario_id = usuario.id
            perfil = buscar_perfil(cliente, usuario_id)

            if perfil is None:
                accion = "completar"
            elif (
                perfil["rol"] == "jefe_produccion"
                and perfil["region"] == jefe["region"]
            ):
                accion = "omitir"
            else:
                raise RuntimeError(
                    "Una cuenta de Oracle ya existe en Supabase con "
                    "otro rol o región. No se modificó ninguna cuenta. "
                    f"Revisa el usuario con ID {usuario_id}."
                )

        plan.append((jefe, accion, usuario_id))
        cantidades[accion] += 1

    print(f"Jefes activos encontrados en Oracle: {len(jefes)}")
    print(f"Cuentas nuevas por crear: {cantidades['crear']}")
    print(f"Perfiles existentes por completar: {cantidades['completar']}")
    print(f"Cuentas completas que se conservarán: {cantidades['omitir']}")
    print(
        "Pendientes por contraseña de menos de 6 caracteres: "
        f"{cantidades['pendiente']}"
    )

    if not args.aplicar:
        print("Verificación terminada: no se modificó Supabase.")
        return

    creadas = 0
    completadas = 0
    por_procesar = cantidades["crear"] + cantidades["completar"]

    for jefe, accion, usuario_id in plan:
        if accion in ("omitir", "pendiente"):
            continue

        if accion == "crear":
            contrasena = jefe["correo"].split("@", 1)[0]

            try:
                respuesta = cliente.auth.admin.create_user({
                    "email": jefe["correo"],
                    "password": contrasena,
                    "email_confirm": True,
                })
            except Exception as error:
                raise RuntimeError(
                    "Falló la creación de una cuenta. Las anteriores "
                    "se conservan; puedes resolver el error y volver "
                    f"a ejecutar el script. Correo: {jefe['correo']}. "
                    f"Detalle: {error}"
                ) from error

            if respuesta.user is None or not respuesta.user.id:
                raise RuntimeError(
                    "Supabase no devolvió el ID de una cuenta creada. "
                    "Revisa Authentication antes de repetir el proceso."
                )

            usuario_id = respuesta.user.id
            creadas += 1

        try:
            cliente.table("perfiles").upsert(
                {
                    "usuario_id": usuario_id,
                    "nombre": jefe["nombre"],
                    "rol": "jefe_produccion",
                    "region": jefe["region"],
                },
                on_conflict="usuario_id",
            ).execute()
        except Exception as error:
            raise RuntimeError(
                "La cuenta existe, pero no se pudo guardar su perfil. "
                f"ID: {usuario_id}. Detalle: {error}. "
                "No repitas el alta individual con --crear; este script "
                "podrá completar el perfil al resolver el error."
            ) from error

        if accion == "completar":
            completadas += 1

        print(f"Procesados: {creadas + completadas} de {por_procesar}")

    print("Alta terminada.")
    print(f"Cuentas creadas: {creadas}")
    print(f"Perfiles completados: {completadas}")
    print(f"Cuentas que ya estaban correctas: {cantidades['omitir']}")
    print(f"Cuentas pendientes: {cantidades['pendiente']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)