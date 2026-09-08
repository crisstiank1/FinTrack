import { describe, expect, it } from 'vitest'

import { BudgetError } from './errors'
import { planBudgetWrite, type BudgetWriteInput } from './mutations'
import { resolveBudget, type BudgetRow } from './resolution'

const USER = 'user-1'
const CAT = 'cat-alimentacion'
const OTRA = 'cat-transporte'
const AHORA = '2026-09'

function template(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    id: crypto.randomUUID(),
    category_id: CAT,
    period_month: null,
    effective_from: '2026-09-01',
    amount_minor: 500_000,
    ...overrides,
  }
}

function exception(overrides: Partial<BudgetRow> = {}): BudgetRow {
  const month = overrides.period_month ?? '2026-09-01'
  return template({ ...overrides, period_month: month, effective_from: month })
}

function plan(budgets: BudgetRow[], input: Partial<BudgetWriteInput> = {}) {
  return planBudgetWrite(budgets, {
    userId: USER,
    amountMinor: 750_000,
    currentMonth: AHORA,
    intent: { kind: 'template', categoryId: CAT, monthKey: AHORA },
    ...input,
  })
}

describe('planBudgetWrite — plantillas', () => {
  it('crea la plantilla del mes actual con un INSERT', () => {
    expect(plan([])).toEqual({
      op: 'insert',
      row: {
        user_id: USER,
        category_id: CAT,
        period_month: null,
        effective_from: '2026-09-01',
        amount_minor: 750_000,
      },
    })
  })

  it('crea una plantilla de un mes futuro con un INSERT', () => {
    const result = plan([], { intent: { kind: 'template', categoryId: CAT, monthKey: '2026-12' } })

    expect(result).toMatchObject({ op: 'insert', row: { effective_from: '2026-12-01' } })
  })

  it('editar dos veces la plantilla del mismo mes hace UPDATE, no un segundo INSERT', () => {
    // El caso que chocaría contra budgets_template_unique_idx con un 23505.
    const vigente = template({ effective_from: '2026-09-01', amount_minor: 500_000 })

    expect(plan([vigente])).toEqual({
      op: 'update',
      id: vigente.id,
      patch: { amount_minor: 750_000 },
    })
  })

  it('una plantilla anterior no impide crear la versión del mes actual', () => {
    const antigua = template({ effective_from: '2026-08-01' })

    expect(plan([antigua])).toMatchObject({ op: 'insert' })
  })

  it('rechaza versionar hacia atrás: cambiaría un mes ya cerrado', () => {
    expect(() =>
      plan([], { intent: { kind: 'template', categoryId: CAT, monthKey: '2026-08' } }),
    ).toThrowError(new BudgetError('past_month_template'))
  })

  it('no confunde la plantilla de otra categoría', () => {
    const ajena = template({ category_id: OTRA, effective_from: '2026-09-01' })

    expect(plan([ajena])).toMatchObject({ op: 'insert' })
  })

  it('no confunde una excepción del mismo mes con la plantilla', () => {
    const excepcion = exception({ period_month: '2026-09-01' })

    expect(plan([excepcion])).toMatchObject({ op: 'insert', row: { period_month: null } })
  })
})

describe('planBudgetWrite — excepciones', () => {
  const intentSep: BudgetWriteInput['intent'] = {
    kind: 'exception',
    categoryId: CAT,
    monthKey: '2026-09',
  }

  it('crea la excepción con period_month igual a effective_from', () => {
    expect(plan([], { intent: intentSep })).toEqual({
      op: 'insert',
      row: {
        user_id: USER,
        category_id: CAT,
        period_month: '2026-09-01',
        effective_from: '2026-09-01',
        amount_minor: 750_000,
      },
    })
  })

  it('actualiza en sitio la excepción que ya existe para ese mes', () => {
    const existente = exception({ period_month: '2026-09-01', amount_minor: 100_000 })

    expect(plan([existente], { intent: intentSep })).toEqual({
      op: 'update',
      id: existente.id,
      patch: { amount_minor: 750_000 },
    })
  })

  it('un importe 0 es una excepción normal, sin trato especial', () => {
    expect(plan([], { intent: intentSep, amountMinor: 0 })).toMatchObject({
      op: 'insert',
      row: { period_month: '2026-09-01', amount_minor: 0 },
    })
  })

  it('permite excepciones en un mes pasado', () => {
    const intent = { kind: 'exception', categoryId: CAT, monthKey: '2026-05' } as const

    expect(plan([], { intent })).toMatchObject({
      op: 'insert',
      row: { period_month: '2026-05-01', effective_from: '2026-05-01' },
    })
  })

  it('permite excepciones en un mes futuro', () => {
    const intent = { kind: 'exception', categoryId: CAT, monthKey: '2027-01' } as const

    expect(plan([], { intent })).toMatchObject({
      op: 'insert',
      row: { period_month: '2027-01-01' },
    })
  })

  it('no confunde la excepción de otra categoría', () => {
    const ajena = exception({ category_id: OTRA, period_month: '2026-09-01' })

    expect(plan([ajena], { intent: intentSep })).toMatchObject({ op: 'insert' })
  })
})

