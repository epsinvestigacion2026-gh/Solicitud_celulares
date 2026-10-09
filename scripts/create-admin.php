<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

$name = $argv[1] ?? 'admin';
$role = in_array('jefe_produccion', $argv, true) ? 'jefe_produccion' : 'admin';
if (!preg_match('/^[A-Za-z0-9_.-]{3,40}$/D', $name)) {
    fwrite(STDERR, "El usuario debe tener entre 3 y 40 letras, números, puntos o guiones.\n");
    exit(1);
}
$password = getenv('IMSA_ADMIN_PASSWORD');
$generated = $password === false || $password === '';
if ($generated) $password = 'IMSA-' . bin2hex(random_bytes(8)) . '!';
if (strlen($password) < 12 || strlen($password) > 72) {
    fwrite(STDERR, "La contraseña debe tener entre 12 y 72 bytes.\n");
    exit(1);
}
$path = __DIR__ . '/../data/admin-users.json';
$file = fopen($path, 'c+');
if ($file === false || !flock($file, LOCK_EX)) {
    fwrite(STDERR, "No se pudo abrir el archivo de usuarios.\n");
    exit(1);
}
try {
    $contents = stream_get_contents($file);
    $users = $contents === '' ? [] : json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
    if (isset($users[$name]) && !in_array('--reset', $argv, true)) {
        fwrite(STDERR, "El usuario ya existe. Usa --reset para cambiar su contraseña.\n");
        exit(1);
    }
    $users[$name] = ['role' => $role, 'password_hash' => password_hash($password, PASSWORD_DEFAULT)];
    $json = json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
    rewind($file);
    if (!ftruncate($file, 0) || fwrite($file, $json) !== strlen($json) || !fflush($file)) {
        throw new RuntimeException('No se pudo guardar el usuario.');
    }
} finally {
    flock($file, LOCK_UN);
    fclose($file);
}
echo "Usuario creado: $name (" . ($role === 'admin' ? 'Administrador' : 'Jefe de producción') . ")\n";
if ($generated) echo "Contraseña temporal: $password\n";
else echo "Contraseña establecida desde IMSA_ADMIN_PASSWORD.\n";
