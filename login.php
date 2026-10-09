<?php
declare(strict_types=1);
require_once __DIR__ . '/inc/admin-auth.php';
startAdminSession();
$error = '';
try {
    $users = adminUsers();
    $user = currentUser($users);
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!checkAdminCsrf()) {
            http_response_code(403);
            $error = 'La sesión expiró. Recarga la página e intenta de nuevo.';
        } elseif (($_POST['action'] ?? '') === 'logout') {
            logoutAdmin();
            header('Location: login.php', true, 303);
            exit;
        } elseif (($_POST['action'] ?? '') === 'login') {
            $username = is_string($_POST['username'] ?? null) ? trim($_POST['username']) : '';
            $password = is_string($_POST['password'] ?? null) ? $_POST['password'] : '';
            if (strlen($username) <= 40 && strlen($password) <= 72 && loginUser($username, $password, $users)) {
                header('Location: ' . (($users[$username]['role'] ?? '') === 'admin' ? 'admin.php' : 'index.php'), true, 303);
                exit;
            }
            if (http_response_code() === 429) $error = 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.';
            else { http_response_code(401); $error = 'Usuario o contraseña incorrectos.'; }
        }
    } elseif ($user !== null) {
        header('Location: ' . ($user['role'] === 'admin' ? 'admin.php' : 'index.php'), true, 303);
        exit;
    }
} catch (Throwable $exception) {
    error_log('Acceso IMSA: ' . $exception->getMessage());
    http_response_code(500);
    $error = 'No fue posible iniciar sesión. Revisa la configuración y los permisos del servidor.';
}
function loginEscape(string $value): string {
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Iniciar sesión · Solicitudes de celulares</title>
  <link rel="stylesheet" href="assets/styles.css"><link rel="stylesheet" href="assets/admin.css"><link rel="stylesheet" href="assets/branding.css">
</head>
<body class="admin-body">
  <header class="admin-topbar"><span class="admin-brand"><span class="brand-logo"><img src="assets/img/mdg_logo.png" alt="Magdalena"></span></span></header>
  <main class="admin-main admin-login">
    <div class="eyebrow">SOLICITUD DE CELULARES</div>
    <h1>Iniciar sesión</h1>
    <p class="admin-intro">Ingresa con tu usuario para registrar solicitudes.</p>
    <?php if ($error !== ''): ?><div class="alert admin-alert" role="alert"><?= loginEscape($error) ?></div><?php endif; ?>
    <form class="card admin-login-card" method="post" action="login.php">
      <input type="hidden" name="action" value="login"><input type="hidden" name="csrf" value="<?= loginEscape($_SESSION['admin_csrf']) ?>">
      <label class="field" for="username"><span class="field-label">Usuario</span><input id="username" name="username" autocomplete="username" maxlength="40" required autofocus></label>
      <label class="field" for="password"><span class="field-label">Contraseña</span><input id="password" name="password" type="password" autocomplete="current-password" maxlength="72" required></label>
      <button class="primary-button" type="submit">Iniciar sesión <span aria-hidden="true"></span></button>
    </form>
  </main>
</body>
</html>
