import Papa from 'papaparse'

/**
 * Lectura de un extracto bancario en CSV, **en el navegador**.
 *
 * El archivo nunca sale del equipo del usuario: no se sube a Storage, no se
 * guarda el original y no se envía a ningún proveedor de IA. Lo único que llega
 * a la base de datos son los borradores que el usuario decide importar.
 */

/** 5 MB: un año de movimientos de una cuenta ocupa del orden de cientos de KB. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024

/** Filas de datos por importación. Más que eso, mejor partir el archivo por períodos. */
export const MAX_DATA_ROWS = 2000

/** Columnas por fila. Un extracto real tiene menos de 20. */
export const MAX_COLUMNS = 50

export const SUPPORTED_DELIMITERS = [',', ';', '\t'] as const
export type CsvDelimiter = (typeof SUPPORTED_DELIMITERS)[number]

export type CsvEncoding = 'utf-8' | 'windows-1252'

export type ReadErrorCode =
  | 'not_csv'
  | 'too_large'
  | 'empty'
  | 'no_data_rows'
  | 'too_many_rows'
  | 'too_many_columns'
  | 'unsupported_delimiter'
  | 'looks_binary'

export interface ParsedCsv {
  /** Encabezados tal como vienen, sin espacios sobrantes. Vacíos → «Columna N». */
  headers: string[]
  /** Filas de datos, rellenadas o recortadas al número de encabezados. */
  rows: string[][]
  /**
   * Línea del archivo en la que empieza cada fila de `rows` (la primera línea
   * es la 1). Las líneas en blanco se saltan pero cuentan, para que un error
   * se señale en la línea que el usuario ve en su editor.
   */
  lines: number[]
  delimiter: CsvDelimiter
  encoding: CsvEncoding
}

export type ReadResult = { ok: true; csv: ParsedCsv } | { ok: false; code: ReadErrorCode }

const READ_ERROR_TEXT: Record<ReadErrorCode, string> = {
  not_csv: 'Elige un archivo .csv exportado por tu banco.',
  too_large: 'El archivo supera los 5 MB. Exporta un período más corto.',
  empty: 'El archivo está vacío.',
  no_data_rows: 'El archivo solo tiene encabezados; no hay movimientos que importar.',
  too_many_rows: `El archivo tiene más de ${MAX_DATA_ROWS} filas. Exporta un período más corto.`,
  too_many_columns: 'El archivo tiene demasiadas columnas para ser un extracto.',
  unsupported_delimiter: 'No se reconoce el separador. Usa coma, punto y coma o tabulador.',
  looks_binary: 'El archivo no parece un CSV de texto (¿es un Excel o un PDF?).',
}

export function readErrorText(code: ReadErrorCode): string {
  return READ_ERROR_TEXT[code]
}

/** Comprobación barata antes de leer el contenido. */
export function checkFileMeta(file: {
  name: string
  size: number
  type?: string
}): ReadErrorCode | null {
  const byName = /\.(csv|txt)$/i.test(file.name)
  const byType = file.type === 'text/csv' || file.type === 'application/vnd.ms-excel'
  if (!byName && !byType) return 'not_csv'
  if (file.size === 0) return 'empty'
  if (file.size > MAX_FILE_BYTES) return 'too_large'
  return null
}

/**
 * Decodifica los bytes. UTF-8 primero, en modo estricto; si no es UTF-8 válido
 * se asume Windows-1252, que es como exportan muchos bancos latinoamericanos
 * desde Excel. La interfaz muestra la codificación usada para que el usuario
 * pueda notar tildes corruptas.
 */
export function decodeBytes(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return { text: stripBom(text), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' }
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Parsea el texto ya decodificado.
 *
 * La primera fila no vacía es la de encabezados. El separador lo detecta
 * PapaParse, limitado a coma, punto y coma y tabulador.
 */
export function parseCsvText(text: string, encoding: CsvEncoding = 'utf-8'): ReadResult {
  const clean = stripBom(text)
  if (clean.trim() === '') return { ok: false, code: 'empty' }
  // Un NUL no aparece en un CSV de texto; sí en un .xlsx o un PDF renombrado.
  if (clean.includes('\u0000')) return { ok: false, code: 'looks_binary' }

  // Dos pasadas. La detección de separador de PapaParse falla con líneas en
  // blanco, así que se detecta saltándolas; después se parsea con ese
  // separador fijo y sin saltar nada, para poder numerar las líneas reales.
  const delimiter = Papa.parse<string[]>(clean, {
    delimitersToGuess: [...SUPPORTED_DELIMITERS],
    skipEmptyLines: 'greedy',
    preview: 50,
  }).meta.delimiter as CsvDelimiter

  const result = Papa.parse<string[]>(clean, { delimiter, skipEmptyLines: false })

  // Registros no vacíos con la línea en que empiezan. Un registro ocupa una
  // línea más las que abran los saltos dentro de un campo entre comillas.
  const records: { cells: string[]; line: number }[] = []
  let line = 1
  for (const raw of result.data) {
    if (!Array.isArray(raw)) continue
    const cells = raw.map((cell) => String(cell ?? ''))
    if (cells.some((cell) => cell.trim() !== '')) records.push({ cells, line })
    line += 1 + cells.reduce((sum, cell) => sum + (cell.match(/\n/g)?.length ?? 0), 0)
  }
  if (records.length === 0) return { ok: false, code: 'empty' }

  const width = records[0].cells.length
  if (width > MAX_COLUMNS) return { ok: false, code: 'too_many_columns' }
  if (width < 2 || !(SUPPORTED_DELIMITERS as readonly string[]).includes(delimiter)) {
    return { ok: false, code: 'unsupported_delimiter' }
  }

  const headers = records[0].cells.map((header, index) => {
    const trimmed = header.trim()
    return trimmed === '' ? `Columna ${index + 1}` : trimmed
  })

  const dataRecords = records.slice(1)
  if (dataRecords.length === 0) return { ok: false, code: 'no_data_rows' }
  if (dataRecords.length > MAX_DATA_ROWS) return { ok: false, code: 'too_many_rows' }

  const rows = dataRecords.map((record) =>
    headers.map((_, index) => (record.cells[index] ?? '').trim()),
  )

  return {
    ok: true,
    csv: { headers, rows, lines: dataRecords.map((record) => record.line), delimiter, encoding },
  }
}

/** Lee un `File` del navegador de principio a fin. */
export async function readCsvFile(file: File): Promise<ReadResult> {
  const metaError = checkFileMeta(file)
  if (metaError) return { ok: false, code: metaError }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const { text, encoding } = decodeBytes(bytes)
  return parseCsvText(text, encoding)
}
