import { describe, expect, it } from 'vitest'

import { ALLOCATION_GROUPS } from './calculations/allocation'
import {
  buildAllocationRows,
  categoriesLinkedElsewhere,
  categoriesOfSource,
  diffIncomeSourceCategories,
  nextIncomeSourcePosition,
  selectLinkableIncomeCategories,
  toAllocationBasisPoints,
  ALLOCATION_CONFLICT_TARGET,
  type IncomeSourceCategoryRow,
  type LinkableCategory,
} from './mutations'

describe('nextIncomeSourcePosition', () => {
  it('la primera fuente ocupa la posición cero', () => {
    expect(nextIncomeSourcePosition([])).toBe(0)
  })

  it('continúa después de la última posición', () => {
    expect(nextIncomeSourcePosition([{ position: 0 }, { position: 1 }])).toBe(2)
  })

  it('no reutiliza una posición libre cuando hay huecos', () => {
    // Con tres fuentes de posiciones 0, 1 y 2, borrar la del medio deja [0, 2].
    // Contar filas daría 2, que ya está ocupada y chocaría con U8.
    const conHuecos = [{ position: 0 }, { position: 2 }]

    expect(nextIncomeSourcePosition(conHuecos)).toBe(3)
    expect(nextIncomeSourcePosition(conHuecos)).not.toBe(conHuecos.length)
  })

  it('no depende del orden de llegada', () => {
    expect(nextIncomeSourcePosition([{ position: 5 }, { position: 1 }])).toBe(6)
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
