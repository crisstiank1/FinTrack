import { describe, expect, it } from 'vitest'

import { ALLOCATION_GROUPS } from './calculations/allocation'
import {
  buildAllocationRows,
  buildContributionLineRow,
  buildPlanLineRow,
  categoriesLinkedElsewhere,
  categoriesOfSource,
  diffIncomeSourceCategories,
  nextPosition,
  selectAvailableContributionAccounts,
  selectAvailableLineCategories,
  selectLinkableIncomeCategories,
  toAllocationBasisPoints,
  usedLineAccountIds,
  usedLineCategoryIds,
  ALLOCATION_CONFLICT_TARGET,
  type IncomeSourceCategoryRow,
  type LinkableCategory,
} from './mutations'

describe('nextPosition', () => {
  it('la primera fuente ocupa la posición cero', () => {
    expect(nextPosition([])).toBe(0)
  })

  it('continúa después de la última posición', () => {
    expect(nextPosition([{ position: 0 }, { position: 1 }])).toBe(2)
  })

  it('no reutiliza una posición libre cuando hay huecos', () => {
    // Con tres fuentes de posiciones 0, 1 y 2, borrar la del medio deja [0, 2].
    // Contar filas daría 2, que ya está ocupada y chocaría con U8.
    const conHuecos = [{ position: 0 }, { position: 2 }]

    expect(nextPosition(conHuecos)).toBe(3)
    expect(nextPosition(conHuecos)).not.toBe(conHuecos.length)
  })

  it('no depende del orden de llegada', () => {
    expect(nextPosition([{ position: 5 }, { position: 1 }])).toBe(6)
  })
})

describe('diffIncomeSourceCategories', () => {
  it('sin cambios no escribe nada', () => {
    expect(diffIncomeSourceCategories(['a', 'b'], ['b', 'a'])).toEqual({ toAdd: [], toRemove: [] })
  })

  it('añade solo lo nuevo', () => {
    expect(diffIncomeSourceCategories(['a'], ['a', 'b'])).toEqual({ toAdd: ['b'], toRemove: [] })
  })

  it('retira solo lo que el usuario quitó', () => {
    expect(diffIncomeSourceCategories(['a', 'b'], ['a'])).toEqual({ toAdd: [], toRemove: ['b'] })
  })

  it('combina altas y bajas en una sola pasada', () => {
    expect(diffIncomeSourceCategories(['a', 'b'], ['b', 'c'])).toEqual({
      toAdd: ['c'],
      toRemove: ['a'],
    })
  })

  it('quedarse sin categorías retira todas, pero no las vuelve a añadir', () => {
    expect(diffIncomeSourceCategories(['a', 'b'], [])).toEqual({ toAdd: [], toRemove: ['a', 'b'] })
  })

  it('desde cero solo añade', () => {
    expect(diffIncomeSourceCategories([], ['a'])).toEqual({ toAdd: ['a'], toRemove: [] })
  })

  it('ignora duplicados: un vínculo se tiene o no se tiene', () => {
    expect(diffIncomeSourceCategories(['a'], ['a', 'a', 'b'])).toEqual({
      toAdd: ['b'],
      toRemove: [],
    })
  })
})

describe('selectLinkableIncomeCategories', () => {
  const categories: LinkableCategory[] = [
    { id: 'salario', type: 'income', is_archived: false },
    { id: 'freelance', type: 'income', is_archived: false },
    { id: 'bono-viejo', type: 'income', is_archived: true },
    { id: 'mercado', type: 'expense', is_archived: false },
  ]

  it('solo ofrece categorías de ingreso activas', () => {
    const result = selectLinkableIncomeCategories(categories, new Set())

    expect(result.map((category) => category.id)).toEqual(['salario', 'freelance'])
  })

  it('no ofrece una categoría que ya alimenta otra fuente del mes', () => {
    const result = selectLinkableIncomeCategories(categories, new Set(['freelance']))

    expect(result.map((category) => category.id)).toEqual(['salario'])
  })

  it('no ofrece categorías de gasto ni archivadas aunque estén libres', () => {
    const result = selectLinkableIncomeCategories(categories, new Set())

    expect(result.some((category) => category.id === 'mercado')).toBe(false)
    expect(result.some((category) => category.id === 'bono-viejo')).toBe(false)
  })
})

