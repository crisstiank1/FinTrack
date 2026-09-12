import { describe, expect, it } from 'vitest'

import {
  categoriesLinkedElsewhere,
  categoriesOfSource,
  diffIncomeSourceCategories,
  nextIncomeSourcePosition,
  selectLinkableIncomeCategories,
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
