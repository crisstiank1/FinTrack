import { describe, expect, it } from 'vitest'

import { formatAmount } from './currency'

describe('formatAmount', () => {
  it('formatea unidades enteras de COP con separador de miles', () => {
    expect(formatAmount(15000, 'COP')).toBe('COP 15.000')
  })

  it('formatea montos pequeños sin separador', () => {
    expect(formatAmount(500, 'COP')).toBe('COP 500')
  })

  it('formatea el cero correctamente', () => {
    expect(formatAmount(0, 'COP')).toBe('COP 0')
  })

  it('respeta el código de moneda indicado', () => {
    expect(formatAmount(1200000, 'USD')).toBe('USD 1.200.000')
  })
})
