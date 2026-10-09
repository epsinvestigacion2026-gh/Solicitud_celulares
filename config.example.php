<?php
// Copiar como config.php y adaptar nombres/credenciales a la BD real.
// Si no existe config.php se usan las filas de data/demo.json.
return [
    'dsn' => 'mysql:host=localhost;port=3306;dbname=mi_base;charset=utf8mb4',
    'username' => 'usuario_lectura',
    'password' => 'contraseña',
    'table' => 'asignaciones_modulo',
];
