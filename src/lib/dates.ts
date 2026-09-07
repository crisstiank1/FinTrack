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

/** Mes actual en formato YYYY-MM (hora local), usado como filtro por defecto. */
export function currentMonthKey(): string {
  return format(new Date(), 'yyyy-MM')
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
