/**
 * Enlaces del Plan mensual hacia otras pantallas.
 *
 * Todo lo que se lee en `/plan` pertenece a un mes concreto, y la pantalla a la
 * que se salta tiene que abrir ese mismo mes: si no, desde agosto se acabaría
 * editando el presupuesto de septiembre sin darse cuenta.
 *
 * Solo aparecen aquí los destinos que aceptan el mes en la URL: `/budgets` y
 * `/transactions`. `/settings` no lo acepta, así que sus enlaces siguen siendo
 * literales.
 */

/**
 * Presupuestos del mes indicado: `/budgets?month=YYYY-MM`, el mismo contrato
 * que usan las alertas del dashboard.
 *
 * Es pura a propósito: no consulta el reloj ni la URL actual, así que el enlace
 * depende solo del mes que se le pasa.
 */
export function budgetsHrefForMonth(monthKey: string): string {
  return `/budgets?month=${monthKey}`
}

/**
 * Movimientos del mes indicado: `/transactions?month=YYYY-MM`. Mismo contrato
 * y misma pureza que `budgetsHrefForMonth`.
 */
export function transactionsHrefForMonth(monthKey: string): string {
  return `/transactions?month=${monthKey}`
}