describe('categoriesLinkedElsewhere', () => {
  const links: IncomeSourceCategoryRow[] = [
    { plan_income_source_id: 'src-1', category_id: 'salario' },
    { plan_income_source_id: 'src-1', category_id: 'bono' },
    { plan_income_source_id: 'src-2', category_id: 'freelance' },
  ]

  it('al crear una fuente, todas las vinculadas están ocupadas', () => {
    expect(categoriesLinkedElsewhere(links)).toEqual(new Set(['salario', 'bono', 'freelance']))
  })

  it('al editar, las categorías de la propia fuente siguen disponibles', () => {
    const occupied = categoriesLinkedElsewhere(links, 'src-1')

    expect(occupied.has('salario')).toBe(false)
    expect(occupied.has('bono')).toBe(false)
    expect(occupied.has('freelance')).toBe(true)
  })

  it('una fuente que se edita puede seguir viendo sus propias categorías', () => {
    const categories: LinkableCategory[] = [
      { id: 'salario', type: 'income', is_archived: false },
      { id: 'freelance', type: 'income', is_archived: false },
    ]

    const result = selectLinkableIncomeCategories(
      categories,
      categoriesLinkedElsewhere(links, 'src-1'),
    )

    expect(result.map((category) => category.id)).toEqual(['salario'])
  })
})

describe('categoriesOfSource', () => {
  it('devuelve solo las categorías de la fuente pedida', () => {
    const links: IncomeSourceCategoryRow[] = [
      { plan_income_source_id: 'src-1', category_id: 'salario' },
      { plan_income_source_id: 'src-2', category_id: 'freelance' },
    ]

    expect(categoriesOfSource(links, 'src-1')).toEqual(['salario'])
    expect(categoriesOfSource(links, 'src-3')).toEqual([])
  })
})

describe('toAllocationBasisPoints', () => {
  it('convierte porcentajes enteros a puntos base', () => {
    const result = toAllocationBasisPoints({
      needs: 50,
      wants: 30,
      savings: 20,
      investment: 0,
      debt: 0,
    })

    expect(result).toEqual({
      needs: 5_000,
      wants: 3_000,
      savings: 2_000,
      investment: 0,
      debt: 0,
    })
  })

  it('un reparto que suma 100 da exactamente 10 000 puntos base', () => {
    const result = toAllocationBasisPoints({
      needs: 45,
      wants: 25,
      savings: 15,
      investment: 10,
      debt: 5,
    })
    const total = ALLOCATION_GROUPS.reduce((sum, group) => sum + result[group], 0)

    expect(total).toBe(10_000)
  })
})

