<?php
declare(strict_types=1);

require_once __DIR__ . '/inc/admin-auth.php';
require_once __DIR__ . '/inc/requests.php';
startAdminSession();
try {
    $signedIn = currentUser(adminUsers());
} catch (Throwable $e) {
    http_response_code(500);
    exit('No fue posible verificar el acceso.');
}
if ($signedIn === null) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'message' => 'Inicia sesión para registrar una solicitud.']);
        exit;
    }
    header('Location: login.php', true, 303);
    exit;
}
if (!isset($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

function catalogoDesdePython(): array {
    $python = __DIR__ . '/.venv/Scripts/python.exe';
    $script = __DIR__ . '/scripts/catalogo_oracle.py';

    if (!is_file($python) || !is_file($script)) {
        throw new RuntimeException('Falta Python o catalogo_oracle.py.');
    }

    $proceso = proc_open(
        [$python, $script],
        [
            0 => ['pipe', 'r'],
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ],
        $tuberias,
        __DIR__,
        null,
        ['bypass_shell' => true]
    );

    if (!is_resource($proceso)) {
        throw new RuntimeException('No se pudo iniciar la consulta Oracle.');
    }

    fclose($tuberias[0]);
    $salida = stream_get_contents($tuberias[1]);
    fclose($tuberias[1]);
    $errores = stream_get_contents($tuberias[2]);
    fclose($tuberias[2]);
    $codigo = proc_close($proceso);

    if ($codigo !== 0) {
        throw new RuntimeException(
            trim($errores) ?: 'La consulta Oracle terminó con un error.'
        );
    }

    $modulos = json_decode($salida, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($modulos) || !array_is_list($modulos)) {
        throw new RuntimeException('Oracle no devolvió un catálogo válido.');
    }

    return $modulos;
}

function catalogo(): array {
    $archivoEnv = __DIR__ . '/.env';
    $config = [];

    if (is_file($archivoEnv)) {
        $lineas = file($archivoEnv, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);

        if ($lineas === false) {
            throw new RuntimeException('No se pudo leer .env');
        }

        foreach ($lineas as $linea) {
            $linea = trim($linea);

            if ($linea === '' || str_starts_with($linea, '#')) {
                continue;
            }

            $partes = explode('=', $linea, 2);

            if (count($partes) === 2) {
                $config[trim($partes[0])] = trim($partes[1]);
            }
        }
    }

    if (($config['ORACLE_ENABLED'] ?? '0') !== '1') {
        $filas = json_decode(
            (string) file_get_contents(__DIR__ . '/data/demo.json'),
            true,
            512,
            JSON_THROW_ON_ERROR
        );

        return [$filas, true];
    }

    return [catalogoDesdePython(), false];
}

function claveModulo(array $r): string {
    return (string)$r['region'] . '|' . (string)$r['c_finca'] . '|' . (string)$r['codigo_modulo'];
}

function responder(int $status, array $body): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    exit;
}

try {
    [$rows, $isDemo] = catalogo();
} catch (Throwable $e) {
    http_response_code(500);
    exit('Error al cargar los módulos: ' .
        htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8'));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($_SESSION['csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
        responder(403, ['ok' => false, 'message' => 'La sesión expiró. Recarga la página.']);
    }
    $payload = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($payload)) responder(400, ['ok' => false, 'message' => 'Solicitud no válida.']);
    $key = (string)($payload['module_key'] ?? '');
    $found = null;
    foreach ($rows as $row) {
        if (claveModulo($row) === $key) { $found = $row; break; }
    }
    if ($found === null) responder(422, ['ok' => false, 'message' => 'El módulo seleccionado ya no está disponible.']);
    $rawCount = $found['personas_asignadas'];
    if ($rawCount === null || !filter_var($rawCount, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]])) {
        responder(422, ['ok' => false, 'message' => 'El módulo no tiene una cantidad válida de personas asignadas.']);
    }
    $count = (int)$rawCount;
    $people = $payload['colaboradores'] ?? null;
    $devices = $payload['celulares'] ?? null;
    $deviceCount = (int)ceil($count / 2);
    if (!is_array($people) || count($people) !== $count || !is_array($devices) || count($devices) !== $deviceCount) {
        responder(422, ['ok' => false, 'message' => 'La cantidad de colaboradores o celulares no coincide con la asignación.']);
    }
    $cleanPeople = [];
    $codes = [];
    foreach ($people as $person) {
        $name = trim((string)($person['nombre'] ?? ''));
        $code = trim((string)($person['codigo'] ?? ''));
        if ($name === '' || $code === '' || mb_strlen($name) > 120 || mb_strlen($code) > 40) {
            responder(422, ['ok' => false, 'message' => 'Completa el nombre y código de cada colaborador.']);
        }
        $norm = mb_strtolower($code);
        if (isset($codes[$norm])) responder(422, ['ok' => false, 'message' => 'Hay códigos de colaborador repetidos.']);
        $codes[$norm] = true;
        $cleanPeople[] = ['nombre' => $name, 'codigo' => $code];
    }
    $cleanDevices = [];
    foreach ($devices as $device) {
        $inventory = trim((string)($device['inventario'] ?? ''));
        if (mb_strlen($inventory) > 80) responder(422, ['ok' => false, 'message' => 'El identificador de celular es demasiado largo.']);
        $cleanDevices[] = ['inventario' => $inventory];
    }
    $record = [
        'id' => bin2hex(random_bytes(8)), 'fecha_registro' => gmdate('c'),
        'usuario_registro' => $signedIn['username'],
        'region' => $found['region'], 'c_finca' => $found['c_finca'], 'finca' => $found['finca'],
        'codigo_modulo' => $found['codigo_modulo'], 'tipo_riego' => $found['tipo_riego'],
        'personas_asignadas' => $count, 'celulares_solicitados' => $deviceCount,
        'colaboradores' => $cleanPeople, 'celulares' => $cleanDevices,
    ];
    try {
        if (!registerRequest($record)) {
            responder(409, ['ok' => false, 'message' => 'Este módulo ya tiene una solicitud registrada. Actualiza la página para ver las opciones disponibles.']);
        }
    } catch (Throwable $e) {
        error_log('Registro IMSA: ' . $e->getMessage());
        responder(500, ['ok' => false, 'message' => 'No fue posible guardar el registro. Revisa los permisos de data/.']);
    }

    
    responder(201, ['ok' => true, 'id' => $record['id'], 'message' => 'Solicitud registrada correctamente.']);
}

