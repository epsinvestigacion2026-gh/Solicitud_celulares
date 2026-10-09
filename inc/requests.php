<?php
declare(strict_types=1);

function requestModuleKey(array $record): string {
    return (string)$record['region'] . '|' . (string)$record['c_finca'] . '|' . (string)$record['codigo_modulo'];
}

function processedModuleKeys(array $records): array {
    $keys = [];
    foreach ($records as $record) {
        if (isset($record['region'], $record['c_finca'], $record['codigo_modulo'])) {
            $keys[requestModuleKey($record)] = true;
        }
    }
    return $keys;
}

function readRequests(): array {
    $path = __DIR__ . '/../data/solicitudes.jsonl';
    if (!is_file($path)) return [];
    $file = fopen($path, 'rb');
    if ($file === false) throw new RuntimeException('No se pudieron leer las solicitudes.');
    $records = [];
    try {
        if (!flock($file, LOCK_SH)) throw new RuntimeException('No se pudo bloquear la lectura.');
        while (($line = fgets($file)) !== false) {
            if (trim($line) === '') continue;
            $record = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
            if (!is_array($record) || !isset($record['id'], $record['fecha_registro'], $record['colaboradores'])
                || !is_array($record['colaboradores'])) {
                throw new RuntimeException('Hay una solicitud con formato no válido.');
            }
            $records[] = $record;
        }
        if (!feof($file)) throw new RuntimeException('No se pudo completar la lectura.');
    } finally {
        flock($file, LOCK_UN);
        fclose($file);
    }
    return $records;
}

function registerRequest(array $record): bool {
    $file = fopen(__DIR__ . '/../data/solicitudes.jsonl', 'c+');
    if ($file === false) throw new RuntimeException('No se pudo abrir el registro de solicitudes.');
    try {
        if (!flock($file, LOCK_EX)) throw new RuntimeException('No se pudo bloquear el registro de solicitudes.');
        rewind($file);
        while (($line = fgets($file)) !== false) {
            if (trim($line) === '') continue;
            $existing = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
            if (is_array($existing) && isset($existing['region'], $existing['c_finca'], $existing['codigo_modulo'])
                && requestModuleKey($existing) === requestModuleKey($record)) {
                return false;
            }
        }
        if (!feof($file)) throw new RuntimeException('No se pudo revisar el registro de solicitudes.');
        $position = ftell($file);
        if ($position === false) throw new RuntimeException('No se pudo preparar el registro de solicitudes.');
        $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
        if (fwrite($file, $line) !== strlen($line) || !fflush($file)) {
            ftruncate($file, $position);
            throw new RuntimeException('No se pudo guardar la solicitud.');
        }
        return true;
    } finally {
        flock($file, LOCK_UN);
        fclose($file);
    }
}

function requestDate(string $value): DateTimeImmutable {
    return (new DateTimeImmutable($value))->setTimezone(new DateTimeZone('America/Guatemala'));
}

function requestFilters(array $query): array {
    $filters = [];
    foreach (['region', 'finca', 'modulo', 'usuario', 'desde', 'hasta', 'q'] as $key) {
        $value = $query[$key] ?? '';
        if (!is_string($value) || mb_strlen($value) > 120) {
            throw new InvalidArgumentException('Los filtros no son válidos.');
        }
        $filters[$key] = trim($value);
    }
    foreach (['desde', 'hasta'] as $key) {
        if ($filters[$key] === '') continue;
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $filters[$key], new DateTimeZone('America/Guatemala'));
        if ($date === false || $date->format('Y-m-d') !== $filters[$key]) {
            throw new InvalidArgumentException('Ingresa fechas válidas con formato AAAA-MM-DD.');
        }
    }
    if ($filters['desde'] !== '' && $filters['hasta'] !== '' && $filters['desde'] > $filters['hasta']) {
        throw new InvalidArgumentException('La fecha inicial no puede ser posterior a la fecha final.');
    }
    return $filters;
}

function filterRequests(array $records, array $filters): array {
    return array_values(array_filter($records, static function (array $record) use ($filters): bool {
        if ($filters['region'] !== '' && (string)($record['region'] ?? '') !== $filters['region']) return false;
        if ($filters['finca'] !== '' && (string)($record['region'] ?? '') . '|' . (string)($record['c_finca'] ?? '') !== $filters['finca']) return false;
        if ($filters['modulo'] !== '' && requestModuleKey($record) !== $filters['modulo']) return false;
        $username = (string)($record['usuario_registro'] ?? '');
        if ($filters['usuario'] !== '' && $username !== $filters['usuario']) return false;
        if ($filters['desde'] !== '' || $filters['hasta'] !== '') {
            $localDate = requestDate((string)$record['fecha_registro'])->format('Y-m-d');
            if ($filters['desde'] !== '' && $localDate < $filters['desde']) return false;
            if ($filters['hasta'] !== '' && $localDate > $filters['hasta']) return false;
        }
        if ($filters['q'] !== '') {
            $values = [$record['id'] ?? '', $record['region'] ?? '', $record['finca'] ?? '',
                $record['codigo_modulo'] ?? '', $username];
            foreach ($record['colaboradores'] ?? [] as $person) {
                $values[] = $person['nombre'] ?? '';
                $values[] = $person['codigo'] ?? '';
            }
            if (mb_stripos(implode(' ', $values), $filters['q']) === false) return false;
        }
        return true;
    }));
}
