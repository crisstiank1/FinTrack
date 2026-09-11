/**
 * Convención de signo de la diferencia (docs/09-plan-mensual.md, "Diferencia"):
 * en ingresos, ahorro e inversión, más real que planeado es favorable; en
 * gastos, facturas, variables y deuda, es al revés.
 */
export type DiffRowKind = 'income_like' | 'expense_like'

export type Diff =
  | { status: 'no_budget' }
  | { status: 'on_target' }
  | { status: 'favorable'; amountMinor: number }
  | { status: 'unfavorable'; amountMinor: number }

/**
 * Diferencia entre lo real y lo planeado. La igualdad exacta es "en
 * objetivo", ni favorable ni desfavorable. Sin presupuesto
 * (`plannedMinor === null`), la diferencia es nula y se etiqueta
 * explícitamente como tal — nunca como `0`, que sería un valor real distinto
 * (docs/09-plan-mensual.md).
 *
 * `amountMinor` en el resultado es siempre una magnitud positiva: el signo ya
 * está codificado en `status`, así que quien consume el resultado no necesita
 * volver a interpretarlo.
 */
export function calculateDiff(actualMinor: number, plannedMinor: number | null, kind: DiffRowKind): Diff {
  if (plannedMinor === null) return { status: 'no_budget' }

  const signedDiff = kind === 'income_like' ? actualMinor - plannedMinor : plannedMinor - actualMinor

  if (signedDiff === 0) return { status: 'on_target' }
  if (signedDiff > 0) return { status: 'favorable', amountMinor: signedDiff }
  return { status: 'unfavorable', amountMinor: -signedDiff }
}
