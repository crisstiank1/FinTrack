import { describe, expect, it } from 'vitest'

import { budgetAmountSchema, budgetSchema } from './schemas'

function parse(raw: string) {
  return budgetAmountSchema.safeParse(raw)
}

function errorOf(raw: string): string {
  const result = parse(raw)
  if (result.success) throw new Error(`Se esperaba un error para ${JSON.stringify(raw)}`)
  return result.error.issues[0].message
}

describe('budgetAmountSchema — valores válidos', () => {
  it('acepta un entero sin separadores', () => {
    expect(parse('1200000')).toMatchObject({ success: true, data: 1_200_000 })
  })

  it('acepta separadores de miles con punto', () => {
    expect(parse('1.200.000')).toMatchObject({ success: true, data: 1_200_000 })
  })

  it('acepta separadores de miles con espacio', () => {
    expect(parse('1 200 000')).toMatchObject({ success: true, data: 1_200_000 })
  })

  it('acepta el espacio duro que produce Intl al copiar una cifra', () => {
    expect(parse('1 200 000')).toMatchObject({ success: true, data: 1_200_000 })
  })

  it('ignora los espacios de alrededor', () => {
    expect(parse('  5000  ')).toMatchObject({ success: true, data: 5000 })
  })

  it('acepta 0: es una decisión válida, no un campo sin llenar', () => {
    expect(parse('0')).toMatchObject({ success: true, data: 0 })
  })
})

describe('budgetAmountSchema — valores rechazados', () => {
  it('el campo vacío es un error, nunca un 0 silencioso', () => {
    expect(errorOf('')).toBe('Ingresa un monto')
    expect(errorOf('   ')).toBe('Ingresa un monto')
  })

  it('rechaza negativos', () => {
    expect(errorOf('-5000')).toBe('El monto no puede ser negativo')
  })

  it('rechaza decimales con coma', () => {
    expect(errorOf('1,5')).toBe('El monto debe ser un número entero, sin decimales')
  })

  it('rechaza decimales con punto', () => {
    // '1.50' no es una agrupación de miles válida, así que son decimales.
    expect(errorOf('1.50')).toBe('El monto debe ser un número entero, sin decimales')
  })

  it('rechaza una agrupación mal formada', () => {
    expect(errorOf('1.2000')).toBe('Ingresa un monto válido, solo números')
  })

  it('rechaza texto', () => {
    expect(errorOf('abc')).toBe('Ingresa un monto válido, solo números')
    expect(errorOf('12a')).toBe('Ingresa un monto válido, solo números')
  })

  it('rechaza un entero fuera del rango seguro', () => {
    expect(errorOf('9007199254740993')).toBe('El monto es demasiado grande')
  })
})

describe('budgetSchema', () => {
  it('devuelve el monto como entero junto al alcance', () => {
    expect(budgetSchema.safeParse({ amount: '1.200.000', scope: 'template' })).toMatchObject({
      success: true,
      data: { amount: 1_200_000, scope: 'template' },
    })
  })

  it('rechaza un alcance desconocido', () => {
    expect(budgetSchema.safeParse({ amount: '1000', scope: 'correction' }).success).toBe(false)
  })
})
