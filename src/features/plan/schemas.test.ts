import { describe, expect, it } from 'vitest'

import { ALLOCATION_GROUPS } from './calculations/allocation'
import {
  allocationFormSchema,
  buildPlanLineSchema,
  contributionLineSchema,
  planIncomeSourceSchema,
  ALLOCATION_PRESET,
  ALLOCATION_SUM_ERROR,
} from './schemas'

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

describe('allocationFormSchema', () => {
  const PRESET = { needs: '50', wants: '30', savings: '20', investment: '0', debt: '0' }

  function parseAllocation(values: Partial<Record<string, string>> = {}) {
    return allocationFormSchema.safeParse({ ...PRESET, ...values })
  }

  it('acepta el preset y devuelve los cinco porcentajes como enteros', () => {
    const result = parseAllocation()

    expect(result.success).toBe(true)
    expect(result.success && result.data).toEqual({
      needs: 50,
      wants: 30,
      savings: 20,
      investment: 0,
      debt: 0,
    })
  })

  it('el preset suma exactamente 100', () => {
    const total = ALLOCATION_GROUPS.reduce((sum, group) => sum + ALLOCATION_PRESET[group], 0)

    expect(total).toBe(100)
  })

  it('un grupo en 0 es una decisión válida, no un campo vacío', () => {
    const result = parseAllocation({ needs: '100', wants: '0', savings: '0' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.wants).toBe(0)
  })

  it('rechaza un total que no suma 100, por arriba y por abajo', () => {
    expect(parseAllocation({ needs: '60' }).success).toBe(false)
    expect(parseAllocation({ needs: '40' }).success).toBe(false)
  })

  it('el error del total no se atribuye a ningún grupo concreto', () => {
    const result = parseAllocation({ needs: '60' })
    const issue = !result.success && result.error.issues[0]

    expect(issue && issue.path).toEqual(['root'])
    expect(issue && issue.message).toBe(ALLOCATION_SUM_ERROR)
  })

  it('rechaza porcentajes fraccionarios en vez de redondearlos', () => {
    // 33,33 tres veces suman 99,99: el tercio exacto no existe en este modelo.
    expect(parseAllocation({ needs: '33,33' }).success).toBe(false)
    expect(parseAllocation({ needs: '33.33' }).success).toBe(false)
  })

  it('un campo vacío es un error, no un cero', () => {
    expect(parseAllocation({ investment: '' }).success).toBe(false)
  })

  it('rechaza negativos y valores por encima de 100', () => {
    expect(parseAllocation({ needs: '-10' }).success).toBe(false)
    expect(parseAllocation({ needs: '150' }).success).toBe(false)
  })

  it('no acepta puntos base disfrazados de porcentaje', () => {
    // 5000 sería 50 % en la tabla, pero aquí significaría 5000 %.
    expect(parseAllocation({ needs: '5000' }).success).toBe(false)
  })

  it('recorta los espacios antes de medir', () => {
    expect(parseAllocation({ needs: ' 50 ' }).success).toBe(true)
  })
})

describe('buildPlanLineSchema', () => {
  const schema = buildPlanLineSchema('2026-09')

  function parseLine(values: Record<string, string> = {}) {
    return schema.safeParse({
      name: 'Arriendo',
      kind: 'bill',
      categoryId: 'cat-vivienda',
      dueDate: '',
      ...values,
    })
  }

  it('acepta una factura completa y normaliza la fecha', () => {
    const result = parseLine({ dueDate: '2026-09-05' })

    expect(result.success).toBe(true)
    expect(result.success && result.data).toEqual({
      name: 'Arriendo',
      kind: 'bill',
      categoryId: 'cat-vivienda',
      dueDate: '2026-09-05',
    })
  })

  it('una factura sin fecha esperada es válida y sale como null', () => {
    const result = parseLine()

    expect(result.success).toBe(true)
    expect(result.success && result.data.dueDate).toBeNull()
  })

  it('rechaza una fecha fuera del mes del plan', () => {
    expect(parseLine({ dueDate: '2026-08-31' }).success).toBe(false)
    expect(parseLine({ dueDate: '2026-10-01' }).success).toBe(false)
  })

  it('acepta el primer y el último día del mes', () => {
    expect(parseLine({ dueDate: '2026-09-01' }).success).toBe(true)
    expect(parseLine({ dueDate: '2026-09-30' }).success).toBe(true)
  })

  it('el error de la fecha se atribuye a su propio campo', () => {
    const result = parseLine({ dueDate: '2026-10-01' })
    const issue = !result.success && result.error.issues[0]

    expect(issue && issue.path).toEqual(['dueDate'])
  })

  it('un gasto variable nunca conserva fecha', () => {
    const result = schema.safeParse({
      name: 'Mercado',
      kind: 'variable',
      categoryId: 'cat-mercado',
      dueDate: '',
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.dueDate).toBeNull()
  })

  it('rechaza una fecha en un gasto variable en vez de descartarla en silencio', () => {
    const result = schema.safeParse({
      name: 'Mercado',
      kind: 'variable',
      categoryId: 'cat-mercado',
      dueDate: '2026-09-05',
    })

    expect(result.success).toBe(false)
  })

  it('la categoría es obligatoria: C5 no admite una línea sin ella', () => {
    expect(parseLine({ categoryId: '' }).success).toBe(false)
  })

  it('exige un nombre con contenido y respeta el límite de 80', () => {
    expect(parseLine({ name: '   ' }).success).toBe(false)
    expect(parseLine({ name: 'a'.repeat(80) }).success).toBe(true)
    expect(parseLine({ name: 'a'.repeat(81) }).success).toBe(false)
  })

  it('recorta el nombre antes de guardarlo', () => {
    const result = parseLine({ name: '  Arriendo  ' })

    expect(result.success && result.data.name).toBe('Arriendo')
  })

  it('rechaza un kind que no se mide por categoría', () => {
    expect(parseLine({ kind: 'savings' }).success).toBe(false)
  })

  it('el mes lo fija quien construye el esquema, no el reloj', () => {
    const octubre = buildPlanLineSchema('2026-10')

    expect(
      octubre.safeParse({
        name: 'Arriendo',
        kind: 'bill',
        categoryId: 'cat-vivienda',
        dueDate: '2026-10-05',
      }).success,
    ).toBe(true)
    expect(
      octubre.safeParse({
        name: 'Arriendo',
        kind: 'bill',
        categoryId: 'cat-vivienda',
        dueDate: '2026-09-05',
      }).success,
    ).toBe(false)
  })

  it('no existe ningún campo de importe en el contrato', () => {
    const result = parseLine()

    expect(result.success && Object.keys(result.data).sort()).toEqual([
      'categoryId',
      'dueDate',
      'kind',
      'name',
    ])
  })
})

describe('contributionLineSchema', () => {
  function parseContribution(values: Record<string, string> = {}) {
    return contributionLineSchema.safeParse({
      name: 'Fondo de emergencia',
      accountId: 'acc-fondo',
      plannedAmount: '500.000',
      ...values,
    })
  }

  it('acepta un aporte completo y convierte el importe a entero', () => {
    const result = parseContribution()

    expect(result.success && result.data).toEqual({
      name: 'Fondo de emergencia',
      accountId: 'acc-fondo',
      plannedAmount: 500_000,
    })
  })

  it('un importe de 0 es válido: se planea aportar cero', () => {
    const result = parseContribution({ plannedAmount: '0' })

    expect(result.success && result.data.plannedAmount).toBe(0)
  })

  it('el importe vacío es un error, no un 0', () => {
    expect(parseContribution({ plannedAmount: '' }).success).toBe(false)
  })

  it('rechaza un importe negativo o no numérico', () => {
    expect(parseContribution({ plannedAmount: '-100' }).success).toBe(false)
    expect(parseContribution({ plannedAmount: 'abc' }).success).toBe(false)
  })

  it('exige una cuenta', () => {
    const result = parseContribution({ accountId: '' })

    expect(result.success).toBe(false)
    expect(!result.success && result.error.issues[0].message).toBe('Elige una cuenta')
  })

  it('exige un nombre de 1 a 80 caracteres', () => {
    expect(parseContribution({ name: '   ' }).success).toBe(false)
    expect(parseContribution({ name: 'x'.repeat(81) }).success).toBe(false)
    expect(parseContribution({ name: 'x'.repeat(80) }).success).toBe(true)
  })
})
