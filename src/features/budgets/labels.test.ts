import { describe, expect, it } from 'vitest'

import {
  budgetAlertMessage,
  budgetAlertSeverity,
  formatBudgetPercent,
  isBudgetAlert,
} from './labels'
import type { BudgetProgress, BudgetStatus } from './progress'

function progress(overrides: Partial<BudgetProgress> = {}): BudgetProgress {
  return {
    categoryId: 'cat-1',
    budgetMinor: 100_000,
    spentMinor: 75_000,
    remainingMinor: 25_000,
    ratio: 0.75,
    status: 'warning_70',
    source: 'template',
    ...overrides,
  }
}

describe('isBudgetAlert', () => {
  it.each<[BudgetStatus, boolean]>([
    ['unbudgeted', false],
    ['ok', false],
    ['warning_70', true],
    ['warning_90', true],
    ['over', true],
  ])('%s -> %s', (status, expected) => {
    expect(isBudgetAlert(status)).toBe(expected)
  })
})

describe('budgetAlertSeverity', () => {
  it('ordena de menor a mayor gravedad', () => {
    expect(budgetAlertSeverity.over).toBeGreaterThan(budgetAlertSeverity.warning_90)
    expect(budgetAlertSeverity.warning_90).toBeGreaterThan(budgetAlertSeverity.warning_70)
    expect(budgetAlertSeverity.warning_70).toBeGreaterThan(budgetAlertSeverity.ok)
  })
})

describe('formatBudgetPercent', () => {
  it('no recorta al 100: superar el presupuesto se ve', () => {
    expect(formatBudgetPercent(1.3)).toBe('130 %')
  })
})

describe('budgetAlertMessage', () => {
  it('sin umbral cruzado no hay alerta', () => {
    expect(budgetAlertMessage('Alimentación', progress({ status: 'ok' }), 'COP')).toBeNull()
  })

  it('sin presupuesto no hay alerta', () => {
    const sinPresupuesto = progress({ status: 'unbudgeted', budgetMinor: null, ratio: null })

    expect(budgetAlertMessage('Alimentación', sinPresupuesto, 'COP')).toBeNull()
  })

  it('al 70% dice cuánto se lleva gastado', () => {
    expect(budgetAlertMessage('Alimentación', progress(), 'COP')).toBe(
      'Alimentación va por el 75 % de su presupuesto.',
    )
  })

  it('al superarlo dice por cuánto', () => {
    const excedido = progress({
      status: 'over',
      spentMinor: 130_000,
      remainingMinor: -30_000,
      ratio: 1.3,
    })

    expect(budgetAlertMessage('Alimentación', excedido, 'COP')).toBe(
      'Alimentación superó su presupuesto por COP 30.000.',
    )
  })
})
