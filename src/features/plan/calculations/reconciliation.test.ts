import { describe, expect, it } from 'vitest'

import {
  buildBudgetCoverage,
  reconcileCategoryBudgets,
  summarizeAllocation,
  sumBudgetsForCategories,
  sumEffectiveCategoryBudgets,
  sumPlannedIncome,
  sumPlannedLineAmounts,
} from './reconciliation'

describe('sumPlannedIncome', () => {
  it('suma varias fuentes', () => {
    expect(sumPlannedIncome([{ plannedMinor: 3_000_000 }, { plannedMinor: 500_000 }])).toBe(
      3_500_000,
    )
  })

  it('sin fuentes, es cero', () => {
    expect(sumPlannedIncome([])).toBe(0)
  })
})

describe('sumPlannedLineAmounts', () => {
  it('suma el planned_minor de varias líneas', () => {
    expect(sumPlannedLineAmounts([{ plannedMinor: 100_000 }, { plannedMinor: 50_000 }])).toBe(
      150_000,
    )
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
  const budgetsByCategory = {
    'cat-rent': 500_000,
    'cat-internet': 80_000,
    'cat-groceries': 300_000,
  }

  it('suma solo las categorías pedidas', () => {
    expect(sumBudgetsForCategories(budgetsByCategory, ['cat-rent'])).toBe(500_000)
  })

  it('una categoría sin presupuesto efectivo en el mapa cuenta como 0', () => {
    expect(sumBudgetsForCategories(budgetsByCategory, ['cat-rent', 'cat-sin-presupuesto'])).toBe(
      500_000,
    )
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

describe('buildBudgetCoverage', () => {
  const budgetsByCategory = {
    'cat-rent': 900_000,
    'cat-food': 700_000,
    'cat-transport': 150_000,
    'cat-gym': 60_000,
  }

  /** Progreso con presupuesto, sin él, o con un 0 explícito, como lo da /budgets. */
  const budgeted = (categoryId: string, budgetMinor: number) => ({
    categoryId,
    budgetMinor,
    source: 'template',
  })
  const withoutBudget = (categoryId: string) => ({ categoryId, budgetMinor: null, source: null })
  const zeroBudget = (categoryId: string) => ({
    categoryId,
    budgetMinor: null,
    source: 'exception',
  })

  const input = {
    budgetsByCategory,
    billCategoryIds: ['cat-rent', 'cat-internet'],
    variableCategoryIds: ['cat-food', 'cat-transport', 'cat-health'],
    lineBudgets: [
      budgeted('cat-rent', 900_000),
      withoutBudget('cat-internet'),
      budgeted('cat-food', 700_000),
      budgeted('cat-transport', 150_000),
      zeroBudget('cat-health'),
    ],
  }

  it('desglosa el total en facturas, variables y sin línea, y la suma es exacta', () => {
    const result = buildBudgetCoverage(input)

    expect(result).toMatchObject({
      totalMinor: 1_810_000,
      billsMinor: 900_000,
      variablesMinor: 850_000,
      unlinkedMinor: 60_000,
      coveredMinor: 1_750_000,
    })
    expect(result.billsMinor + result.variablesMinor + result.unlinkedMinor).toBe(result.totalMinor)
    expect(result.coveredMinor).toBe(result.billsMinor + result.variablesMinor)
  })

  it('coincide con reconcileCategoryBudgets, sin recalcularlo por su cuenta', () => {
    const result = buildBudgetCoverage(input)

    expect(result).toMatchObject(
      reconcileCategoryBudgets(
        sumEffectiveCategoryBudgets(budgetsByCategory),
        input.billCategoryIds,
        input.variableCategoryIds,
        budgetsByCategory,
      ),
    )
  })

  it('lista las categorías con presupuesto sin línea, y su importe es el de «sin línea»', () => {
    const result = buildBudgetCoverage(input)

    expect(result.unlinkedCategoryIds).toEqual(['cat-gym'])
    expect(sumBudgetsForCategories(budgetsByCategory, result.unlinkedCategoryIds)).toBe(
      result.unlinkedMinor,
    )
  })

  it('una categoría con línea nunca aparece como presupuesto sin línea', () => {
    const result = buildBudgetCoverage(input)
    const lineCategoryIds = [...input.billCategoryIds, ...input.variableCategoryIds]

    for (const categoryId of lineCategoryIds) {
      expect(result.unlinkedCategoryIds).not.toContain(categoryId)
    }
  })

  it('separa la línea sin presupuesto de la que tiene un 0 explícito', () => {
    const result = buildBudgetCoverage(input)

    expect(result.lineCategoryIdsWithoutBudget).toEqual(['cat-internet'])
    expect(result.lineCategoryIdsWithZeroBudget).toEqual(['cat-health'])
  })

  it('una línea con presupuesto no aparece en ninguna de las dos listas', () => {
    const result = buildBudgetCoverage(input)

    expect(result.lineCategoryIdsWithoutBudget).not.toContain('cat-rent')
    expect(result.lineCategoryIdsWithZeroBudget).not.toContain('cat-rent')
  })

  it('una línea sin progreso conocido cuenta como sin presupuesto, no como 0', () => {
    const result = buildBudgetCoverage({ ...input, lineBudgets: [] })

    expect(result.lineCategoryIdsWithZeroBudget).toEqual([])
    expect(result.lineCategoryIdsWithoutBudget).toEqual(['cat-internet', 'cat-health'])
  })

  it('el mapa de presupuestos manda sobre el progreso', () => {
    const result = buildBudgetCoverage({
      ...input,
      lineBudgets: [withoutBudget('cat-rent')],
    })

    expect(result.lineCategoryIdsWithoutBudget).not.toContain('cat-rent')
    expect(result.billsMinor).toBe(900_000)
  })

  it('sin líneas, todo el presupuesto queda sin línea', () => {
    const result = buildBudgetCoverage({
      budgetsByCategory,
      billCategoryIds: [],
      variableCategoryIds: [],
      lineBudgets: [],
    })

    expect(result.coveredMinor).toBe(0)
    expect(result.unlinkedMinor).toBe(result.totalMinor)
    expect(result.unlinkedCategoryIds.sort()).toEqual(Object.keys(budgetsByCategory).sort())
  })

  it('sin categorías presupuestadas lo marca como ausencia, y todas las líneas quedan sin presupuesto', () => {
    const result = buildBudgetCoverage({
      budgetsByCategory: {},
      billCategoryIds: ['cat-rent'],
      variableCategoryIds: ['cat-food'],
      lineBudgets: [withoutBudget('cat-rent'), withoutBudget('cat-food')],
    })

    expect(result).toMatchObject({
      totalMinor: 0,
      billsMinor: 0,
      variablesMinor: 0,
      unlinkedMinor: 0,
      coveredMinor: 0,
      hasCategoryBudgets: false,
      unlinkedCategoryIds: [],
      lineCategoryIdsWithoutBudget: ['cat-rent', 'cat-food'],
    })
  })

  it('con presupuestos, lo marca como presente', () => {
    expect(buildBudgetCoverage(input).hasCategoryBudgets).toBe(true)
  })

  it('con montos grandes, los importes siguen siendo enteros seguros', () => {
    const result = buildBudgetCoverage({
      budgetsByCategory: { 'cat-a': 60_000_000_000_000, 'cat-b': 40_000_000_000_000 },
      billCategoryIds: ['cat-a'],
      variableCategoryIds: [],
      lineBudgets: [],
    })

    expect(Number.isSafeInteger(result.totalMinor)).toBe(true)
    expect(result.unlinkedMinor).toBe(40_000_000_000_000)
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
