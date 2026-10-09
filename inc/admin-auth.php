<?php
declare(strict_types=1);

function adminUsers(): array {
    $path = __DIR__ . '/../data/admin-users.json';
    if (!is_file($path)) return [];
    $users = json_decode((string)file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($users)) throw new RuntimeException('Archivo de usuarios no válido.');
    return $users;
}

function startAdminSession(): void {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('imsa_admin');
    session_set_cookie_params([
        'lifetime' => 0, 'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true, 'samesite' => 'Strict',
    ]);
    session_start();
    if (!isset($_SESSION['admin_csrf'])) $_SESSION['admin_csrf'] = bin2hex(random_bytes(32));
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: same-origin');
}

function currentUser(array $users): ?array {
    $name = $_SESSION['admin_user'] ?? null;
    $user = is_string($name) ? ($users[$name] ?? null) : null;
    if (!is_array($user) || !in_array($user['role'] ?? '', ['admin', 'jefe_produccion'], true)
        || time() - ($_SESSION['admin_last_seen'] ?? 0) > 1800
        || !hash_equals(hash('sha256', $user['password_hash']), (string)($_SESSION['admin_version'] ?? ''))) {
        unset($_SESSION['admin_user'], $_SESSION['admin_version'], $_SESSION['admin_last_seen']);
        return null;
    }
    $_SESSION['admin_last_seen'] = time();
    return ['username' => $name, 'role' => $user['role']];
}

function currentAdmin(array $users): ?string {
    $user = currentUser($users);
    return $user !== null && $user['role'] === 'admin' ? $user['username'] : null;
}

function checkAdminCsrf(): bool {
    return is_string($_POST['csrf'] ?? null)
        && hash_equals($_SESSION['admin_csrf'], $_POST['csrf']);
}

// El bloqueo se guarda en el servidor, por lo que borrar cookies no reinicia los intentos.
function loginUser(string $name, string $password, array $users): bool {
    $file = fopen(__DIR__ . '/../data/admin-login-attempts.json', 'c+');
    if ($file === false) throw new RuntimeException('No se pudo abrir el control de acceso.');
    try {
        if (!flock($file, LOCK_EX)) throw new RuntimeException('No se pudo bloquear el control de acceso.');
        $contents = stream_get_contents($file);
        $attempts = $contents === '' ? [] : json_decode($contents, true, 512, JSON_THROW_ON_ERROR);
        $now = time();
        foreach ($attempts as $key => $times) {
            $attempts[$key] = array_values(array_filter($times, static fn($time) => $time > $now - 900));
            if (!$attempts[$key]) unset($attempts[$key]);
        }
        $key = hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'local'));
        if (count($attempts[$key] ?? []) >= 5) {
            http_response_code(429);
            return false;
        }
        $user = $users[$name] ?? null;
        // Hash ficticio para que un nombre inexistente también ejecute la verificación.
        $hash = $user['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
        $valid = password_verify($password, $hash) && in_array($user['role'] ?? '', ['admin', 'jefe_produccion'], true);
        if ($valid) unset($attempts[$key]);
        else $attempts[$key][] = $now;
        $json = json_encode($attempts, JSON_THROW_ON_ERROR);
        rewind($file);
        if (!ftruncate($file, 0) || fwrite($file, $json) !== strlen($json) || !fflush($file)) {
            throw new RuntimeException('No se pudo actualizar el control de acceso.');
        }
    } finally {
        flock($file, LOCK_UN);
        fclose($file);
    }
    if (!$valid) return false;
    session_regenerate_id(true);
    $_SESSION['admin_user'] = $name;
    $_SESSION['admin_version'] = hash('sha256', $hash);
    $_SESSION['admin_last_seen'] = time();
    $_SESSION['admin_csrf'] = bin2hex(random_bytes(32));
    return true;
}

function logoutAdmin(): void {
    $_SESSION = [];
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600, 'path' => $params['path'],
        'secure' => $params['secure'], 'httponly' => true, 'samesite' => 'Strict',
    ]);
    session_destroy();
}