try {
    $processed = processedModuleKeys(readRequests());
} catch (Throwable $e) {
    error_log('Catálogo IMSA: ' . $e->getMessage());
    http_response_code(500);
    exit('No fue posible cargar las solicitudes registradas.');
}
$available = array_values(array_filter($rows, static fn(array $row): bool => !isset($processed[claveModulo($row)])));
$config = [
    'records' => $available, 'demo' => $isDemo, 'preview' => false,
    'csrf' => $_SESSION['csrf'], 'submitUrl' => 'index.php', 'role' => $signedIn['role'],
];
$json = json_encode($config, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR);
$html = (string)file_get_contents(__DIR__ . '/view.html');
if ($signedIn['role'] !== 'admin') {
    $html = preg_replace('~<a class="nav-item admin-nav-link".*?</a>~s', '', $html, 1);
    $html = preg_replace('~<a class="admin-mobile-link".*?</a>~s', '', $html, 1);
}
$html = str_replace('<!-- SIGNED_IN_USER -->', htmlspecialchars($signedIn['username'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'), $html);
$html = str_replace('<!-- LOGOUT_CSRF -->', htmlspecialchars($_SESSION['admin_csrf'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'), $html);
echo str_replace('<!-- APP_CONFIG -->', '<script>window.APP_CONFIG = ' . $json . ';</script>', $html);
