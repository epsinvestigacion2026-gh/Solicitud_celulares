<?php
declare(strict_types=1);
require_once __DIR__ . '/inc/admin-auth.php';
require_once __DIR__ . '/inc/requests.php';
startAdminSession();

function h(mixed $value): string {
    return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$error = '';
$users = [];
$admin = null;
$records = [];
$allRecords = [];
$filters = array_fill_keys(['region', 'finca', 'modulo', 'usuario', 'desde', 'hasta', 'q'], '');
$action = $_GET['action'] ?? '';
try {
    $users = adminUsers();
    $admin = currentAdmin($users);
    if ($admin === null && $action !== 'export') {
        header('Location: login.php', true, 303);
        exit;
    }
    if ($admin !== null) {
        $filters = requestFilters($_GET);
        $allRecords = readRequests();
        $records = filterRequests($allRecords, $filters);
    }
    if ($action === 'export') {
        if ($admin === null) {
            http_response_code(403);
            $error = 'Inicia sesión como administrador para descargar las solicitudes.';
        } elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            http_response_code(405);
            $error = 'Método no permitido.';
        } else {
            require_once __DIR__ . '/inc/export.php';
            downloadRequests($records);
        }
    }
} catch (InvalidArgumentException $exception) {
    http_response_code(400);
    $error = $exception->getMessage();
} catch (Throwable $exception) {
    error_log('Administración IMSA: ' . $exception->getMessage());
    http_response_code(500);
    $error = 'No fue posible cargar la información. Revisa la configuración y los permisos del servidor.';
}
$totalPeople = array_sum(array_column($records, 'personas_asignadas'));
$totalPhones = array_sum(array_column($records, 'celulares_solicitados'));
$farmChart = [];
foreach ($records as $record) {
    $key = (string)($record['region'] ?? '') . '|' . (string)($record['c_finca'] ?? '');
    if (!isset($farmChart[$key])) {
        $farmChart[$key] = [
            'name' => (string)($record['finca'] ?? ''),
            'region' => (string)($record['region'] ?? ''),
            'phones' => 0,
            'requests' => 0,
            'people' => 0,
        ];
    }
    $farmChart[$key]['phones'] += (int)($record['celulares_solicitados'] ?? 0);
    $farmChart[$key]['requests']++;
    $farmChart[$key]['people'] += (int)($record['personas_asignadas'] ?? 0);
}
uasort($farmChart, static fn($a, $b) => $b['phones'] <=> $a['phones'] ?: strnatcasecmp($a['name'], $b['name']));
$chartRows = array_values(array_slice($farmChart, 0, 10));
if (count($farmChart) > 10) {
    $others = ['name' => 'Otras fincas', 'region' => '', 'phones' => 0, 'requests' => 0, 'people' => 0];
    foreach (array_slice($farmChart, 10) as $farm) {
        $others['phones'] += $farm['phones'];
        $others['requests'] += $farm['requests'];
        $others['people'] += $farm['people'];
    }
    $chartRows[] = $others;
}
$chartMax = max(array_column($chartRows, 'phones') ?: [0]);
$regions = [];
$farms = [];
$modules = [];
$requesters = [];
foreach ($allRecords as $record) {
    $region = (string)($record['region'] ?? '');
    $farmKey = $region . '|' . (string)($record['c_finca'] ?? '');
    $moduleKey = requestModuleKey($record);
    $regions[$region] = $region;
    $farms[$farmKey] = ['label' => (string)$record['finca'] . ' · ' . $region . ' · finca ' . (string)$record['c_finca'], 'region' => $region];
    $modules[$moduleKey] = ['label' => (string)$record['codigo_modulo'] . ' · ' . (string)$record['finca'], 'region' => $region, 'farm' => $farmKey];
    if (!empty($record['usuario_registro'])) $requesters[(string)$record['usuario_registro']] = (string)$record['usuario_registro'];
}
natcasesort($regions);
uasort($farms, static fn($a, $b) => strnatcasecmp($a['label'], $b['label']));
uasort($modules, static fn($a, $b) => strnatcasecmp($a['label'], $b['label']));
natcasesort($requesters);
$activeFilters = array_filter($filters, static fn($value) => $value !== '');
$exportUrl = 'admin.php?' . http_build_query(['action' => 'export'] + $activeFilters, '', '&', PHP_QUERY_RFC3986);
?>
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Administración · Solicitudes de celulares</title>
  <link rel="stylesheet" href="assets/styles.css">
  <link rel="stylesheet" href="assets/admin.css"><link rel="stylesheet" href="assets/branding.css">
