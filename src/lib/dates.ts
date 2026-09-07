import { format } from 'date-fns'

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
