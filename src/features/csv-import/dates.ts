/**
 * Fechas de extractos bancarios → 'YYYY-MM-DD'.
 *
 * Nunca se adivina en silencio. `03/04/2026` es 3 de abril en Colombia y 4 de
 * marzo en un extracto exportado en inglés; si todas las fechas del archivo
 * encajan en los dos formatos, el usuario tiene que elegir.
 *
 * Las fechas se tratan como fechas de calendario, sin hora ni zona horaria: un
 * extracto dice el día en que ocurrió el movimiento, y convertirlo a UTC podría
 * moverlo al día anterior.
 */

export type DateFormat = 'DMY' | 'MDY' | 'YMD'

export const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  DMY: 'DD/MM/AAAA',
  MDY: 'MM/DD/AAAA',
  YMD: 'AAAA-MM-DD',
}

const SEPARATED = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T].*)?$/

function isRealDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1) return false
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Interpreta un valor con un formato concreto. `null` si no encaja o no existe. */
export function parseDate(text: string, format: DateFormat): string | null {
  const match = SEPARATED.exec(text.trim())
  if (!match) return null
  const [a, b, c] = [match[1], match[2], match[3]]

  let year: number
  let month: number
  let day: number
  if (format === 'YMD') {
    if (a.length !== 4) return null
    ;[year, month, day] = [Number(a), Number(b), Number(c)]
  } else {
    // Año de cuatro cifras obligatorio: «03/04/26» añade una tercera
    // ambigüedad (¿2026 o 1926?) que no se resuelve sin preguntar.
    if (c.length !== 4 || a.length > 2) return null
    year = Number(c)
    ;[day, month] = format === 'DMY' ? [Number(a), Number(b)] : [Number(b), Number(a)]
  }

  return isRealDate(year, month, day) ? iso(year, month, day) : null
}

export interface DateDetection {
  /**
   * Formatos que interpretan el mayor número de fechas del archivo. Una fila
   * corrupta no impide proponer formato: se quedará como error de esa fila.
   */
  candidates: DateFormat[]
  /** Formato que se puede preseleccionar: solo cuando hay exactamente uno. */
  suggested: DateFormat | null
  /** Hay más de un formato igual de válido: el usuario debe confirmar. */
  ambiguous: boolean
}

export function detectDateFormat(values: readonly string[]): DateDetection {
  const present = values.map((value) => value.trim()).filter((value) => value !== '')
  const formats: DateFormat[] = ['DMY', 'MDY', 'YMD']
  const scores = formats.map(
    (format) => present.filter((value) => parseDate(value, format) !== null).length,
  )
  const best = Math.max(0, ...scores)
  const candidates = best === 0 ? [] : formats.filter((_, index) => scores[index] === best)

  return {
    candidates,
    suggested: candidates.length === 1 ? candidates[0] : null,
    ambiguous: candidates.length > 1,
  }
}
