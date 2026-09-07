import { describe, expect, it } from 'vitest'

import {
  buildBudgetProgress,
  buildBudgetProgressList,
  buildGlobalBudgetAlert,
  calculateBudgetableSpending,
  classifyBudgetStatus,
  type BudgetTransaction,
} from './progress'
import type { BudgetRow } from './resolution'

const CAT = 'cat-alimentacion'
const OTRA = 'cat-transporte'
const MES = '2026-09'

function template(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    id: crypto.randomUUID(),
    category_id: CAT,
    period_month: null,
    effective_from: '2026-09-01',
    amount_minor: 100_000,
    ...overrides,
  }
}

function tx(overrides: Partial<BudgetTransaction> = {}): BudgetTransaction {
  return {
    type: 'expense',
    category_id: CAT,
    amount_minor: 0,
    transaction_date: `${MES}-10`,
    ...overrides,
  }
}

describe('calculateBudgetableSpending', () => {
  it('suma los gastos de la categoría en el mes', () => {
    const spent = calculateBudgetableSpending(
      [tx({ amount_minor: 30_000 }), tx({ amount_minor: 20_000 })],
      CAT,
      MES,
    )

    expect(spent).toBe(50_000)
  })

  it('excluye las transferencias', () => {
    const spent = calculateBudgetableSpending(
      [
        tx({ amount_minor: 30_000 }),
        tx({ type: 'transfer', category_id: null, amount_minor: 900_000 }),
      ],
      CAT,
      MES,
    )

    expect(spent).toBe(30_000)
  })

  it('excluye los ingresos', () => {
    const spent = calculateBudgetableSpending(
      [tx({ amount_minor: 30_000 }), tx({ type: 'income', amount_minor: 900_000 })],
      CAT,
      MES,
    )

    expect(spent).toBe(30_000)
  })

  it('excluye otras categorías y otros meses', () => {
    const spent = calculateBudgetableSpending(
      [
        tx({ amount_minor: 30_000 }),
        tx({ category_id: OTRA, amount_minor: 500_000 }),
        tx({ amount_minor: 500_000, transaction_date: '2026-08-10' }),
      ],
      CAT,
      MES,
    )

    expect(spent).toBe(30_000)
  })
})

describe('classifyBudgetStatus', () => {
  it.each([
    [0, 100_000, 'ok'],
    [50_000, 100_000, 'ok'],
    [69_999, 100_000, 'ok'],
    [70_000, 100_000, 'warning_70'],
    [89_999, 100_000, 'warning_70'],
    [90_000, 100_000, 'warning_90'],
    [100_000, 100_000, 'warning_90'],
    [100_001, 100_000, 'over'],
    [250_000, 100_000, 'over'],
  ])('gasto %i sobre presupuesto %i => %s', (spent, budget, expected) => {
    expect(classifyBudgetStatus(spent, budget)).toBe(expected)
  })

  it('el 100% exacto no cuenta como superado', () => {
    // "superado" es estrictamente gasto > presupuesto.
    expect(classifyBudgetStatus(100_000, 100_000)).toBe('warning_90')
  })

  it('clasifica bien los umbrales aunque el porcentaje no sea exacto en binario', () => {
    // 0,7 y 0,9 no son representables exactamente en coma flotante; por eso la
    // comparación se hace con enteros.
    expect(classifyBudgetStatus(7_000, 10_000)).toBe('warning_70')
    expect(classifyBudgetStatus(6_999, 10_000)).toBe('ok')
    expect(classifyBudgetStatus(9_000, 10_000)).toBe('warning_90')
    expect(classifyBudgetStatus(8_999, 10_000)).toBe('warning_70')
  })

  it('un presupuesto de 0 no tiene umbral', () => {
    expect(classifyBudgetStatus(0, 0)).toBe('unbudgeted')
    expect(classifyBudgetStatus(50_000, 0)).toBe('unbudgeted')
  })
})

