import { describe, expect, it } from 'vitest'

import {
  reconcileCategoryBudgets,
  summarizeAllocation,
  sumBudgetsForCategories,
  sumEffectiveCategoryBudgets,
  sumPlannedIncome,
  sumPlannedLineAmounts,
} from './reconciliation'

describe('sumPlannedIncome', () => {
  it('suma varias fuentes', () => {
    expect(sumPlannedIncome([{ plannedMinor: 3_000_000 }, { plannedMinor: 500_000 }])).toBe(3_500_000)
  })

  it('sin fuentes, es cero', () => {
    expect(sumPlannedIncome([])).toBe(0)
  })
})

describe('sumPlannedLineAmounts', () => {
  it('suma el planned_minor de varias líneas', () => {
    expect(sumPlannedLineAmounts([{ plannedMinor: 100_000 }, { plannedMinor: 50_000 }])).toBe(150_000)
  })
})

describe('sumEffectiveCategoryBudgets', () => {
  it('suma los presupuestos efectivos presentes en el mapa', () => {
    const result = sumEffectiveCategoryBudgets({ 'cat-a': 100_000, 'cat-b': 50_000 })
    expect(result).toBe(150_000)
  })

  it('sin categorías presupuestadas, es cero', () => {
    expect(sumEffectiveCategoryBudgets({})).toBe(0)
  })
})

describe('sumBudgetsForCategories', () => {
  const budgetsByCategory = { 'cat-rent': 500_000, 'cat-internet': 80_000, 'cat-groceries': 300_000 }

  it('suma solo las categorías pedidas', () => {
    expect(sumBudgetsForCategories(budgetsByCategory, ['cat-rent'])).toBe(500_000)
  })

  it('una categoría sin presupuesto efectivo en el mapa cuenta como 0', () => {
    expect(sumBudgetsForCategories(budgetsByCategory, ['cat-rent', 'cat-sin-presupuesto'])).toBe(500_000)
  })
})

describe('reconcileCategoryBudgets', () => {
  const budgetsByCategory = {
    'cat-rent': 500_000,
    'cat-internet': 80_000,
    'cat-groceries': 300_000,
    'cat-subscriptions': 40_000,
  }

  it('desglosa el presupuesto total en facturas, variables y sin línea', () => {
    const totalCategoryBudgetMinor = sumEffectiveCategoryBudgets(budgetsByCategory)

    const result = reconcileCategoryBudgets(
      totalCategoryBudgetMinor,
      ['cat-rent'],
      ['cat-internet', 'cat-groceries'],
      budgetsByCategory,
    )

    expect(result).toEqual({ billsMinor: 500_000, variablesMinor: 380_000, unlinkedMinor: 40_000 })
  })

  it('sin línea descriptiva no es un error: la fila puede valer 0', () => {
    const totalCategoryBudgetMinor = sumEffectiveCategoryBudgets(budgetsByCategory)
    const result = reconcileCategoryBudgets(
      totalCategoryBudgetMinor,
      ['cat-rent'],
      ['cat-internet', 'cat-groceries', 'cat-subscriptions'],
      budgetsByCategory,
    )

    expect(result.unlinkedMinor).toBe(0)
  })
})

describe('summarizeAllocation', () => {
  it('calcula lo asignado y lo restante por asignar', () => {
    const result = summarizeAllocation(3_000_000, 1_500_000, 200_000, 100_000)

    expect(result).toEqual({ assignedMinor: 1_800_000, unassignedMinor: 1_200_000 })
  })

  it('sobreasignado: porAsignar queda negativo', () => {
    const result = summarizeAllocation(1_000_000, 900_000, 200_000, 0)

    expect(result.unassignedMinor).toBe(-100_000)
  })

  it('con montos grandes, el resultado de la suma y la resta sigue siendo un entero seguro', () => {
    // 1 billón de unidades monetarias en centavos: muy por debajo de 2^53 - 1.
    const result = summarizeAllocation(100_000_000_000_000, 40_000_000_000_000, 0, 0)

    expect(Number.isSafeInteger(result.assignedMinor)).toBe(true)
    expect(Number.isSafeInteger(result.unassignedMinor)).toBe(true)
    expect(result.unassignedMinor).toBe(60_000_000_000_000)
  })
})
