import { describe, expect, it } from 'vitest'

import type { BudgetRow } from '@/features/budgets/resolution'
import {
  buildCategoryBreakdown,
  buildDashboardSummary,
  type DashboardAccount,
  type DashboardTransaction,
} from '@/features/dashboard/summary'

import type { CoachContextReady } from './responses'
import type { CoachIntent } from './scope'
import {
  buildCoachSnapshot,
  intentNeedsData,
  type SnapshotCategoryRow,
  type SnapshotData,
} from './snapshot'

const MONTH = '2026-09'

const accounts: DashboardAccount[] = [
  { id: 'acc-cop', name: '', type: 'cash', currency_code: 'COP', initial_balance_minor: 0 },
  { id: 'acc-cop-2', name: '', type: 'cash', currency_code: 'COP', initial_balance_minor: 0 },
  { id: 'acc-usd', name: '', type: 'cash', currency_code: 'USD', initial_balance_minor: 0 },
]

const categories: SnapshotCategoryRow[] = [
  { id: 'cat-food', name: 'Mercado', type: 'expense', color: null, icon: null, is_archived: false },
  {
    id: 'cat-bus',
    name: 'Transporte',
    type: 'expense',
    color: null,
    icon: null,
    is_archived: false,
  },
  { id: 'cat-fun', name: 'Ocio', type: 'expense', color: null, icon: null, is_archived: false },
  { id: 'cat-pay', name: 'Salario', type: 'income', color: null, icon: null, is_archived: false },
]

function tx(overrides: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: crypto.randomUUID(),
    type: 'expense',
    transfer_direction: null,
    account_id: 'acc-cop',
    category_id: 'cat-food',
    amount_minor: 0,
    transaction_date: `${MONTH}-10`,
    description: '',
    ...overrides,
  }
}

const transactions: DashboardTransaction[] = [
  // Agosto.
  tx({
    type: 'income',
    category_id: 'cat-pay',
    amount_minor: 2_000_000,
    transaction_date: '2026-08-01',
  }),
  tx({ amount_minor: 300_000, transaction_date: '2026-08-05' }),
  tx({ category_id: 'cat-fun', amount_minor: 200_000, transaction_date: '2026-08-06' }),
  // Septiembre.
  tx({
    type: 'income',
    category_id: 'cat-pay',
    amount_minor: 2_000_000,
    transaction_date: '2026-09-01',
  }),
  tx({ amount_minor: 450_000, transaction_date: '2026-09-05' }),
  tx({ category_id: 'cat-bus', amount_minor: 120_000, transaction_date: '2026-09-06' }),
  tx({ category_id: 'cat-fun', amount_minor: 50_000, transaction_date: '2026-09-07' }),
  // Transferencia interna: no es ingreso ni gasto.
  tx({
    type: 'transfer',
    transfer_direction: 'outgoing',
    category_id: null,
    amount_minor: 900_000,
  }),
  tx({
    type: 'transfer',
    transfer_direction: 'incoming',
    category_id: null,
    account_id: 'acc-cop-2',
    amount_minor: 900_000,
  }),
  // Gasto en USD: no se suma a nada en COP.
  tx({ account_id: 'acc-usd', amount_minor: 4599, transaction_date: '2026-09-08' }),
]

const budgets: BudgetRow[] = [
  // Mercado: plantilla de 400.000 → superado con 450.000.
  {
    id: 'b-food',
    category_id: 'cat-food',
    period_month: null,
    effective_from: '2026-01-01',
    amount_minor: 400_000,
  },
  // Transporte: plantilla de 200.000 → dentro.
  {
    id: 'b-bus',
    category_id: 'cat-bus',
    period_month: null,
    effective_from: '2026-01-01',
    amount_minor: 200_000,
  },
  // Ocio: plantilla de 100.000, pero excepción de 0 en septiembre.
  {
    id: 'b-fun',
    category_id: 'cat-fun',
    period_month: null,
    effective_from: '2026-01-01',
    amount_minor: 100_000,
  },
  {
    id: 'b-fun-sep',
    category_id: 'cat-fun',
    period_month: '2026-09-01',
    effective_from: '2026-09-01',
    amount_minor: 0,
  },
]

const data: SnapshotData = { primaryCurrency: 'COP', accounts, transactions, categories, budgets }

function context(intent: CoachIntent, currency = 'COP'): CoachContextReady {
  return {
    type: 'coach_context_ready',
    intent,
    currency,
    period: { monthKey: MONTH, start: '2026-09-01', end: '2026-09-21', label: 'septiembre 2026' },
    comparedTo: {
      monthKey: '2026-08',
      start: '2026-08-01',
      end: '2026-08-31',
      label: 'agosto 2026',
    },
    availableData: [],
  }
}