describe('buildAllocationRows', () => {
  const PERCENTAGES = { needs: 50, wants: 30, savings: 20, investment: 0, debt: 0 }

  function build(percentages = PERCENTAGES) {
    return buildAllocationRows({
      userId: 'user-1',
      planMonthId: 'plan-month-1',
      percentages,
    })
  }

  it('construye exactamente cinco filas, una por grupo', () => {
    expect(build()).toHaveLength(5)
  })

  it('las cinco comparten el mismo mes y el mismo usuario', () => {
    const rows = build()

    expect(new Set(rows.map((row) => row.plan_month_id))).toEqual(new Set(['plan-month-1']))
    expect(new Set(rows.map((row) => row.user_id))).toEqual(new Set(['user-1']))
  })

  it('la suma de percent_bp es 10 000, que es lo que exige el trigger', () => {
    const total = build().reduce((sum, row) => sum + row.percent_bp, 0)

    expect(total).toBe(10_000)
  })

  it('respeta el orden fijo de ALLOCATION_GROUPS', () => {
    expect(build().map((row) => row.budget_group)).toEqual([...ALLOCATION_GROUPS])
  })

  it('escribe también los grupos en cero: el reparto se guarda entero', () => {
    const rows = build()
    const investment = rows.find((row) => row.budget_group === 'investment')

    expect(investment).toBeDefined()
    expect(investment?.percent_bp).toBe(0)
  })

  it('cada fila lleva las cuatro columnas NOT NULL de plan_allocations', () => {
    for (const row of build()) {
      expect(Object.keys(row).sort()).toEqual([
        'budget_group',
        'percent_bp',
        'plan_month_id',
        'user_id',
      ])
    }
  })

  it('el payload completo es el esperado, sin columnas inventadas', () => {
    expect(build()).toEqual([
      {
        user_id: 'user-1',
        plan_month_id: 'plan-month-1',
        budget_group: 'needs',
        percent_bp: 5_000,
      },
      {
        user_id: 'user-1',
        plan_month_id: 'plan-month-1',
        budget_group: 'wants',
        percent_bp: 3_000,
      },
      {
        user_id: 'user-1',
        plan_month_id: 'plan-month-1',
        budget_group: 'savings',
        percent_bp: 2_000,
      },
      {
        user_id: 'user-1',
        plan_month_id: 'plan-month-1',
        budget_group: 'investment',
        percent_bp: 0,
      },
      { user_id: 'user-1', plan_month_id: 'plan-month-1', budget_group: 'debt', percent_bp: 0 },
    ])
  })

  it('la edición construye el mismo conjunto completo que la primera vez', () => {
    const editado = build({ needs: 40, wants: 20, savings: 20, investment: 10, debt: 10 })

    expect(editado).toHaveLength(5)
    expect(editado.map((row) => row.budget_group)).toEqual([...ALLOCATION_GROUPS])
    expect(editado.reduce((sum, row) => sum + row.percent_bp, 0)).toBe(10_000)
  })
})

describe('ALLOCATION_CONFLICT_TARGET', () => {
  it('nombra la restricción única real, sin user_id', () => {
    // `plan_allocations_plan_month_id_budget_group_key` es unique
    // (plan_month_id, budget_group). Añadir user_id apuntaría a un índice que
    // no existe y PostgREST rechazaría el upsert.
    expect(ALLOCATION_CONFLICT_TARGET).toBe('plan_month_id,budget_group')
    expect(ALLOCATION_CONFLICT_TARGET).not.toContain('user_id')
  })
})
describe('usedLineCategoryIds', () => {
  const lines = [
    { id: 'l1', category_id: 'cat-vivienda' },
    { id: 'l2', category_id: 'cat-mercado' },
    { id: 'l3', category_id: null },
  ]

  it('recoge las categorías ya descritas por una línea', () => {
    expect(usedLineCategoryIds(lines)).toEqual(new Set(['cat-vivienda', 'cat-mercado']))
  })

  it('ignora las líneas sin categoría: ahorro e inversión se miden por cuenta', () => {
    expect(usedLineCategoryIds(lines).has('null')).toBe(false)
    expect(usedLineCategoryIds(lines).size).toBe(2)
  })

  it('excluye la propia línea cuando se pide', () => {
    const used = usedLineCategoryIds(lines, 'l1')

    expect(used.has('cat-vivienda')).toBe(false)
    expect(used.has('cat-mercado')).toBe(true)
  })

  it('sin líneas no hay nada ocupado', () => {
    expect(usedLineCategoryIds([])).toEqual(new Set())
  })
})

describe('selectAvailableLineCategories', () => {
  const categories = [
    { id: 'vivienda', type: 'expense', is_archived: false },
    { id: 'mercado', type: 'expense', is_archived: false },
    { id: 'gimnasio', type: 'expense', is_archived: true },
    { id: 'salario', type: 'income', is_archived: false },
  ]

  it('solo ofrece categorías de gasto activas', () => {
    const result = selectAvailableLineCategories(categories, new Set())

    expect(result.map((category) => category.id)).toEqual(['vivienda', 'mercado'])
  })

  it('no ofrece una categoría que ya tiene línea este mes', () => {
    const result = selectAvailableLineCategories(categories, new Set(['mercado']))

    expect(result.map((category) => category.id)).toEqual(['vivienda'])
  })

  it('no ofrece archivadas ni de ingreso aunque estén libres', () => {
    const result = selectAvailableLineCategories(categories, new Set())

    expect(result.some((category) => category.id === 'gimnasio')).toBe(false)
    expect(result.some((category) => category.id === 'salario')).toBe(false)
  })

  it('sin categorías libres devuelve la lista vacía', () => {
    const result = selectAvailableLineCategories(categories, new Set(['vivienda', 'mercado']))

    expect(result).toEqual([])
  })
})