describe('planBudgetWrite — correcciones', () => {
  it('solo toca el importe: ni categoría, ni period_month, ni effective_from', () => {
    const historica = template({ effective_from: '2026-03-01', amount_minor: 100_000 })

    const result = plan([historica], {
      intent: { kind: 'correction', budgetId: historica.id },
      amountMinor: 120_000,
    })

    expect(result).toEqual({
      op: 'update',
      id: historica.id,
      patch: { amount_minor: 120_000 },
    })

    // Explícito: cualquier otra clave en el patch rompería la corrección de
    // presupuestos cuya categoría se archivó o cambió de tipo después.
    const { patch } = result as { patch: Record<string, unknown> }
    expect(Object.keys(patch)).toEqual(['amount_minor'])
  })

  it('corrige una fila de un mes ya cerrado', () => {
    const historica = exception({ period_month: '2026-01-01' })

    expect(
      plan([historica], { intent: { kind: 'correction', budgetId: historica.id } }),
    ).toMatchObject({ op: 'update', id: historica.id })
  })

  it('falla si la fila ya no existe', () => {
    expect(() => plan([], { intent: { kind: 'correction', budgetId: 'no-existe' } })).toThrowError(
      new BudgetError('row_missing'),
    )
  })
})

describe('planBudgetWrite — importes inválidos', () => {
  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rechaza %p', (amountMinor) => {
    expect(() => plan([], { amountMinor })).toThrowError(new BudgetError('invalid_amount'))
  })
})

describe('planBudgetWrite — convivencia con las versiones existentes', () => {
  it('una excepción intermedia no altera el alcance de las plantillas', () => {
    // Plantilla anterior (agosto), plantilla futura (diciembre) y una
    // excepción en octubre, justo entre las dos.
    const anterior = template({ effective_from: '2026-08-01', amount_minor: 500_000 })
    const futura = template({ effective_from: '2026-12-01', amount_minor: 900_000 })
    const budgets = [anterior, futura]

    const result = plan(budgets, {
      intent: { kind: 'exception', categoryId: CAT, monthKey: '2026-10' },
      amountMinor: 0,
    })

    expect(result).toMatchObject({ op: 'insert' })

    // Se aplica el plan y se comprueba la resolución mes a mes.
    const { row } = result as { row: { period_month: string; effective_from: string } }
    const conExcepcion: BudgetRow[] = [
      ...budgets,
      {
        id: 'nueva',
        category_id: CAT,
        period_month: row.period_month,
        effective_from: row.effective_from,
        amount_minor: 0,
      },
    ]

    const resolver = (monthKey: string) => resolveBudget(conExcepcion, CAT, monthKey)

    expect(resolver('2026-07')).toBeNull()
    expect(resolver('2026-08')).toMatchObject({ amountMinor: 500_000, source: 'template' })
    expect(resolver('2026-09')).toMatchObject({ amountMinor: 500_000, source: 'template' })
    // Solo octubre cambia, y por la excepción.
    expect(resolver('2026-10')).toMatchObject({ amountMinor: 0, source: 'exception' })
    expect(resolver('2026-11')).toMatchObject({ amountMinor: 500_000, source: 'template' })
    expect(resolver('2026-12')).toMatchObject({ amountMinor: 900_000, source: 'template' })
    expect(resolver('2027-03')).toMatchObject({ amountMinor: 900_000, source: 'template' })

    // Y las dos plantillas siguen intactas: el plan no las tocó.
    expect(anterior.amount_minor).toBe(500_000)
    expect(futura.amount_minor).toBe(900_000)
  })
})
