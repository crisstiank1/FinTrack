import { describe, expect, it } from 'vitest'

import {
  groupExpensesByClassification,
  splitExpensesByPlanLine,
  sumActualExpenses,
  type PlanExpenseTransaction,
} from './expenses'

const CAT_RENT = 'cat-rent'
const CAT_INTERNET = 'cat-internet'
const CAT_GROCERIES = 'cat-groceries'
const CAT_UNPLANNED = 'cat-unplanned'
const CAT_LOAN = 'cat-loan'
const CAT_NO_GROUP = 'cat-no-group'

const transactions: PlanExpenseTransaction[] = [
  { type: 'expense', category_id: CAT_RENT, amount_minor: 100_000 }, // bill
  { type: 'expense', category_id: CAT_INTERNET, amount_minor: 5_000 }, // variable
  { type: 'expense', category_id: CAT_GROCERIES, amount_minor: 30_000 }, // variable
  { type: 'expense', category_id: CAT_UNPLANNED, amount_minor: 7_000 }, // sin línea
  { type: 'expense', category_id: CAT_LOAN, amount_minor: 20_000 }, // deuda, sin línea
  { type: 'expense', category_id: null, amount_minor: 1_000 }, // sin categoría
  { type: 'income', category_id: CAT_RENT, amount_minor: 500_000 }, // debe ignorarse
  { type: 'transfer', category_id: null, amount_minor: 15_000 }, // debe ignorarse
]

describe('splitExpensesByPlanLine', () => {
  it('separa facturas, variables y no planeado, ignorando ingresos y transferencias', () => {
    const result = splitExpensesByPlanLine(transactions, [CAT_RENT], [CAT_INTERNET, CAT_GROCERIES])

    expect(result).toEqual({
      billsMinor: 100_000,
      variablesMinor: 35_000,
      unplannedMinor: 28_000,
    })
  })

  it('cumple la identidad facturas + variables + noPlaneado = gastoActual', () => {
    const result = splitExpensesByPlanLine(transactions, [CAT_RENT], [CAT_INTERNET, CAT_GROCERIES])
    const gastoActual = sumActualExpenses(transactions)

    expect(result.billsMinor + result.variablesMinor + result.unplannedMinor).toBe(gastoActual)
  })

  it('sin líneas configuradas, todo el gasto cae en no planeado', () => {
    const result = splitExpensesByPlanLine(transactions, [], [])

    expect(result.billsMinor).toBe(0)
    expect(result.variablesMinor).toBe(0)
    expect(result.unplannedMinor).toBe(sumActualExpenses(transactions))
  })
})

describe('groupExpensesByClassification', () => {
  const classification: Partial<Record<string, 'needs' | 'wants' | 'debt'>> = {
    [CAT_RENT]: 'needs',
    [CAT_INTERNET]: 'wants',
    [CAT_GROCERIES]: 'needs',
    [CAT_LOAN]: 'debt',
    // CAT_UNPLANNED y CAT_NO_GROUP quedan sin clasificar a propósito.
  }

  it('agrupa el gasto por clasificación y manda lo no clasificado a su propia fila', () => {
    const result = groupExpensesByClassification(transactions, classification)

    expect(result).toEqual({
      needsMinor: 130_000, // CAT_RENT + CAT_GROCERIES
      wantsMinor: 5_000, // CAT_INTERNET
      debtMinor: 20_000, // CAT_LOAN
      sinClasificarMinor: 8_000, // CAT_UNPLANNED (7000) + sin categoría (1000)
    })
  })

  it('cumple la identidad needs + wants + debt + sinClasificar = gastoActual', () => {
    const result = groupExpensesByClassification(transactions, classification)
    const gastoActual = sumActualExpenses(transactions)

    expect(result.needsMinor + result.wantsMinor + result.debtMinor + result.sinClasificarMinor).toBe(
      gastoActual,
    )
  })

  it('una categoría archivada que conserva su clasificación se sigue agrupando normalmente', () => {
    const result = groupExpensesByClassification(
      [{ type: 'expense', category_id: CAT_NO_GROUP, amount_minor: 12_000 }],
      { [CAT_NO_GROUP]: 'wants' },
    )

    expect(result.wantsMinor).toBe(12_000)
    expect(result.sinClasificarMinor).toBe(0)
  })
})