describe('buildPlanLineRow', () => {
  const base = {
    userId: 'user-1',
    planMonthId: 'plan-month-1',
    periodMonth: '2026-09-01',
    categoryId: 'cat-vivienda',
    lines: [],
  }

  it('construye una factura con todas las columnas obligatorias', () => {
    const row = buildPlanLineRow({ ...base, kind: 'bill', name: 'Arriendo' })

    expect(row).toEqual({
      user_id: 'user-1',
      plan_month_id: 'plan-month-1',
      period_month: '2026-09-01',
      kind: 'bill',
      name: 'Arriendo',
      category_id: 'cat-vivienda',
      position: 0,
    })
  })

  it('nunca envía planned_minor: C7 lo exige nulo cuando hay categoría', () => {
    const bill = buildPlanLineRow({ ...base, kind: 'bill', name: 'Arriendo' })
    const variable = buildPlanLineRow({ ...base, kind: 'variable', name: 'Mercado' })

    expect(bill).not.toHaveProperty('planned_minor')
    expect(variable).not.toHaveProperty('planned_minor')
  })

  it('añade due_date solo en una factura y solo si se escribió', () => {
    const conFecha = buildPlanLineRow({
      ...base,
      kind: 'bill',
      name: 'Arriendo',
      dueDate: '2026-09-05',
    })
    const sinFecha = buildPlanLineRow({ ...base, kind: 'bill', name: 'Arriendo', dueDate: null })

    expect(conFecha.due_date).toBe('2026-09-05')
    expect(sinFecha).not.toHaveProperty('due_date')
  })

  it('una variable nunca lleva due_date, aunque llegue una', () => {
    const row = buildPlanLineRow({
      ...base,
      kind: 'variable',
      name: 'Mercado',
      dueDate: '2026-09-05',
    })

    expect(row).not.toHaveProperty('due_date')
  })

  it('la posición continúa la secuencia del mes, no la del tipo', () => {
    // U12 no distingue `kind`: ahorro e inversión comparten la secuencia.
    const row = buildPlanLineRow({
      ...base,
      kind: 'bill',
      name: 'Arriendo',
      lines: [{ position: 0 }, { position: 1 }, { position: 2 }],
    })

    expect(row.position).toBe(3)
  })

  it('no reutiliza una posición libre cuando hay huecos', () => {
    const row = buildPlanLineRow({
      ...base,
      kind: 'variable',
      name: 'Mercado',
      lines: [{ position: 0 }, { position: 2 }],
    })

    expect(row.position).toBe(3)
  })

  it('nunca envía account_id: el eje de estas líneas es la categoría', () => {
    const row = buildPlanLineRow({ ...base, kind: 'bill', name: 'Arriendo' })

    expect(row).not.toHaveProperty('account_id')
  })
})

describe('usedLineAccountIds', () => {
  it('reúne las cuentas de las líneas de aporte e ignora las de categoría', () => {
    const lines = [
      { id: 'l1', account_id: null },
      { id: 'l2', account_id: 'acc-fondo' },
      { id: 'l3', account_id: 'acc-broker' },
    ]

    expect(usedLineAccountIds(lines)).toEqual(new Set(['acc-fondo', 'acc-broker']))
  })

  it('puede excluir la línea que se edita', () => {
    const lines = [
      { id: 'l2', account_id: 'acc-fondo' },
      { id: 'l3', account_id: 'acc-broker' },
    ]

    expect(usedLineAccountIds(lines, 'l2')).toEqual(new Set(['acc-broker']))
  })
})

