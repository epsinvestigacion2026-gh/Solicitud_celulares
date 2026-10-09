# Prototipo de solicitud de celulares

Interfaz en PHP y JavaScript para seleccionar región, finca y módulo, capturar los colaboradores asignados y calcular **⌈ personas asignadas / 2 ⌉** celulares. El cálculo contempla un celular cuando queda una persona sin pareja. Los módulos con 0 personas o valor nulo se muestran, pero no permiten registrar una solicitud.

Los módulos con solicitud registrada dejan de aparecer en el formulario. Cuando una finca ya no tiene módulos pendientes, también desaparece; lo mismo ocurre con una región sin fincas disponibles. El formulario actualiza las opciones después de guardar, y el servidor rechaza un segundo registro del mismo módulo aunque se envíe desde una página que quedó abierta. Las vistas previas HTML simulan este comportamiento durante la sesión de la página; al recargarlas vuelve el catálogo de ejemplo porque no guardan datos.

## Revisar la interfaz

- Abre `preview.html` directamente en un navegador. Permite probar el flujo y simula la confirmación, sin guardar información.
- Para probar el guardado, inicia `php -S localhost:8000 router.php` dentro de esta carpeta y abre `http://localhost:8000/login.php`. Requiere PHP 8.1+ con `mbstring`; el modo de ejemplo no requiere MySQL. El servidor debe poder escribir en `data/`.

## Administrador y descarga de Excel

El formulario requiere iniciar sesión. El rol `jefe_produccion` puede registrar solicitudes. El rol `admin` puede registrar solicitudes, consultar las registradas y descargar los Excel. Los permisos se verifican en el servidor en cada petición.

1. Ejecuta `composer install` dentro de esta carpeta para instalar las dependencias de exportación. Composer comprueba las extensiones PHP requeridas, incluidas `zip`, `gd`, `dom` y `mbstring`.
2. Crea el administrador con `php scripts/create-admin.php admin` y un jefe de producción con `php scripts/create-admin.php jefe_demo jefe_produccion`. Cada comando genera una contraseña y la muestra una sola vez. Si un usuario ya existe, añade `--reset` para generar otra. También puedes establecer `IMSA_ADMIN_PASSWORD` antes de ejecutar el comando para elegirla (12 a 72 bytes).
3. Inicia el servidor PHP indicado arriba y abre `http://localhost:8000/login.php`. El jefe entra al formulario. El administrador entra al panel y puede ir al formulario para registrar solicitudes.
4. El administrador pulsa **Descargar Excel** en el panel. El archivo `.xlsx` incluye todas las solicitudes, aunque el panel muestre solo las últimas 50.

El panel de administración permite filtrar por región, finca, módulo, usuario solicitante y un rango de fechas (en horario de Guatemala). También tiene un buscador de referencia, módulo, nombre o código de colaborador. Los indicadores y la tabla muestran el resultado filtrado; la tabla presenta hasta 50 solicitudes recientes del conjunto. **Descargar Excel** incluye todas las solicitudes que coinciden con los filtros activos y sus colaboradores. **Limpiar filtros** recupera la vista completa.

El Excel contiene tres hojas: **Solicitudes**, con referencia, usuario solicitante, fecha y hora de Guatemala, región, finca, módulo, tipo de riego y cantidades; **Colaboradores**, con referencia de solicitud, número de celular dentro de la solicitud, posición, nombre y código; y **Detalle completo**, que combina referencia, usuario solicitante, fecha, región, finca, módulo y tipo de riego con el nombre y código de cada colaborador. El usuario solicitante aparece inmediatamente después de la referencia en **Solicitudes** y **Detalle completo**. Cada fila de **Detalle completo** corresponde a un colaborador. Esta hoja excluye código de finca, personas asignadas y celulares solicitados. Los códigos de colaborador se conservan como texto, incluidos sus ceros iniciales. Los nombres y códigos no se ejecutan como fórmulas. Sin registros, el archivo contiene únicamente los encabezados.

El servidor toma el usuario solicitante directamente de la sesión autenticada y lo guarda en `usuario_registro`. El formulario no pide el nombre ni el código de un jefe. Las solicitudes anteriores sin `usuario_registro` muestran vacía la columna de usuario; los valores manuales guardados anteriormente no se usan para atribuir autoría.

Las contraseñas se guardan como hashes en `data/admin-users.json`. La sesión caduca tras 30 minutos sin actividad. Después de cinco accesos fallidos por dirección IP en 15 minutos, se bloquean nuevos intentos hasta que salgan de esa ventana. Cambiar la contraseña o retirar el rol invalida las sesiones existentes.

El acceso administrativo requiere un servidor PHP: las vistas previas HTML solo simulan el formulario. Su enlace **Administración** abre el servidor local en `http://127.0.0.1:8000/admin.php` cuando se abren desde el disco. Las solicitudes simuladas no aparecen en el Excel; usa `index.php` para guardar. El usuario `admin` del prototipo sirve para probar el flujo; crea cuentas individuales para el uso real. Al publicar, usa HTTPS y conserva las restricciones de acceso a `data/`, `inc/`, `scripts/`, `tests/` y `vendor/`. El router incluido aplica estas restricciones en el servidor PHP de desarrollo; Apache necesita `mod_rewrite` y permisos para aplicar `.htaccess`. En otros servidores configura reglas equivalentes.

Para verificar el flujo en una copia temporal, ejecuta `python tests/admin_integration.py --php /ruta/al/php`. Comprueba registro, acceso, permisos, bloqueo de intentos y contenido del Excel sin alterar los registros reales.

## Conectar la base de datos

1. Copia `config.example.php` como `config.php` y escribe las credenciales de tu base MySQL (extensión `pdo_mysql`).
2. Establece en `table` el **nombre real de la tabla o vista**. Las capturas muestran las columnas, pero no el nombre de la tabla. Si los nombres de columnas son distintos, ajusta el `SELECT` en `index.php`.
3. Comprueba que cada fila represente un solo módulo. La clave actual combina `REGION`, `C_FINCA` y `CODIGO_MODULO`.

La lista de ejemplo (`data/demo.json`) contiene solo filas legibles de las capturas, no la base completa. `PERSONAS_ASIGNADAS` siempre se vuelve a consultar del lado del servidor antes de guardar. Los datos reales de solicitud se guardan en `data/solicitudes.jsonl` (una línea JSON por registro), con fecha UTC, región, finca, módulo, colaboradores y equipos. El archivo `router.php` bloquea el acceso HTTP a `data/` y `config.php` cuando usas el servidor PHP indicado; `.htaccess` bloquea `data/` si despliegas con Apache. Para otro servidor, configura la misma restricción antes de utilizar datos reales. Este archivo es una solución para validar el flujo; al pasar a producción conviene guardar las solicitudes en tablas transaccionales con usuarios y permisos.

**Regla pendiente de confirmar:** para cantidades impares, el prototipo redondea hacia arriba (5 personas ⇒ 3 celulares).

El formulario de solicitud no captura inventario ni IMEI. Ese dato corresponde a la asignación de un equipo específico. Por compatibilidad con el formato de guardado actual, cada celular solicitado conserva el campo `inventario` vacío.
