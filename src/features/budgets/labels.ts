import { formatAmount } from '@/lib/currency'

import type { BudgetProgress, BudgetStatus } from './progress'

export type BudgetTone = 'neutral' | 'ok' | 'warning' | 'danger'

export const budgetStatusLabel: Record<BudgetStatus, string> = {
  unbudgeted: 'Sin presupuesto',
  ok: 'En rango',
  warning_70: '70% usado',
  warning_90: '90% usado',
  over: 'Presupuesto superado',
}

export const budgetStatusTone: Record<BudgetStatus, BudgetTone> = {
  unbudgeted: 'neutral',
  ok: 'ok',
  warning_70: 'warning',
  warning_90: 'warning',
  over: 'danger',
}

/**
 * Severidad del umbral. 0 significa "no genera alerta".
 *
 * `classifyBudgetStatus` ya devuelve un único estado por presupuesto, así que
 * esto no sirve para elegir entre umbrales de una misma categoría —esa
 * decisión ya está tomada— sino para ordenar las alertas de varias categorías
 * y mostrar primero lo más grave.
 */
export const budgetAlertSeverity: Record<BudgetStatus, number> = {
  unbudgeted: 0,
  ok: 0,
  warning_70: 1,
  warning_90: 2,
  over: 3,
}

export function isBudgetAlert(status: BudgetStatus): boolean {
  return budgetAlertSeverity[status] > 0
}

const percentFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

/** Porcentaje gastado, sin recortar: superar el presupuesto da más de 100. */
export function formatBudgetPercent(ratio: number): string {
  return `${percentFormatter.format(ratio * 100)} %`
}

/**
 * Texto de la alerta de una categoría. Devuelve `null` cuando el progreso no
 * cruza ningún umbral, para que quien llama no tenga que repetir la condición.
 */
export function budgetAlertMessage(
  categoryName: string,
  progress: BudgetProgress,
  currencyCode: string,
): string | null {
  if (!isBudgetAlert(progress.status) || progress.budgetMinor === null) return null

  if (progress.status === 'over') {
    const excess = progress.spentMinor - progress.budgetMinor
    return `${categoryName} superó su presupuesto por ${formatAmount(excess, currencyCode)}.`
  }

  const percent = formatBudgetPercent(progress.ratio ?? 0)
  return `${categoryName} va por el ${percent} de su presupuesto.`
}