</head>
<body class="admin-body">
  <header class="admin-topbar">
    <a class="admin-brand" href="index.php"><span class="brand-logo"><img src="assets/img/mdg_logo.png" alt="Magdalena"></span></a>
    <a href="index.php">Volver al formulario <span aria-hidden="true">↗</span></a>
  </header>
  <main class="admin-main">
    <div class="eyebrow">ADMINISTRACIÓN</div>
    <h1><?= $admin === null ? 'Acceso restringido' : 'Solicitudes registradas' ?></h1>
    <p class="admin-intro"><?= $admin === null ? 'Se requiere el rol Administrador para consultar y descargar las solicitudes.' : 'Consulta los registros del formulario y descarga el detalle completo.' ?></p>
    <?php if ($error !== ''): ?><div class="alert admin-alert" role="alert"><?= h($error) ?></div><?php endif; ?>
    <?php if ($admin === null): ?>
      <a class="primary-button" href="login.php">Iniciar sesión</a>
    <?php else: ?>
      <div class="admin-toolbar">
        <span>Sesión: <strong><?= h($admin) ?></strong> · Administrador</span>
        <form method="post" action="login.php">
          <input type="hidden" name="action" value="logout">
          <input type="hidden" name="csrf" value="<?= h($_SESSION['admin_csrf']) ?>">
          <button class="admin-secondary" type="submit">Cerrar sesión</button>
        </form>
      </div>
      <section class="card admin-filters" aria-labelledby="filter-title">
        <div class="admin-filter-heading"><div><h2 id="filter-title">Filtrar solicitudes</h2><p>Combina ubicación, usuario y fechas para analizar los registros.</p></div><span><?= count($records) ?> de <?= count($allRecords) ?> solicitudes</span></div>
        <form method="get" action="admin.php" id="request-filters">
          <div class="admin-filter-grid">
            <label>Región<select name="region" id="filter-region"><option value="">Todas las regiones</option><?php foreach ($regions as $region): ?><option value="<?= h($region) ?>" <?= $filters['region'] === $region ? 'selected' : '' ?>><?= h($region) ?></option><?php endforeach; ?></select></label>
            <label>Finca<select name="finca" id="filter-farm"><option value="">Todas las fincas</option><?php foreach ($farms as $key => $farm): ?><option value="<?= h($key) ?>" data-region="<?= h($farm['region']) ?>" <?= $filters['finca'] === $key ? 'selected' : '' ?>><?= h($farm['label']) ?></option><?php endforeach; ?></select></label>
            <label>Módulo<select name="modulo" id="filter-module"><option value="">Todos los módulos</option><?php foreach ($modules as $key => $module): ?><option value="<?= h($key) ?>" data-region="<?= h($module['region']) ?>" data-farm="<?= h($module['farm']) ?>" <?= $filters['modulo'] === $key ? 'selected' : '' ?>><?= h($module['label']) ?></option><?php endforeach; ?></select></label>
            <label>Usuario solicitante<select name="usuario"><option value="">Todos los usuarios</option><?php foreach ($requesters as $username): ?><option value="<?= h($username) ?>" <?= $filters['usuario'] === $username ? 'selected' : '' ?>><?= h($username) ?></option><?php endforeach; ?></select></label>
            <label>Desde<input name="desde" type="date" value="<?= h($filters['desde']) ?>"></label>
            <label>Hasta<input name="hasta" type="date" value="<?= h($filters['hasta']) ?>"></label>
            <label class="admin-filter-search">Buscar referencia o colaborador<input name="q" type="search" maxlength="120" value="<?= h($filters['q']) ?>" placeholder="Referencia, nombre o código"></label>
          </div>
          <div class="admin-filter-actions"><button class="primary-button" type="submit">Aplicar filtros</button><a href="admin.php">Limpiar filtros</a></div>
        </form>
      </section>
      <div class="admin-metrics">
        <div class="card"><span>Solicitudes encontradas</span><strong><?= count($records) ?></strong></div>
        <div class="card"><span>Colaboradores en solicitudes</span><strong><?= $totalPeople ?></strong></div>
        <div class="card"><span>Celulares solicitados</span><strong><?= $totalPhones ?></strong></div>
      </div>
      <section class="card admin-chart" aria-labelledby="farm-chart-title">
        <div class="admin-chart-heading"><h2 id="farm-chart-title">Celulares solicitados por finca</h2><p>Hasta 10 fincas con más celulares. Las demás se agrupan en «Otras fincas». Se aplican los filtros actuales.</p></div>
        <?php if (!$chartRows): ?>
          <div class="admin-empty"><p>No hay solicitudes para mostrar en la gráfica.</p></div>
        <?php else: ?>
          <ol class="admin-chart-list">
            <?php foreach ($chartRows as $farm): ?>
              <li class="admin-chart-row" title="<?= h($farm['requests']) ?> solicitudes · <?= h($farm['people']) ?> colaboradores">
                <span class="admin-chart-label"><?= h($farm['name']) ?><?= $farm['region'] !== '' ? ' · ' . h($farm['region']) : '' ?></span>
                <div class="admin-chart-track"><span class="admin-chart-bar" style="width: <?= $chartMax > 0 ? round($farm['phones'] / $chartMax * 100, 2) : 0 ?>%"></span></div>
                <strong class="admin-chart-value"><?= $farm['phones'] ?></strong>
                <span class="admin-chart-detail"><?= $farm['requests'] ?> solicitudes · <?= $farm['people'] ?> colaboradores</span>
              </li>
            <?php endforeach; ?>
          </ol>
        <?php endif; ?>
      </section>
      <section class="card admin-records">
        <div class="admin-records-heading">
          <div><h2>Resultados</h2><p>El Excel incluye todas las solicitudes que coinciden con los filtros y sus colaboradores.</p></div>
          <a class="primary-button" href="<?= h($exportUrl) ?>">Descargar Excel <span aria-hidden="true">↓</span></a>
        </div>
        <?php if (!$records): ?>
          <div class="admin-empty"><h3><?= $allRecords ? 'No hay solicitudes con esos filtros' : 'Aún no hay solicitudes registradas' ?></h3><p><?= $allRecords ? 'Cambia o limpia los filtros para ver más resultados.' : 'Completa el formulario para registrar la primera solicitud. La descarga incluirá los encabezados mientras no haya registros.' ?></p></div>
        <?php else: ?>
          <div class="admin-table-wrap">
            <table>
              <caption>Mostrando hasta 50 de <?= count($records) ?> solicitudes. Fechas en horario de Guatemala.</caption>
              <thead><tr><th scope="col">Referencia</th><th scope="col">Usuario solicitante</th><th scope="col">Fecha</th><th scope="col">Región</th><th scope="col">Finca</th><th scope="col">Módulo</th><th scope="col">Personas</th><th scope="col">Celulares</th></tr></thead>
              <tbody>
                <?php foreach (array_slice(array_reverse($records), 0, 50) as $record): ?>
                  <tr><td><?= h($record['id']) ?></td><td><?= h($record['usuario_registro'] ?? '') ?></td><td><?= h(requestDate($record['fecha_registro'])->format('d/m/Y H:i')) ?></td><td><?= h($record['region']) ?></td><td><?= h($record['finca']) ?></td><td><?= h($record['codigo_modulo']) ?></td><td><?= (int)$record['personas_asignadas'] ?></td><td><?= (int)$record['celulares_solicitados'] ?></td></tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          </div>
        <?php endif; ?>
      </section>
    <?php endif; ?>
  </main>
  <script defer src="assets/admin-filters.js"></script>
</body>
</html>
