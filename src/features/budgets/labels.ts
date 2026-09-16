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

/*
 * Tres estados de presupuesto, siempre distintos, en `/budgets` y en `/plan`:
 *
 * - **Sin presupuesto**: no hay plantilla ni excepción que resuelva el mes.
 * - **COP 0 explícito**: el usuario decidió un presupuesto de 0. No es una
 *   ausencia, y decir «Sin presupuesto» borraría esa decisión.
 * - **Positivo**: importe, barra, porcentaje y umbrales.
 *
 * Los dos primeros comparten presentación —sin barra, sin porcentaje, sin
 * alertas— pero nunca frase. Estos textos son la única fuente para ambas
 * pantallas.
 */

/** No hay presupuesto que resuelva el mes. */
export const NO_BUDGET_THIS_MONTH_LABEL = 'Sin presupuesto este mes'

/** Presupuesto explícito de 0: «Presupuesto en COP 0». */
export function formatZeroBudget(currencyCode: string): string {
  return `Presupuesto en ${formatAmount(0, currencyCode)}`
}

/**
 * Sufijo del 0 fijado como excepción de un mes. Solo se nombra ese origen
 * porque es el que se deshace distinto: una plantilla en 0 se ve en el
 * historial, igual que cualquier otra versión.
 */
export const ZERO_BUDGET_EXCEPTION_SUFFIX = 'excepción de este mes'

/**
 * Estado de un progreso sin barra, que es o ausencia o 0 explícito.
 *
 * `buildBudgetProgress` codifica los dos como `budgetMinor === null`, y la
 * diferencia está en `source`: nulo cuando nada resolvió el mes, presente
 * cuando lo resolvió un 0.
 */
export function formatBudgetWithoutBar(
  progress: Pick<BudgetProgress, 'source'>,
  currencyCode: string,
): string {
  if (progress.source === null) return NO_BUDGET_THIS_MONTH_LABEL

  const zero = formatZeroBudget(currencyCode)
  return progress.source === 'exception' ? `${zero} · ${ZERO_BUDGET_EXCEPTION_SUFFIX}` : zero
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

/**
 * Aviso de los gastos del mes que no cuentan para ningún presupuesto por estar
 * en cuentas de otra moneda. `null` si no hay ninguno.
 */
export function excludedExpensesNote(exclusions: {
  count: number
  currencyCodes: readonly string[]
}): string | null {
  if (exclusions.count === 0) return null

  const codes = exclusions.currencyCodes.join(', ')
  return exclusions.count === 1
    ? `1 gasto en otra moneda (${codes}) no cuenta para estos presupuestos.`
    : `${exclusions.count} gastos en otras monedas (${codes}) no cuentan para estos presupuestos.`
}
