import { describe, expect, it } from 'vitest'

import {
  excludedExpensesNote,
  budgetAlertMessage,
  formatBudgetPercent,
  formatBudgetWithoutBar,
  formatZeroBudget,
  isBudgetAlert,
  NO_BUDGET_THIS_MONTH_LABEL,
} from './labels'
import type { BudgetProgress, BudgetStatus } from './progress'

function progress(overrides: Partial<BudgetProgress> = {}): BudgetProgress {
  return {
    categoryId: 'cat-1',
    budgetMinor: 100_000,
    spentMinor: 75_000,
    remainingMinor: 25_000,
    ratio: 0.75,
    status: 'ok',
    source: 'template',
    ...overrides,
  }
}

describe('estados sin barra: ausencia y COP 0 explícito', () => {
  it('sin nada que resuelva el mes dice «Sin presupuesto este mes»', () => {
    expect(formatBudgetWithoutBar({ source: null }, 'COP')).toBe('Sin presupuesto este mes')
    expect(NO_BUDGET_THIS_MONTH_LABEL).toBe('Sin presupuesto este mes')
  })

  it('una plantilla en 0 es «Presupuesto en COP 0», sin sufijo', () => {
    expect(formatBudgetWithoutBar({ source: 'template' }, 'COP')).toBe('Presupuesto en COP 0')
  })

  it('una excepción en 0 añade «excepción de este mes»', () => {
    expect(formatBudgetWithoutBar({ source: 'exception' }, 'COP')).toBe(
      'Presupuesto en COP 0 · excepción de este mes',
    )
  })

  it('un 0 explícito nunca se dice «Sin presupuesto»', () => {
    for (const source of ['template', 'exception'] as const) {
      expect(formatBudgetWithoutBar({ source }, 'COP')).not.toContain('Sin presupuesto')
    }
  })

  it('el 0 se escribe en la moneda de presentación', () => {
    expect(formatZeroBudget('COP')).toBe('Presupuesto en COP 0')
    expect(formatZeroBudget('USD')).toBe('Presupuesto en USD 0')
  })
})

describe('isBudgetAlert', () => {
  it.each<[BudgetStatus, boolean]>([
    ['unbudgeted', false],
    ['ok', false],
    ['over', true],
  ])('%s -> %s', (status, expected) => {
    expect(isBudgetAlert(status)).toBe(expected)
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

  it('dentro del presupuesto no avisa, ni al 75 % ni al 100 % exacto (M15)', () => {
    expect(budgetAlertMessage('Alimentación', progress(), 'COP')).toBeNull()

    const justo = progress({ spentMinor: 100_000, remainingMinor: 0, ratio: 1, status: 'ok' })
    expect(budgetAlertMessage('Alimentación', justo, 'COP')).toBeNull()
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

describe('excludedExpensesNote', () => {
  it('avisa de los gastos en otras monedas, en plural y en singular', () => {
    expect(excludedExpensesNote({ count: 2, currencyCodes: ['USD'] })).toBe(
      '2 gastos en otras monedas (USD) no cuentan para estos presupuestos.',
    )
    expect(excludedExpensesNote({ count: 1, currencyCodes: ['ARS'] })).toBe(
      '1 gasto en otra moneda (ARS) no cuenta para estos presupuestos.',
    )
  })

  it('sin gastos excluidos no hay aviso', () => {
    expect(excludedExpensesNote({ count: 0, currencyCodes: [] })).toBeNull()
  })
})
