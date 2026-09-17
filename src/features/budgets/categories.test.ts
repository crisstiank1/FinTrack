import { describe, expect, it } from 'vitest'

import {
  budgetAssignmentRank,
  selectBudgetCategories,
  sortByBudgetAssignment,
  type BudgetCategory,
} from './categories'
import type { BudgetRow } from './resolution'

const MES = '2026-09'

function category(overrides: Partial<BudgetCategory> = {}): BudgetCategory {
  return {
    id: 'cat-food',
    name: 'Alimentación',
    type: 'expense',
    is_archived: false,
    ...overrides,
  }
}

function template(categoryId: string, effectiveFrom: string): BudgetRow {
  return {
    id: crypto.randomUUID(),
    category_id: categoryId,
    period_month: null,
    effective_from: effectiveFrom,
    amount_minor: 500_000,
  }
}

function exception(categoryId: string, month: string): BudgetRow {
  return {
    id: crypto.randomUUID(),
    category_id: categoryId,
    period_month: month,
    effective_from: month,
    amount_minor: 0,
  }
}

describe('selectBudgetCategories', () => {
  it('nunca lista categorías de ingreso, ni con presupuesto', () => {
    const ingreso = category({ id: 'cat-salary', name: 'Salario', type: 'income' })

    expect(selectBudgetCategories([ingreso], [template('cat-salary', '2026-09-01')], MES)).toEqual(
      [],
    )
  })

  it('lista las de gasto activas aunque no tengan presupuesto', () => {
    const activa = category()

    expect(selectBudgetCategories([activa], [], MES)).toEqual([activa])
  })

  it('lista una archivada si tiene plantilla vigente ese mes', () => {
    const archivada = category({ id: 'cat-old', name: 'Gimnasio', is_archived: true })

    expect(selectBudgetCategories([archivada], [template('cat-old', '2026-08-01')], MES)).toEqual([
      archivada,
    ])
  })

  it('lista una archivada si tiene excepción ese mes', () => {
    const archivada = category({ id: 'cat-old', is_archived: true })

    expect(selectBudgetCategories([archivada], [exception('cat-old', '2026-09-01')], MES)).toEqual([
      archivada,
    ])
  })

  it('oculta una archivada sin presupuesto resoluble ese mes', () => {
    const archivada = category({ id: 'cat-old', is_archived: true })

    expect(selectBudgetCategories([archivada], [], MES)).toEqual([])
  })

  it('oculta una archivada cuya plantilla empieza después del mes consultado', () => {
    const archivada = category({ id: 'cat-old', is_archived: true })

    expect(selectBudgetCategories([archivada], [template('cat-old', '2026-10-01')], MES)).toEqual(
      [],
    )
  })

  it('conserva el orden de entrada', () => {
    const uno = category({ id: 'a', name: 'Ahorro' })
    const dos = category({ id: 'b', name: 'Bebidas' })

    expect(selectBudgetCategories([dos, uno], [], MES)).toEqual([dos, uno])
  })
})

describe('orden por presupuesto asignado', () => {
  const conDinero = { budgetMinor: 500_000, source: 'template' as const }
  const enCero = { budgetMinor: null, source: 'exception' as const }
  const sinPresupuesto = { budgetMinor: null, source: null }

  it('pone primero el dinero asignado, luego el 0 explícito y al final lo que no tiene', () => {
    expect(budgetAssignmentRank(conDinero)).toBe(0)
    expect(budgetAssignmentRank(enCero)).toBe(1)
    expect(budgetAssignmentRank(sinPresupuesto)).toBe(2)
  })

  it('ordena la lista por esa prioridad', () => {
    const items = [
      { name: 'Arriendo', progress: sinPresupuesto },
      { name: 'Entretenimiento', progress: enCero },
      { name: 'Transporte', progress: conDinero },
      { name: 'Alimentación', progress: conDinero },
    ]

    expect(sortByBudgetAssignment(items).map((item) => item.name)).toEqual([
      'Transporte',
      'Alimentación',
      'Entretenimiento',
      'Arriendo',
    ])
  })

  it('dentro de cada grupo conserva el orden de entrada y no muta la lista', () => {
    const items = [
      { name: 'B', progress: sinPresupuesto },
      { name: 'A', progress: sinPresupuesto },
    ]

    expect(sortByBudgetAssignment(items).map((item) => item.name)).toEqual(['B', 'A'])
    expect(items.map((item) => item.name)).toEqual(['B', 'A'])
  })
})
