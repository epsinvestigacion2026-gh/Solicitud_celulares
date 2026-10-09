<?php
declare(strict_types=1);
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$path = str_replace('\\', '/', $path);
if (preg_match('~(^|/)(?:data|inc|scripts|tests|vendor|\.[^/]*)(?:/|$)~i', $path) || preg_match('~/(?:config(?:\.example)?\.php|composer\.(?:json|lock)|view\.html|router\.php|README\.md)$~i', $path)) {
    http_response_code(404);
    exit('No encontrado');
}
if ($path === '/') {
    require __DIR__ . '/index.php';
    return true;
}
return false;
