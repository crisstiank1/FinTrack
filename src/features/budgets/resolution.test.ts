import { describe, expect, it } from 'vitest'

import { resolveBudget, type BudgetRow } from './resolution'

const CAT = 'cat-alimentacion'
const OTRA = 'cat-transporte'

function template(overrides: Partial<BudgetRow>): BudgetRow {
  return {
    id: crypto.randomUUID(),
    category_id: CAT,
    period_month: null,
    effective_from: '2026-09-01',
    amount_minor: 500_000,
    ...overrides,
  }
}

function exception(overrides: Partial<BudgetRow>): BudgetRow {
  const month = overrides.period_month ?? '2026-09-01'
  return template({ ...overrides, period_month: month, effective_from: month })
}

describe('resolveBudget', () => {
  it('resuelve una plantilla vigente', () => {
    const resolved = resolveBudget([template({ amount_minor: 500_000 })], CAT, '2026-09')

    expect(resolved).toMatchObject({ amountMinor: 500_000, source: 'template' })
  })

  it('la excepción del mes tiene prioridad sobre la plantilla', () => {
    const budgets = [
      template({ amount_minor: 500_000 }),
      exception({ period_month: '2026-09-01', amount_minor: 750_000 }),
    ]

    expect(resolveBudget(budgets, CAT, '2026-09')).toMatchObject({
      amountMinor: 750_000,
      source: 'exception',
    })
  })

  it('la excepción solo afecta a su mes', () => {
    const budgets = [
      template({ amount_minor: 500_000 }),
      exception({ period_month: '2026-09-01', amount_minor: 750_000 }),
    ]

    expect(resolveBudget(budgets, CAT, '2026-10')).toMatchObject({
      amountMinor: 500_000,
      source: 'template',
    })
  })

  it('elige la plantilla más reciente que no sea posterior al mes consultado', () => {
    const budgets = [
      template({ effective_from: '2026-08-01', amount_minor: 500_000 }),
      template({ effective_from: '2026-10-01', amount_minor: 900_000 }),
    ]

    expect(resolveBudget(budgets, CAT, '2026-11')).toMatchObject({ amountMinor: 900_000 })
  })

  it('un mes pasado no cambia al crear una versión posterior de la plantilla', () => {
    const budgets = [
      template({ effective_from: '2026-08-01', amount_minor: 500_000 }),
      template({ effective_from: '2026-10-01', amount_minor: 900_000 }),
    ]

    // Agosto y septiembre siguen viendo la versión antigua.
    expect(resolveBudget(budgets, CAT, '2026-08')).toMatchObject({ amountMinor: 500_000 })
    expect(resolveBudget(budgets, CAT, '2026-09')).toMatchObject({ amountMinor: 500_000 })
    // Octubre ya ve la nueva.
    expect(resolveBudget(budgets, CAT, '2026-10')).toMatchObject({ amountMinor: 900_000 })
  })

  it('ignora las plantillas que aún no han entrado en vigor', () => {
    const budgets = [template({ effective_from: '2026-10-01', amount_minor: 900_000 })]

    expect(resolveBudget(budgets, CAT, '2026-09')).toBeNull()
  })

  it('devuelve null cuando no hay plantilla ni excepción', () => {
    expect(resolveBudget([], CAT, '2026-09')).toBeNull()
  })

  it('no mezcla presupuestos de otras categorías', () => {
    const budgets = [template({ category_id: OTRA, amount_minor: 900_000 })]

    expect(resolveBudget(budgets, CAT, '2026-09')).toBeNull()
  })

  it('devuelve el 0 explícito en vez de tratarlo como ausencia', () => {
    const budgets = [
      template({ amount_minor: 500_000 }),
      exception({ period_month: '2026-09-01', amount_minor: 0 }),
    ]

    // Distinguir "excepción de 0" de "nunca configurado" le sirve a la interfaz;
    // convertirlo en "sin presupuesto" es tarea del cálculo de progreso.
    expect(resolveBudget(budgets, CAT, '2026-09')).toMatchObject({
      amountMinor: 0,
      source: 'exception',
    })
  })

  it('sigue resolviendo aunque la categoría esté archivada', () => {
    // La resolución no mira el estado de la categoría: un presupuesto histórico
    // debe poder consultarse después de archivarla.
    const budgets = [template({ effective_from: '2026-01-01', amount_minor: 400_000 })]

    expect(resolveBudget(budgets, CAT, '2026-06')).toMatchObject({ amountMinor: 400_000 })
  })
})
