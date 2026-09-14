import { describe, expect, it } from 'vitest'

import {
  CURRENCIES,
  CURRENCY_CODES,
  formatAmount,
  currencyOptions,
  resolvePresentationCurrency,
  sortCurrencyCodes,
} from './currency'

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

describe('catálogo de monedas', () => {
  it('incluye ARS y conserva las monedas anteriores, con sus etiquetas', () => {
    expect(CURRENCIES).toEqual([
      { code: 'COP', label: 'Peso colombiano (COP)' },
      { code: 'USD', label: 'Dólar estadounidense (USD)' },
      { code: 'ARS', label: 'Peso argentino (ARS)' },
      { code: 'EUR', label: 'Euro (EUR)' },
      { code: 'MXN', label: 'Peso mexicano (MXN)' },
    ])
  })

  it('CURRENCY_CODES mantiene el mismo orden que el catálogo', () => {
    expect(CURRENCY_CODES).toEqual(['COP', 'USD', 'ARS', 'EUR', 'MXN'])
  })

  it('formatea montos en ARS', () => {
    expect(formatAmount(1250, 'ARS')).toBe('ARS 1.250')
  })
})

describe('currencyOptions', () => {
  it('sin moneda heredada ofrece solo COP, USD y ARS con sus etiquetas', () => {
    expect(currencyOptions()).toEqual([
      { code: 'COP', label: 'Peso colombiano (COP)' },
      { code: 'USD', label: 'Dólar estadounidense (USD)' },
      { code: 'ARS', label: 'Peso argentino (ARS)' },
    ])
  })

  it('añade al final la moneda heredada fuera del catálogo ofrecido', () => {
    expect(currencyOptions('EUR')).toEqual([
      { code: 'COP', label: 'Peso colombiano (COP)' },
      { code: 'USD', label: 'Dólar estadounidense (USD)' },
      { code: 'ARS', label: 'Peso argentino (ARS)' },
      { code: 'EUR', label: 'Euro (EUR)' },
    ])
  })

  it('no duplica la moneda heredada cuando ya está ofrecida', () => {
    expect(currencyOptions('USD')).toEqual([
      { code: 'COP', label: 'Peso colombiano (COP)' },
      { code: 'USD', label: 'Dólar estadounidense (USD)' },
      { code: 'ARS', label: 'Peso argentino (ARS)' },
    ])
  })

  it('ignora una moneda heredada desconocida', () => {
    expect(currencyOptions('PEN')).toEqual(currencyOptions())
  })
})

describe('sortCurrencyCodes', () => {
  it('pone la moneda principal primero y el resto en el orden fijo', () => {
    expect(sortCurrencyCodes(['ARS', 'COP', 'USD'], 'USD')).toEqual(['USD', 'COP', 'ARS'])
  })

  it('sin moneda principal sigue el orden COP, USD, ARS, EUR, MXN', () => {
    expect(sortCurrencyCodes(['MXN', 'EUR', 'ARS', 'USD', 'COP'])).toEqual([
      'COP',
      'USD',
      'ARS',
      'EUR',
      'MXN',
    ])
  })

  it('manda al final, alfabéticamente, las monedas fuera del orden fijo', () => {
    expect(sortCurrencyCodes(['PEN', 'USD', 'CLP'], 'COP')).toEqual(['USD', 'CLP', 'PEN'])
  })

  it('elimina los códigos repetidos', () => {
    expect(sortCurrencyCodes(['USD', 'COP', 'USD', 'COP'])).toEqual(['COP', 'USD'])
  })
})

describe('resolvePresentationCurrency', () => {
  it('usa la moneda principal cuando hay alguna cuenta en ella', () => {
    const accounts = [{ currency_code: 'USD' }, { currency_code: 'COP' }]
    expect(resolvePresentationCurrency('COP', accounts)).toBe('COP')
  })

  it('usa la moneda de la primera cuenta si ninguna está en la moneda principal', () => {
    const accounts = [{ currency_code: 'USD' }, { currency_code: 'ARS' }]
    expect(resolvePresentationCurrency('COP', accounts)).toBe('USD')
  })

  it('usa la primera cuenta si el perfil no trae moneda principal', () => {
    expect(resolvePresentationCurrency(undefined, [{ currency_code: 'ARS' }])).toBe('ARS')
  })

  it('sin cuentas usa la moneda principal, o COP si tampoco la hay', () => {
    expect(resolvePresentationCurrency('USD', [])).toBe('USD')
    expect(resolvePresentationCurrency(null, [])).toBe('COP')
  })
})
