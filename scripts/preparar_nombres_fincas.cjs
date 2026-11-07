const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../assets/xlsx.full.min.js');

try {
  const archivo = String(process.argv[2] || '')
    .trim()
    .replace(/^"|"$/g, '');

  if (!archivo) {
    throw new Error('Debes indicar la ruta del Excel.');
  }

  const libro = XLSX.read(
    fs.readFileSync(archivo),
    { type: 'buffer' }
  );

  const hoja = libro.Sheets['MAESTRO DE LOTES'];

  if (!hoja) {
    throw new Error('No existe la hoja MAESTRO DE LOTES.');
  }

  const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });
  const nombres = new Map();

  const limpiar = valor =>
    String(valor ?? '').replace(/\s+/g, ' ').trim();

  const normalizar = valor =>
    limpiar(valor)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const literal = valor =>
    "'" + valor.replace(/'/g, "''") + "'";

  for (const fila of filas) {
    if (limpiar(fila['COD FINCA']) === '') continue;

    const numero = Number(fila['COD FINCA']);
    const regionCompleta = normalizar(fila['REGION PRODUCCIÓN']);
    const nombre = limpiar(fila['DESCRIPCION FINCA']);

    if (
      !Number.isInteger(numero) ||
      !nombre ||
      !regionCompleta.startsWith('REGION PRODUCCION ')
    ) {
      throw new Error(
        'Hay una fila con código, región o nombre inválido.'
      );
    }

    const region = regionCompleta.slice(
      'REGION PRODUCCION '.length
    );

    const codigo = String(numero);
    const clave = JSON.stringify([region, codigo]);
    const anterior = nombres.get(clave);

    if (anterior && anterior.nombre !== nombre) {
      throw new Error(
        `Hay nombres distintos para la finca ${codigo}, ${region}.`
      );
    }

    nombres.set(clave, { region, codigo, nombre });
  }

  if (!nombres.size) {
    throw new Error('No se encontraron fincas.');
  }

  const valores = [...nombres.values()]
    .map(fila =>
      `(${literal(fila.region)}, ` +
      `${literal(fila.codigo)}, ` +
      `${literal(fila.nombre)})`
    )
    .join(',\n');

  const sql = `BEGIN;

ALTER TABLE public.asignaciones_jefes_fincas
ADD COLUMN IF NOT EXISTS nombre_finca TEXT;

WITH nombres (region, c_finca, nombre_finca) AS (
VALUES
${valores}
)
UPDATE public.asignaciones_jefes_fincas a
SET nombre_finca = n.nombre_finca
FROM nombres n
WHERE a.region = n.region
  AND a.c_finca = n.c_finca;

COMMIT;

SELECT
    COUNT(*) AS asignaciones,
    COUNT(*) FILTER (
        WHERE NULLIF(BTRIM(nombre_finca), '') IS NULL
    ) AS sin_nombre
FROM public.asignaciones_jefes_fincas
WHERE fuente = 'Excel maestro lotes Z26-27';
`;

  const salida = path.resolve(
    __dirname,
    '../sql/completar_nombres_fincas.sql'
  );

  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, sql, 'utf8');

  console.log(`Nombres encontrados: ${nombres.size}`);
  console.log(`SQL generado: ${salida}`);
} catch (error) {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
}