describe('buildCoachSnapshot · paridad con la interfaz', () => {
  it('el resumen coincide cifra a cifra con buildDashboardSummary', () => {
    const snapshot = buildCoachSnapshot({ context: context('period_summary'), data })
    const dashboard = buildDashboardSummary({
      accounts,
      transactions,
      monthKey: MONTH,
      currencyCode: 'COP',
    })

    expect(snapshot.summary?.income.currentMinor).toBe(dashboard.income.currentMinor)
    expect(snapshot.summary?.expense.currentMinor).toBe(dashboard.expense.currentMinor)
    expect(snapshot.summary?.expense.previousMinor).toBe(dashboard.expense.previousMinor)
    expect(snapshot.summary?.netSavings.currentMinor).toBe(dashboard.netSavings.currentMinor)
  })

  it('el reparto por categoría coincide con buildCategoryBreakdown', () => {
    const snapshot = buildCoachSnapshot({ context: context('spending_by_category'), data })
    const dashboard = buildCategoryBreakdown(
      { accounts, transactions, monthKey: MONTH, currencyCode: 'COP', categories },
      5,
    )

    expect(Object.values(snapshot.categories ?? {}).map((c) => c.amount)).toEqual(
      dashboard.map((slice) => slice.amountMinor),
    )
  })

  it('las transferencias no cuentan como ingreso ni como gasto', () => {
    const snapshot = buildCoachSnapshot({ context: context('period_summary'), data })

    expect(snapshot.summary?.income.currentMinor).toBe(2_000_000)
    expect(snapshot.summary?.expense.currentMinor).toBe(620_000)
  })

  it('el gasto en USD no se suma al análisis en COP, pero se cuenta como excluido', () => {
    const snapshot = buildCoachSnapshot({ context: context('period_summary'), data })

    expect(snapshot.summary?.expense.currentMinor).toBe(620_000)
    expect(snapshot.exclusions).toEqual({ count: 1, currencyCodes: ['USD'] })
  })

  it('en USD analiza solo USD y conserva los centavos sin reescalar', () => {
    const snapshot = buildCoachSnapshot({ context: context('period_summary', 'USD'), data })

    expect(snapshot.summary?.expense.currentMinor).toBe(4599)
    expect(snapshot.currency).toBe('USD')
  })

  it('el flujo de caja positivo no genera alerta', () => {
    const snapshot = buildCoachSnapshot({ context: context('cashflow_analysis'), data })

    expect(snapshot.cashflow).toEqual({
      incomeMinor: 2_000_000,
      expenseMinor: 620_000,
      netSavingsMinor: 1_380_000,
      alert: null,
    })
  })

  it('el flujo de caja negativo genera la alerta única', () => {
    const snapshot = buildCoachSnapshot({
      context: context('cashflow_analysis'),
      data: { ...data, transactions: [tx({ amount_minor: 10_000 })] },
    })

    expect(snapshot.cashflow?.alert).toBe('negative_net_savings')
  })
})

describe('buildCoachSnapshot · privacidad', () => {
  it('no contiene ningún identificador de cuenta, categoría ni presupuesto', () => {
    for (const intent of ['period_summary', 'spending_review', 'cashflow_analysis'] as const) {
      const json = JSON.stringify(buildCoachSnapshot({ context: context(intent), data }))

      expect(json).not.toMatch(/acc-|cat-|b-food|b-bus|b-fun/)
    }
  })

  it('indexa las categorías con claves cortas y porcentaje, no proporción', () => {
    const snapshot = buildCoachSnapshot({ context: context('spending_by_category'), data })

    expect(Object.keys(snapshot.categories ?? {})).toEqual(['c1', 'c2', 'c3'])
    expect(snapshot.categories?.c1).toEqual({ name: 'Mercado', amount: 450_000, percentage: 72.6 })
  })
})

describe('buildCoachSnapshot · datos mínimos por intención', () => {
  it('una pregunta de presupuestos solo lleva presupuestos', () => {
    const snapshot = buildCoachSnapshot({ context: context('budget_status'), data })

    expect(snapshot.budgets).toBeDefined()
    expect(snapshot.summary).toBeUndefined()
    expect(snapshot.categories).toBeUndefined()
  })

  it('las preguntas de concepto y de ayuda no necesitan datos', () => {
    expect(intentNeedsData('financial_concept')).toBe(false)
    expect(intentNeedsData('app_feature_help')).toBe(false)
    expect(intentNeedsData('spending_by_category')).toBe(true)
  })
})

describe('buildCoachSnapshot · presupuestos', () => {
  it('pone primero los superados y conserva el 0 deliberado como "sin presupuesto"', () => {
    const snapshot = buildCoachSnapshot({ context: context('budget_status'), data })
    const lines = Object.values(snapshot.budgets ?? {})

    expect(lines[0]).toMatchObject({ name: 'Mercado', status: 'over', remaining: -50_000 })
    expect(lines.find((line) => line.name === 'Ocio')).toMatchObject({
      budget: null,
      status: 'unbudgeted',
    })
  })

  it('distingue un 0 deliberado de una categoría nunca presupuestada', () => {
    const snapshot = buildCoachSnapshot({ context: context('budget_status'), data })
    const ocio = Object.values(snapshot.budgets ?? {}).find((line) => line.name === 'Ocio')

    // Sin `source`, un 0 puesto a propósito y una categoría sin presupuesto
    // son indistinguibles: las dos llegan con `budget: null`.
    expect(ocio).toMatchObject({ budget: null, status: 'unbudgeted', source: 'exception' })
  })

  it('la excepción de 0 manda sobre la plantilla, igual que en /budgets', () => {
    const snapshot = buildCoachSnapshot({ context: context('budget_status'), data })

    expect(Object.values(snapshot.budgets ?? {}).find((l) => l.name === 'Ocio')?.budget).toBeNull()
  })

  it('en otra moneda no calcula presupuestos y dice en cuál están', () => {
    const snapshot = buildCoachSnapshot({ context: context('budget_status', 'USD'), data })

    expect(snapshot.budgets).toBeUndefined()
    expect(snapshot.budgetsCurrency).toBe('COP')
  })
})

describe('buildCoachSnapshot · variaciones por categoría', () => {
  it('lista las variaciones de mayor subida a mayor bajada y omite las nulas', () => {
    const snapshot = buildCoachSnapshot({ context: context('period_comparison'), data })

    expect(Object.values(snapshot.categoryDeltas ?? {}).map((d) => [d.name, d.difference])).toEqual(
      [
        ['Mercado', 150_000],
        ['Transporte', 120_000],
        ['Ocio', -150_000],
      ],
    )
  })
})
