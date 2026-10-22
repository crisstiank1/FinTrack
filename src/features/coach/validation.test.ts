import { describe, expect, it } from 'vitest'

import type { CoachContextSnapshot } from './contracts'
import { extractReferences, flattenSnapshot, referenceKind, resolveTemplate } from './references'
import { parseModelContent, validateModelContent, type ModelContent } from './validation'

const snapshot: CoachContextSnapshot = {
  version: 'v1',
  period: { label: 'septiembre 2026', startDate: '2026-09-01', endDate: '2026-09-21' },
  comparedTo: { label: 'agosto 2026', startDate: '2026-08-01', endDate: '2026-08-31' },
  currency: 'COP',
  summary: {
    income: { currentMinor: 2_000_000, previousMinor: 2_000_000, deltaPercent: 0 },
    expense: { currentMinor: 620_000, previousMinor: 500_000, deltaPercent: 24 },
    netSavings: { currentMinor: 1_380_000, previousMinor: 1_500_000, deltaPercent: -8 },
    savingsRate: { current: 69, previous: 75, deltaPoints: -6 },
  },
  categories: { c1: { name: 'Mercado', amount: 450_000, percentage: 72.6 } },
  exclusions: { count: 1, currencyCodes: ['USD'] },
}

function content(overrides: Partial<ModelContent> = {}): ModelContent {
  return {
    title: 'Tu gasto de {{period.label}}',
    summary: 'Gastaste {{summary.expense.currentMinor}}, sobre todo en {{categories.c1.name}}.',
    facts: ['{{categories.c1.name}} representa {{categories.c1.percentage}} del gasto.'],
    recommendations: ['Define un tope semanal para {{categories.c1.name}}.'],
    assumptions: ['Solo se usan los movimientos registrados en FinTrack.'],
    ...overrides,
  }
}

describe('references', () => {
  it('aplana el snapshot en rutas citables, sin la versión', () => {
    const leaves = flattenSnapshot(snapshot)

    expect(leaves.get('summary.expense.currentMinor')).toBe(620_000)
    expect(leaves.get('categories.c1.name')).toBe('Mercado')
    expect(leaves.get('exclusions.currencyCodes')).toBe('USD')
    expect(leaves.has('version')).toBe(false)
    expect(leaves.has('categories.c1')).toBe(false)
  })

  it('extrae las rutas en orden, admitiendo espacios dentro de las llaves', () => {
    expect(extractReferences('{{ a.b }} y {{c.d1}}')).toEqual(['a.b', 'c.d1'])
  })

  it('clasifica cada ruta por su significado, no por su valor', () => {
    expect(referenceKind('summary.expense.currentMinor')).toBe('amount')
    expect(referenceKind('categoryDeltas.d1.current')).toBe('amount')
    expect(referenceKind('summary.savingsRate.current')).toBe('percent')
    expect(referenceKind('summary.savingsRate.deltaPoints')).toBe('points')
    expect(referenceKind('categories.c1.percentage')).toBe('percent')
    expect(referenceKind('exclusions.count')).toBe('count')
    expect(referenceKind('categories.c1.name')).toBe('text')
  })
})

describe('resolveTemplate', () => {
  it('formatea los importes con formatAmount y los porcentajes con un decimal', () => {
    expect(
      resolveTemplate(
        'Gastaste {{summary.expense.currentMinor}}, un {{summary.expense.deltaPercent}} más, en {{period.label}}.',
        snapshot,
      ),
    ).toBe('Gastaste COP 620.000, un 24 % más, en septiembre 2026.')
  })

  it('aplica el exponente de la moneda: en USD, 4599 son 45,99', () => {
    const usd = {
      ...snapshot,
      currency: 'USD',
      categories: { c1: { name: 'Ocio', amount: 4599, percentage: 10 } },
    }

    expect(resolveTemplate('{{categories.c1.amount}}', usd)).toBe('USD 45,99')
  })

  it('muestra un valor nulo como raya, no como cero', () => {
    const withNull = {
      ...snapshot,
      summary: {
        ...snapshot.summary!,
        savingsRate: { current: null, previous: 75, deltaPoints: null },
      },
    }

    expect(resolveTemplate('{{summary.savingsRate.current}}', withNull)).toBe('—')
  })
})

describe('parseModelContent', () => {
  it('rechaza texto que no es JSON', () => {
    expect(parseModelContent('Claro, aquí tienes tu resumen')).toEqual({
      code: 'invalid_json',
      field: 'root',
    })
  })

  it('rechaza un JSON sin título', () => {
    expect(parseModelContent('{"summary": "x"}')).toEqual({ code: 'invalid_shape', field: 'title' })
  })

  it('rechaza listas que no son de textos', () => {
    expect(parseModelContent('{"title":"a","summary":"b","facts":[1]}')).toEqual({
      code: 'invalid_shape',
      field: 'facts',
    })
  })

  it('acepta listas ausentes como vacías', () => {
    expect(parseModelContent('{"title":"a","summary":"b"}')).toMatchObject({
      facts: [],
      recommendations: [],
      assumptions: [],
    })
  })
})

