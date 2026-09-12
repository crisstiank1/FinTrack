import { describe, expect, it } from 'vitest'

import { planIncomeSourceSchema } from './schemas'

function parse(values: { name?: string; plannedAmount?: string; categoryIds?: string[] }) {
  return planIncomeSourceSchema.safeParse({
    name: 'Salario',
    plannedAmount: '3000000',
    categoryIds: [],
    ...values,
  })
}

describe('planIncomeSourceSchema', () => {
  it('acepta una fuente completa y devuelve el importe como entero', () => {
    const result = parse({})

    expect(result.success).toBe(true)
    expect(result.success && result.data.plannedAmount).toBe(3_000_000)
    expect(result.success && result.data.name).toBe('Salario')
  })

  it('acepta un monto agrupado en miles, como se teclea', () => {
    const result = parse({ plannedAmount: '3.000.000' })

    expect(result.success && result.data.plannedAmount).toBe(3_000_000)
  })

  it('COP 0 es válido y explícito: no es lo mismo que no tener fuente', () => {
    const result = parse({ plannedAmount: '0' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.plannedAmount).toBe(0)
  })

  it('un monto vacío es un error, no un cero', () => {
    const result = parse({ plannedAmount: '' })

    expect(result.success).toBe(false)
  })

  it('rechaza decimales y negativos en vez de redondearlos', () => {
    expect(parse({ plannedAmount: '1500,50' }).success).toBe(false)
    expect(parse({ plannedAmount: '-1000' }).success).toBe(false)
  })

  it('exige un nombre con contenido, no solo espacios', () => {
    expect(parse({ name: '' }).success).toBe(false)
    expect(parse({ name: '   ' }).success).toBe(false)
  })

  it('recorta el nombre antes de guardarlo', () => {
    const result = parse({ name: '  Salario  ' })

    expect(result.success && result.data.name).toBe('Salario')
  })

  it('respeta el límite de 80 caracteres del esquema', () => {
    expect(parse({ name: 'a'.repeat(80) }).success).toBe(true)
    expect(parse({ name: 'a'.repeat(81) }).success).toBe(false)
  })

  it('vincular categorías es opcional', () => {
    const sinCategorias = planIncomeSourceSchema.safeParse({
      name: 'Freelance',
      plannedAmount: '600000',
    })

    expect(sinCategorias.success).toBe(true)
    expect(sinCategorias.success && sinCategorias.data.categoryIds).toEqual([])
  })

  it('conserva las categorías seleccionadas', () => {
    const result = parse({ categoryIds: ['cat-salario', 'cat-bono'] })

    expect(result.success && result.data.categoryIds).toEqual(['cat-salario', 'cat-bono'])
  })
})
