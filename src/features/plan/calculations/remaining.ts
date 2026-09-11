export interface RemainingBreakdown {
  restanteActual: number
  restantePlaneado: number
}

/**
 * "Restante" en sus dos lecturas (docs/09-plan-mensual.md): la real —lo que
 * efectivamente entró y salió en el mes— y la planeada, que es exactamente
 * `porAsignar` de `reconciliation.ts`: el mismo número, una sola cifra en la
 * interfaz. `deudaActual` no se resta aparte: ya está dentro de
 * `expenseActualMinor`, así que restarla otra vez la contaría dos veces.
 */
export function calculateRemaining(
  incomeActualMinor: number,
  expenseActualMinor: number,
  savingsContributionsMinor: number,
  investmentContributionsMinor: number,
  unassignedMinor: number,
): RemainingBreakdown {
  return {
    restanteActual:
      incomeActualMinor -
      expenseActualMinor -
      savingsContributionsMinor -
      investmentContributionsMinor,
    restantePlaneado: unassignedMinor,
  }
}
