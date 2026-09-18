import { describe, expect, it } from 'vitest'

import {
  accountsKeptInCurrentCurrency,
  CURRENCIES,
  CURRENCY_CODES,
  formatAmount,
  currencyOptions,
  partitionByAccountCurrency,
  resolveCurrencyFilter,
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

  it('todas las monedas usan exponente 0: el mismo entero da los mismos dígitos', () => {
    // 15000 es "quince mil", no "ciento cincuenta". Ninguna moneda divide
    // entre 100, tampoco las que en otros sistemas tendrían centavos.
    expect(formatAmount(15000, 'COP')).toBe('COP 15.000')
    expect(formatAmount(15000, 'USD')).toBe('USD 15.000')
    expect(formatAmount(15000, 'ARS')).toBe('ARS 15.000')
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

describe('resolveCurrencyFilter', () => {
  const accounts = [
    { id: 'cop-1', currency_code: 'COP' },
    { id: 'usd-1', currency_code: 'USD' },
    { id: 'cop-2', currency_code: 'COP' },
    { id: 'ars-1', currency_code: 'ARS' },
  ]

  it('ofrece las monedas de las cuentas, con la principal primero', () => {
    expect(resolveCurrencyFilter(accounts, undefined, 'USD').currencyCodes).toEqual([
      'USD',
      'COP',
      'ARS',
    ])
  })

  it('incluye monedas heredadas como EUR si hay cuentas en ellas', () => {
    const withLegacy = [...accounts, { id: 'eur-1', currency_code: 'EUR' }]
    expect(resolveCurrencyFilter(withLegacy, undefined, 'COP').currencyCodes).toEqual([
      'COP',
      'USD',
      'ARS',
      'EUR',
    ])
  })

  it('sin moneda elegida no acota', () => {
    expect(resolveCurrencyFilter(accounts, undefined, 'COP')).toEqual({
      currencyCodes: ['COP', 'USD', 'ARS'],
    })
  })

  it('con una moneda elegida acota a las cuentas en ella', () => {
    expect(resolveCurrencyFilter(accounts, 'COP', 'COP')).toEqual({
      currencyCodes: ['COP', 'USD', 'ARS'],
      currencyCode: 'COP',
      accountIds: ['cop-1', 'cop-2'],
    })
  })

  it('una moneda sin cuentas vuelve a todas en vez de pedir una lista vacía', () => {
    const scope = resolveCurrencyFilter(accounts, 'MXN', 'COP')
    expect(scope.currencyCode).toBeUndefined()
    expect(scope.accountIds).toBeUndefined()
  })

  it('con una sola moneda no acota: el selector está oculto', () => {
    const copOnly = accounts.filter((account) => account.currency_code === 'COP')
    expect(resolveCurrencyFilter(copOnly, 'COP', 'COP')).toEqual({ currencyCodes: ['COP'] })
  })
})

describe('partitionByAccountCurrency', () => {
  const currencyByAccountId = new Map([
    ['cop-1', 'COP'],
    ['usd-1', 'USD'],
    ['ars-1', 'ARS'],
  ])

  it('deja dentro las filas de cuentas en la moneda y cuenta las demás', () => {
    const rows = [
      { id: 'a', account_id: 'cop-1' },
      { id: 'b', account_id: 'usd-1' },
      { id: 'c', account_id: 'ars-1' },
      { id: 'd', account_id: 'usd-1' },
    ]

    const { included, exclusions } = partitionByAccountCurrency(rows, currencyByAccountId, 'COP')

    expect(included.map((row) => row.id)).toEqual(['a'])
    expect(exclusions).toEqual({ count: 3, currencyCodes: ['USD', 'ARS'] })
  })

  it('una fila de cuenta desconocida se queda en la moneda de la pantalla', () => {
    const { included, exclusions } = partitionByAccountCurrency(
      [{ account_id: 'borrada' }],
      currencyByAccountId,
      'COP',
    )

    expect(included).toHaveLength(1)
    expect(exclusions).toEqual({ count: 0, currencyCodes: [] })
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

describe('accountsKeptInCurrentCurrency', () => {
  const accounts = [{ currency_code: 'COP' }, { currency_code: 'COP' }, { currency_code: 'USD' }]

  it('cuenta las cuentas en la moneda actual al cambiarla', () => {
    expect(accountsKeptInCurrentCurrency(accounts, 'COP', 'USD')).toBe(2)
  })

  it('no hay nada que advertir si la moneda no cambia', () => {
    expect(accountsKeptInCurrentCurrency(accounts, 'COP', 'COP')).toBe(0)
  })

  it('cuenta las cuentas de la actual, no las de la nueva ni las de terceros', () => {
    expect(accountsKeptInCurrentCurrency(accounts, 'USD', 'COP')).toBe(1)
    expect(accountsKeptInCurrentCurrency(accounts, 'ARS', 'USD')).toBe(0)
  })
})
