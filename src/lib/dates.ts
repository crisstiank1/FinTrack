import { format } from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * Fecha de hoy en formato YYYY-MM-DD, en hora local (no UTC). Usar
 * Date#toISOString() aquí desfasaría la fecha un día para usuarios en
 * zonas horarias negativas (ej. Colombia, UTC-5) durante la tarde/noche.
 */
export function todayIsoDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Mes actual en formato YYYY-MM (hora local del proceso), usado como filtro por
 * defecto de las pantallas.
 *
 * **Solo para la interfaz.** En el navegador la hora local es la del usuario,
 * que es justo lo que quiere decir "este mes". Fuera del navegador no lo es: un
 * proceso de servidor corre casi siempre en UTC, y un usuario en Bogotá que
 * pregunte por "este mes" el día 30 a las 20:00 obtendría octubre en vez de
 * septiembre. Para esos contextos existe `monthKeyInTimeZone`, que recibe la
 * zona horaria explícitamente.
 */
export function currentMonthKey(): string {
  return format(new Date(), 'yyyy-MM')
}

/**
 * Mes YYYY-MM al que pertenece un instante **en una zona horaria concreta**.
 *
 * Es la alternativa a `currentMonthKey()` para todo código que no se ejecuta en
 * el navegador del usuario: recibe la zona (`profiles.timezone`) en vez de
 * heredar la del proceso.
 *
 * Se resuelve con `Intl.DateTimeFormat` y `formatToParts` en vez de con
 * `date-fns`, por dos razones: no añade dependencias —date-fns v4 necesitaría
 * `@date-fns/tz`— y `formatToParts` devuelve año y mes como campos, sin
 * depender de cómo cada configuración regional ordene la fecha.
 *
 * Una zona horaria que el entorno no reconozca hace que `Intl` lance
 * `RangeError`, y esta función lo deja pasar a propósito: `profiles.timezone`
 * es texto sin restricción en la base de datos, y responder con el mes de UTC
 * sería exactamente el error silencioso que esta función existe para evitar.
 * Quien la llame decide qué hacer —registrar el perfil corrupto y usar el valor
 * por defecto, por ejemplo—, pero lo decide a la vista.
 */
export function monthKeyInTimeZone(timeZone: string, date: Date = new Date()): string {
  const { year, month } = datePartsInTimeZone(timeZone, date)
  return `${year}-${month}`
}

/**
 * Fecha YYYY-MM-DD de un instante **en una zona horaria concreta**.
 *
 * Misma razón de ser que `monthKeyInTimeZone`, para cuando hace falta el día y
 * no solo el mes: acotar "este mes" al día de hoy del usuario, por ejemplo, en
 * vez de prometer un período que todavía no ha terminado.
 */
export function isoDateInTimeZone(timeZone: string, date: Date = new Date()): string {
  const { year, month, day } = datePartsInTimeZone(timeZone, date)
  return `${year}-${month}-${day}`
}

function datePartsInTimeZone(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new RangeError(`No se pudo resolver la fecha en la zona horaria "${timeZone}".`)
  }

  return { year, month, day }
}

/**
 * Convierte 'YYYY-MM' a un Date local en el día 1 de ese mes.
 *
 * Se construye a mano en vez de usar `parse()` de date-fns porque `parse`
 * rellena los campos ausentes desde una fecha de referencia: parsear
 * '2026-02' un día 31 produciría "31 de febrero", que desborda a marzo.
 */
function monthKeyToDate(monthKey: string): Date {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

/** Mes (YYYY-MM) al que pertenece una fecha ISO 'YYYY-MM-DD'. */
export function monthOfIsoDate(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/** Rango [primer día, último día] de un mes, en formato YYYY-MM-DD. */
export function monthRange(monthKey: string): { start: string; end: string } {
  const first = monthKeyToDate(monthKey)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0)
  return { start: format(first, 'yyyy-MM-dd'), end: format(lastDay, 'yyyy-MM-dd') }
}

/** Desplaza un mes YYYY-MM en `delta` meses (negativo hacia atrás). */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const first = monthKeyToDate(monthKey)
  return format(new Date(first.getFullYear(), first.getMonth() + delta, 1), 'yyyy-MM')
}

/** Mes anterior a `monthKey`. */
export function previousMonthKey(monthKey: string): string {
  return shiftMonthKey(monthKey, -1)
}

/** Los `count` meses que terminan en `monthKey`, del más antiguo al más reciente. */
export function recentMonthKeys(monthKey: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftMonthKey(monthKey, index - (count - 1)))
}

/** 'septiembre 2026' — para títulos y selectores. */
export function formatMonthLabel(monthKey: string): string {
  return format(monthKeyToDate(monthKey), 'LLLL yyyy', { locale: es })
}

/** 'sep' — etiqueta corta para ejes de gráficos. */
export function formatMonthShort(monthKey: string): string {
  return format(monthKeyToDate(monthKey), 'LLL', { locale: es }).replace('.', '')
}

function isoDateToDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** '30 de septiembre de 2026' — para aclarar a qué fecha corresponde un saldo. */
export function formatLongDate(isoDate: string): string {
  return format(isoDateToDate(isoDate), "d 'de' MMMM 'de' yyyy", { locale: es })
}

/** '6 sep' — para listas densas de movimientos. */
export function formatShortDate(isoDate: string): string {
  return format(isoDateToDate(isoDate), 'd LLL', { locale: es }).replace('.', '')
}