describe('selectAvailableContributionAccounts', () => {
  const accounts = [
    { id: 'acc-banco', type: 'checking', is_archived: false },
    { id: 'acc-fondo', type: 'savings', is_archived: false },
    { id: 'acc-reserva', type: 'savings', is_archived: false },
    { id: 'acc-vieja', type: 'savings', is_archived: true },
    { id: 'acc-broker', type: 'investment', is_archived: false },
  ]

  it('solo ofrece cuentas del tipo del aporte (T3)', () => {
    expect(
      selectAvailableContributionAccounts(accounts, 'savings', new Set()).map((a) => a.id),
    ).toEqual(['acc-fondo', 'acc-reserva'])
    expect(
      selectAvailableContributionAccounts(accounts, 'investment', new Set()).map((a) => a.id),
    ).toEqual(['acc-broker'])
  })

  it('no ofrece cuentas archivadas: T3 prohíbe estrenarlas', () => {
    const ids = selectAvailableContributionAccounts(accounts, 'savings', new Set()).map((a) => a.id)

    expect(ids).not.toContain('acc-vieja')
  })

  it('no ofrece cuentas que ya tienen aporte este mes (U11)', () => {
    expect(
      selectAvailableContributionAccounts(accounts, 'savings', new Set(['acc-fondo'])).map(
        (a) => a.id,
      ),
    ).toEqual(['acc-reserva'])
  })

  it('con la moneda del Plan no ofrece cuentas en otra moneda', () => {
    const withCurrencies = [
      { id: 'acc-fondo', type: 'savings', is_archived: false, currency_code: 'COP' },
      { id: 'acc-dolares', type: 'savings', is_archived: false, currency_code: 'USD' },
    ]

    expect(
      selectAvailableContributionAccounts(withCurrencies, 'savings', new Set(), 'COP').map(
        (a) => a.id,
      ),
    ).toEqual(['acc-fondo'])
  })

  it('sin cuentas libres devuelve la lista vacía', () => {
    expect(
      selectAvailableContributionAccounts(
        accounts,
        'savings',
        new Set(['acc-fondo', 'acc-reserva']),
      ),
    ).toEqual([])
  })
})

describe('buildContributionLineRow', () => {
  const base = {
    userId: 'user-1',
    planMonthId: 'plan-month-1',
    periodMonth: '2026-09-01',
    accountId: 'acc-fondo',
    lines: [],
  }

  it('construye un aporte a ahorro con cuenta e importe', () => {
    const row = buildContributionLineRow({
      ...base,
      kind: 'savings',
      name: 'Fondo de emergencia',
      plannedMinor: 500_000,
    })

    expect(row).toEqual({
      user_id: 'user-1',
      plan_month_id: 'plan-month-1',
      period_month: '2026-09-01',
      kind: 'savings',
      name: 'Fondo de emergencia',
      account_id: 'acc-fondo',
      planned_minor: 500_000,
      position: 0,
    })
  })

  it('nunca envía categoría ni fecha: C5 y C3 las rechazan en un aporte', () => {
    const row = buildContributionLineRow({
      ...base,
      kind: 'investment',
      name: 'Broker',
      plannedMinor: 100_000,
    })

    expect(row).not.toHaveProperty('category_id')
    expect(row).not.toHaveProperty('due_date')
  })

  it('un importe de 0 viaja como 0, no como ausencia', () => {
    const row = buildContributionLineRow({
      ...base,
      kind: 'savings',
      name: 'Fondo',
      plannedMinor: 0,
    })

    expect(row.planned_minor).toBe(0)
  })

  it('toma la posición siguiente entre todas las líneas del mes, de cualquier tipo (U12)', () => {
    const row = buildContributionLineRow({
      ...base,
      kind: 'savings',
      name: 'Fondo',
      plannedMinor: 1,
      lines: [{ position: 0 }, { position: 3 }],
    })

    expect(row.position).toBe(4)
  })
})