describe('validateModelContent · referencias', () => {
  it('acepta un contenido que solo cita rutas existentes', () => {
    const result = validateModelContent(content(), snapshot)

    expect(result.ok).toBe(true)
  })

  it('deriva factReferences de las rutas realmente citadas, sin repetir', () => {
    const result = validateModelContent(content(), snapshot)

    expect(result.ok && result.content.factReferences).toEqual([
      'period.label',
      'summary.expense.currentMinor',
      'categories.c1.name',
      'categories.c1.percentage',
    ])
  })

  it('rechaza una referencia que no existe en el snapshot', () => {
    const result = validateModelContent(
      content({ summary: 'Gastaste {{categories.c9.amount}}.' }),
      snapshot,
    )

    expect(result).toEqual({
      ok: false,
      violations: [{ code: 'unknown_reference', field: 'summary' }],
    })
  })

  it('rechaza citar un objeto en vez de una hoja', () => {
    const result = validateModelContent(content({ summary: 'Mira {{categories.c1}}.' }), snapshot)

    expect(result.ok).toBe(false)
  })

  it('rechaza una referencia mal cerrada en vez de mostrar llaves', () => {
    const result = validateModelContent(
      content({ summary: 'Gastaste {{summary.expense.currentMinor}.' }),
      snapshot,
    )

    expect(result.ok === false && result.violations[0].code).toBe('malformed_template')
  })
})

describe('validateModelContent · cifras escritas a mano', () => {
  const invented: [string, string][] = [
    ['importe con código', 'Gastaste COP 845.000 este mes.'],
    ['importe pegado al código', 'Gastaste USD45 en ocio.'],
    ['símbolo de dólar', 'Llevas $ 20 en transporte.'],
    ['separador de miles', 'Gastaste 845.000 en total.'],
    ['cuatro cifras', 'Gastaste 8450 en total.'],
    ['año escrito', 'En septiembre de 2026 gastaste más.'],
    ['decimal', 'La tasa bajó a 18,5 puntos.'],
    ['porcentaje', 'El gasto subió un 18%.'],
    ['porcentaje con espacio', 'El gasto subió un 18 %.'],
    ['cifra abreviada', 'Gastaste 845 mil en mercado.'],
    ['millones', 'Ingresaste 2 millones.'],
  ]

  it.each(invented)('rechaza %s', (_, text) => {
    const result = validateModelContent(content({ summary: text }), snapshot)

    expect(result.ok === false && result.violations.map((v) => v.code)).toContain('free_number')
  })

  it('detecta la cifra también en recomendaciones y supuestos', () => {
    const result = validateModelContent(
      content({ recommendations: ['Ahorra 200.000 al mes.'], assumptions: ['Con un 10% menos.'] }),
      snapshot,
    )

    expect(result.ok === false && result.violations.map((v) => v.field)).toEqual([
      'recommendations.0',
      'assumptions.0',
    ])
  })

  it('permite enteros pequeños sin unidad, que no son datos del usuario', () => {
    const result = validateModelContent(
      content({ recommendations: ['Revisa tus gastos durante 2 semanas.'] }),
      snapshot,
    )

    expect(result.ok).toBe(true)
  })

  it('las cifras dentro de una referencia no cuentan como escritas a mano', () => {
    const result = validateModelContent(
      content({ summary: 'Gastaste {{summary.expense.currentMinor}} en {{period.label}}.' }),
      snapshot,
    )

    expect(result.ok).toBe(true)
  })
})

describe('validateModelContent · forma y límites', () => {
  it('rechaza un título vacío', () => {
    expect(validateModelContent(content({ title: '  ' }), snapshot).ok).toBe(false)
  })

  it('rechaza más de dos recomendaciones', () => {
    const result = validateModelContent(
      content({ recommendations: ['Una.', 'Dos.', 'Tres.'] }),
      snapshot,
    )

    expect(result.ok === false && result.violations[0]).toEqual({
      code: 'too_long',
      field: 'recommendations',
    })
  })

  it('rechaza un resumen demasiado largo', () => {
    expect(validateModelContent(content({ summary: 'a'.repeat(701) }), snapshot).ok).toBe(false)
  })

  it('devuelve todas las infracciones, no solo la primera', () => {
    const result = validateModelContent(
      content({ title: 'COP 5.000', summary: '{{nada.aqui}}' }),
      snapshot,
    )

    expect(result.ok === false && result.violations.length).toBeGreaterThanOrEqual(2)
  })
})
