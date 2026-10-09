<?php
declare(strict_types=1);

use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Shared\Date;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/requests.php';

function exportText(Worksheet $sheet, string $cell, mixed $value): void {
    // Preserva ceros iniciales y evita interpretar datos del usuario como fórmulas.
    $sheet->setCellValueExplicit($cell, (string)$value, DataType::TYPE_STRING);
}

function formatExportSheet(Worksheet $sheet, array $headers, array $widths, string $lastColumn, int $lastRow): void {
    foreach ($headers as $index => $header) {
        $column = chr(65 + $index);
        exportText($sheet, $column . '1', $header);
        $sheet->getColumnDimension($column)->setWidth($widths[$index]);
    }
    $sheet->getStyle('A1:' . $lastColumn . '1')->applyFromArray([
        'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
        'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '174238']],
        'alignment' => ['wrapText' => true, 'vertical' => 'center'],
    ]);
    $sheet->getRowDimension(1)->setRowHeight(32);
    $sheet->freezePane('A2');
    $sheet->setAutoFilter('A1:' . $lastColumn . $lastRow);
    $sheet->setShowGridlines(false);
}

function buildRequestsWorkbook(array $records): Spreadsheet {
    $book = new Spreadsheet();
    $book->getProperties()->setCreator('IMSA')->setTitle('Solicitudes de celulares');
    $book->getDefaultStyle()->getFont()->setName('Calibri')->setSize(11);
    $summary = $book->getActiveSheet();
    $summary->setTitle('Solicitudes');
    $people = $book->createSheet();
    $people->setTitle('Colaboradores');
    $combined = $book->createSheet();
    $combined->setTitle('Detalle completo');
    $row = 2;
    $personRow = 2;
    foreach ($records as $record) {
        $registeredAt = Date::PHPToExcel(requestDate($record['fecha_registro']));
        exportText($summary, 'A' . $row, $record['id']);
        exportText($summary, 'B' . $row, $record['usuario_registro'] ?? '');
        $summary->setCellValue('C' . $row, $registeredAt);
        foreach (['D' => 'region', 'E' => 'c_finca', 'F' => 'finca', 'G' => 'codigo_modulo', 'H' => 'tipo_riego'] as $column => $key) {
            exportText($summary, $column . $row, $record[$key] ?? '');
        }
        $summary->setCellValue('I' . $row, (int)$record['personas_asignadas']);
        $summary->setCellValue('J' . $row, (int)$record['celulares_solicitados']);
        foreach (array_values($record['colaboradores']) as $index => $person) {
            exportText($people, 'A' . $personRow, $record['id']);
            $people->setCellValue('B' . $personRow, intdiv($index, 2) + 1);
            $people->setCellValue('C' . $personRow, $index + 1);
            exportText($people, 'D' . $personRow, $person['nombre']);
            exportText($people, 'E' . $personRow, $person['codigo']);
            exportText($combined, 'A' . $personRow, $record['id']);
            exportText($combined, 'B' . $personRow, $record['usuario_registro'] ?? '');
            $combined->setCellValue('C' . $personRow, $registeredAt);
            foreach (['D' => 'region', 'E' => 'finca', 'F' => 'codigo_modulo', 'G' => 'tipo_riego'] as $column => $key) {
                exportText($combined, $column . $personRow, $record[$key] ?? '');
            }
            exportText($combined, 'H' . $personRow, $person['nombre']);
            exportText($combined, 'I' . $personRow, $person['codigo']);
            $personRow++;
        }
        $row++;
    }
    formatExportSheet($summary,
        ['Referencia', 'Usuario solicitante', 'Fecha y hora (Guatemala)', 'Región', 'Código de finca', 'Finca', 'Módulo', 'Tipo de riego', 'Personas asignadas', 'Celulares solicitados'],
        [23, 25, 25, 24, 19, 28, 24, 24, 20, 22], 'J', $row - 1);
    formatExportSheet($people,
        ['Referencia de solicitud', 'Celular en la solicitud', 'Colaborador en la solicitud', 'Nombre del colaborador', 'Código del colaborador'],
        [26, 23, 26, 48, 26], 'E', $personRow - 1);
    formatExportSheet($combined,
        ['Referencia', 'Usuario solicitante', 'Fecha y hora (Guatemala)', 'Región', 'Finca', 'Módulo', 'Tipo de riego', 'Nombre del colaborador', 'Código del colaborador'],
        [23, 25, 25, 24, 28, 24, 24, 48, 26], 'I', $personRow - 1);
    if ($row > 2) $summary->getStyle('C2:C' . ($row - 1))->getNumberFormat()->setFormatCode('dd/mm/yyyy hh:mm');
    if ($personRow > 2) $combined->getStyle('C2:C' . ($personRow - 1))->getNumberFormat()->setFormatCode('dd/mm/yyyy hh:mm');
    $book->setActiveSheetIndex(0);
    return $book;
}

function downloadRequests(array $records): never {
    $book = buildRequestsWorkbook($records);
    $temp = tmpfile();
    if ($temp === false) throw new RuntimeException('No se pudo preparar la descarga.');
    try {
        $path = stream_get_meta_data($temp)['uri'];
        (new Xlsx($book))->save($path);
        $stamp = (new DateTimeImmutable('now', new DateTimeZone('America/Guatemala')))->format('Y-m-d_H-i-s');
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="solicitudes_' . $stamp . '.xlsx"');
        header('Content-Length: ' . filesize($path));
        rewind($temp);
        fpassthru($temp);
    } finally {
        fclose($temp);
        $book->disconnectWorksheets();
    }
    exit;
}