describe('buildBudgetProgress', () => {
  it('calcula restante y proporción con una plantilla vigente', () => {
    const progress = buildBudgetProgress(
      [template({ amount_minor: 100_000 })],
      [tx({ amount_minor: 40_000 })],
      CAT,
      MES,
    )

    expect(progress).toMatchObject({
      budgetMinor: 100_000,
      spentMinor: 40_000,
      remainingMinor: 60_000,
      ratio: 0.4,
      status: 'ok',
      source: 'template',
    })
  })

  it('deja el restante negativo cuando se supera el presupuesto', () => {
    const progress = buildBudgetProgress(
      [template({ amount_minor: 100_000 })],
      [tx({ amount_minor: 130_000 })],
      CAT,
      MES,
    )

    expect(progress.remainingMinor).toBe(-30_000)
    expect(progress.status).toBe('over')
  })

  it('la excepción del mes manda sobre la plantilla', () => {
    const budgets = [
      template({ amount_minor: 100_000 }),
      template({
        period_month: `${MES}-01`,
        effective_from: `${MES}-01`,
        amount_minor: 200_000,
      }),
    ]

    const progress = buildBudgetProgress(budgets, [tx({ amount_minor: 150_000 })], CAT, MES)

    expect(progress).toMatchObject({ budgetMinor: 200_000, source: 'exception', status: 'warning_70' })
  })

  it('trata una excepción de 0 como "sin presupuesto este mes"', () => {
    const budgets = [
      template({ amount_minor: 100_000 }),
      template({ period_month: `${MES}-01`, effective_from: `${MES}-01`, amount_minor: 0 }),
    ]

    const progress = buildBudgetProgress(budgets, [tx({ amount_minor: 40_000 })], CAT, MES)

    expect(progress).toMatchObject({
      budgetMinor: null,
      remainingMinor: null,
      ratio: null,
      status: 'unbudgeted',
    })
    // El gasto se sigue reportando aunque no haya presupuesto contra el que medirlo.
    expect(progress.spentMinor).toBe(40_000)
  })

  it('sin plantilla ni excepción no divide entre cero', () => {
    const progress = buildBudgetProgress([], [tx({ amount_minor: 40_000 })], CAT, MES)

    expect(progress).toMatchObject({
      budgetMinor: null,
      remainingMinor: null,
      ratio: null,
      status: 'unbudgeted',
      source: null,
    })
    expect(Number.isNaN(progress.ratio as unknown as number)).toBe(false)
  })

  it('un mes sin gastos da 0% y estado ok', () => {
    const progress = buildBudgetProgress([template({ amount_minor: 100_000 })], [], CAT, MES)

    expect(progress).toMatchObject({ spentMinor: 0, ratio: 0, status: 'ok' })
  })

  it('las transferencias no consumen presupuesto', () => {
    const progress = buildBudgetProgress(
      [template({ amount_minor: 100_000 })],
      [
        tx({ amount_minor: 20_000 }),
        tx({ type: 'transfer', category_id: null, amount_minor: 500_000 }),
      ],
      CAT,
      MES,
    )

    expect(progress.spentMinor).toBe(20_000)
    expect(progress.status).toBe('ok')
  })

  it('los ingresos no consumen presupuesto', () => {
    const progress = buildBudgetProgress(
      [template({ amount_minor: 100_000 })],
      [tx({ amount_minor: 20_000 }), tx({ type: 'income', amount_minor: 500_000 })],
      CAT,
      MES,
    )

    expect(progress.spentMinor).toBe(20_000)
  })

  it('un presupuesto de categoría archivada se sigue calculando históricamente', () => {
    // La lógica pura no consulta el estado de la categoría: archivarla no puede
    // romper la consulta de un mes ya cerrado.
    const budgets = [template({ effective_from: '2026-01-01', amount_minor: 80_000 })]

    const progress = buildBudgetProgress(budgets, [tx({ amount_minor: 60_000 })], CAT, MES)

    expect(progress).toMatchObject({ budgetMinor: 80_000, spentMinor: 60_000, status: 'warning_70' })
  })

  it('un mes pasado no cambia al versionar la plantilla para un mes posterior', () => {
    const budgets = [
      template({ effective_from: '2026-08-01', amount_minor: 100_000 }),
      template({ effective_from: '2026-10-01', amount_minor: 300_000 }),
    ]
    const transactions = [tx({ amount_minor: 95_000, transaction_date: '2026-08-15' })]

    const agosto = buildBudgetProgress(budgets, transactions, CAT, '2026-08')

    expect(agosto).toMatchObject({ budgetMinor: 100_000, status: 'warning_90' })
  })
})

describe('buildBudgetProgressList', () => {
  it('evalúa las categorías indicadas, tengan presupuesto o no', () => {
    const budgets = [template({ amount_minor: 100_000 })]
    const transactions = [
      tx({ amount_minor: 40_000 }),
      tx({ category_id: OTRA, amount_minor: 10_000 }),
    ]

    const list = buildBudgetProgressList(budgets, transactions, [CAT, OTRA], MES)

    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({ categoryId: CAT, budgetMinor: 100_000, status: 'ok' })
    expect(list[1]).toMatchObject({ categoryId: OTRA, budgetMinor: null, status: 'unbudgeted' })
    expect(list[1].spentMinor).toBe(10_000)
  })
})

describe('buildGlobalBudgetAlert', () => {
  it('avisa cuando se gastó más de lo que entró', () => {
    expect(buildGlobalBudgetAlert(1_000_000, 1_200_000)).toEqual({
      kind: 'negative_net_savings',
      netSavingsMinor: -200_000,
    })
  })

  it('no avisa con ahorro positivo', () => {
    expect(buildGlobalBudgetAlert(1_000_000, 400_000)).toBeNull()
  })

  it('no avisa cuando ingresos y gastos empatan', () => {
    // Empatar no es gastar de más.
    expect(buildGlobalBudgetAlert(1_000_000, 1_000_000)).toBeNull()
  })

  it('emite una sola alerta, no una por cada forma de enunciar la condición', () => {
    // "Ahorro neto negativo" y "gastos > ingresos" son la misma condición.
    const alert = buildGlobalBudgetAlert(500_000, 900_000)

    expect(alert?.kind).toBe('negative_net_savings')
    expect(Object.keys(alert ?? {})).toEqual(['kind', 'netSavingsMinor'])
  })
})
