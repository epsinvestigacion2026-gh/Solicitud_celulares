import argparse
import getpass
import sys

from supabase import create_client

from alta_jefes import listar_usuarios
from jefes_oracle import consultar_jefes
from sincronizar_modulos import leer_env


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--correo", required=True)
    parser.add_argument(
        "--crear",
        action="store_true",
        help="Crea la cuenta pendiente y su perfil.",
    )
    args = parser.parse_args()

    correo = args.correo.strip().lower()
    encontrados = [
        jefe for jefe in consultar_jefes()
        if jefe["correo"] == correo
    ]

    if len(encontrados) != 1:
        raise RuntimeError(
            "El correo no corresponde a un único jefe activo en Oracle."
        )

    jefe = encontrados[0]
    prefijo = correo.split("@", 1)[0]

    if len(prefijo) >= 6:
        raise RuntimeError(
            "Este correo no necesita la excepción de contraseña."
        )

    config = leer_env()
    cliente = create_client(
        config["SUPABASE_URL"],
        config["SUPABASE_SECRET_KEY"],
    )

    if correo in listar_usuarios(cliente):
        raise RuntimeError(
            "La cuenta ya existe en Authentication. No se creó otra."
        )

    print("Jefe pendiente encontrado en Oracle.")
    print(f"Región asignada: {jefe['region']}")

    if not args.crear:
        print("Verificación terminada: no se creó ninguna cuenta.")
        return

    contrasena = getpass.getpass(
        "Contraseña excepcional (mínimo 6 caracteres): "
    )
    confirmacion = getpass.getpass(
        "Repite la contraseña: "
    )

    if contrasena != confirmacion:
        raise RuntimeError("Las contraseñas no coinciden.")

    if len(contrasena) < 6:
        raise RuntimeError(
            "La contraseña debe tener al menos 6 caracteres."
        )

    try:
        respuesta = cliente.auth.admin.create_user({
            "email": correo,
            "password": contrasena,
            "email_confirm": True,
        })
    except Exception as error:
        raise RuntimeError(
            f"No se pudo crear la cuenta: {error}"
        ) from error

    if respuesta.user is None or not respuesta.user.id:
        raise RuntimeError(
            "Supabase no devolvió el ID. Revisa Authentication "
            "antes de repetir este comando."
        )

    usuario_id = respuesta.user.id

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
            "La cuenta se creó, pero falló el perfil. "
            f"ID: {usuario_id}. Detalle: {error}. "
            "No vuelvas a ejecutar --crear."
        ) from error

    print("Cuenta y perfil creados correctamente.")
    print(f"ID del usuario: {usuario_id}")
    print(f"Región: {jefe['region']}")
    print("La contraseña excepcional no se guardó en ningún archivo.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)