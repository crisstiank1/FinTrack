import { describe, expect, it } from 'vitest'

import {
  historicalReason,
  partitionCategoriesForClassification,
  type ClassifiableCategory,
  type ClassificationRow,
} from './mutations'

const ARRIENDO: ClassifiableCategory = {
  id: 'cat-vivienda',
  name: 'Vivienda',
  type: 'expense',
  is_archived: false,
}
const RESTAURANTES: ClassifiableCategory = {
  id: 'cat-restaurantes',
  name: 'Restaurantes',
  type: 'expense',
  is_archived: false,
}
const SALARIO: ClassifiableCategory = {
  id: 'cat-salario',
  name: 'Salario',
  type: 'income',
  is_archived: false,
}
const ANTIGUA: ClassifiableCategory = {
  id: 'cat-antigua',
  name: 'Gimnasio',
  type: 'expense',
  is_archived: true,
}

function names(entries: { category: ClassifiableCategory }[]): string[] {
  return entries.map((entry) => entry.category.name)
}

describe('partitionCategoriesForClassification', () => {
  it('sin clasificaciones, todo el gasto activo queda sin clasificar', () => {
    const result = partitionCategoriesForClassification([ARRIENDO, RESTAURANTES], [])

    expect(names(result.unclassified)).toEqual(['Vivienda', 'Restaurantes'])
    expect(result.classified).toEqual([])
    expect(result.historical).toEqual([])
  })

  it('no inventa un grupo por defecto: sin fila, el grupo es null', () => {
    const [entry] = partitionCategoriesForClassification([ARRIENDO], []).unclassified

    expect(entry.group).toBeNull()
    expect(entry.classificationId).toBeNull()
  })

  it('una categoría clasificada pasa al bloque de clasificadas con su grupo', () => {
    const rows: ClassificationRow[] = [
      { id: 'cls-1', category_id: 'cat-vivienda', budget_group: 'needs' },
    ]

    const result = partitionCategoriesForClassification([ARRIENDO, RESTAURANTES], rows)

    expect(names(result.classified)).toEqual(['Vivienda'])
    expect(result.classified[0].group).toBe('needs')
    expect(result.classified[0].classificationId).toBe('cls-1')
    expect(names(result.unclassified)).toEqual(['Restaurantes'])
  })

  it('las categorías de ingreso sin clasificar no aparecen en ningún bloque', () => {
    const result = partitionCategoriesForClassification([ARRIENDO, SALARIO], [])

    expect(names(result.unclassified)).toEqual(['Vivienda'])
    expect(names(result.classified)).toEqual([])
    expect(names(result.historical)).toEqual([])
  })

  it('una archivada sin clasificación tampoco: no se puede estrenar una', () => {
    const result = partitionCategoriesForClassification([ANTIGUA], [])

    expect(result.unclassified).toEqual([])
    expect(result.classified).toEqual([])
    expect(result.historical).toEqual([])
  })

  it('una archivada que sí tiene clasificación sigue visible y con su grupo', () => {
    const rows: ClassificationRow[] = [
      { id: 'cls-9', category_id: 'cat-antigua', budget_group: 'wants' },
    ]

    const result = partitionCategoriesForClassification([ANTIGUA], rows)

    expect(names(result.historical)).toEqual(['Gimnasio'])
    expect(result.historical[0].group).toBe('wants')
    expect(result.historical[0].classificationId).toBe('cls-9')
  })

  it('una que pasó a ser de ingreso conservando clasificación también', () => {
    const rows: ClassificationRow[] = [
      { id: 'cls-7', category_id: 'cat-salario', budget_group: 'debt' },
    ]

    const result = partitionCategoriesForClassification([SALARIO], rows)

    expect(names(result.historical)).toEqual(['Salario'])
    expect(result.historical[0].group).toBe('debt')
  })

  it('descarta un grupo que no existe en vez de pintarlo', () => {
    const rows: ClassificationRow[] = [
      { id: 'cls-x', category_id: 'cat-vivienda', budget_group: 'caprichos' },
    ]

    const result = partitionCategoriesForClassification([ARRIENDO], rows)

    // Sin grupo válido, la categoría vuelve a ser clasificable.
    expect(names(result.unclassified)).toEqual(['Vivienda'])
    expect(result.classified).toEqual([])
  })

  it('una clasificación sin categoría visible no aparece, y no rompe el resto', () => {
    const rows: ClassificationRow[] = [
      { id: 'cls-huerfana', category_id: 'cat-que-no-esta', budget_group: 'needs' },
      { id: 'cls-1', category_id: 'cat-vivienda', budget_group: 'needs' },
    ]

    const result = partitionCategoriesForClassification([ARRIENDO], rows)

    expect(names(result.classified)).toEqual(['Vivienda'])
    expect(result.unclassified).toEqual([])
    expect(result.historical).toEqual([])
  })

  it('conserva el orden de entrada de las categorías', () => {
    const result = partitionCategoriesForClassification([RESTAURANTES, ARRIENDO], [])

    expect(names(result.unclassified)).toEqual(['Restaurantes', 'Vivienda'])
  })

  it('cada categoría cae en un solo bloque', () => {
    const rows: ClassificationRow[] = [
      { id: 'cls-1', category_id: 'cat-vivienda', budget_group: 'needs' },
      { id: 'cls-9', category_id: 'cat-antigua', budget_group: 'wants' },
    ]

    const result = partitionCategoriesForClassification(
      [ARRIENDO, RESTAURANTES, SALARIO, ANTIGUA],
      rows,
    )
    const total = result.unclassified.length + result.classified.length + result.historical.length

    // Salario no entra en ninguno: es de ingreso y no tiene clasificación.
    expect(total).toBe(3)
    expect(names(result.unclassified)).toEqual(['Restaurantes'])
    expect(names(result.classified)).toEqual(['Vivienda'])
    expect(names(result.historical)).toEqual(['Gimnasio'])
  })
})

describe('historicalReason', () => {
  it('distingue archivada de dejó de ser de gasto', () => {
    expect(historicalReason(ANTIGUA)).toBe('Archivada')
    expect(historicalReason(SALARIO)).toBe('Ya no es de gasto')
  })
})
