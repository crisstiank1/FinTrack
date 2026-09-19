import { describe, expect, it } from 'vitest'

import {
  accountsKeptInCurrentCurrency,
  CURRENCIES,
  CURRENCY_CODES,
  CURRENCY_EXPONENTS,
  formatAmount,
  currencyOptions,
  formatMajorUnits,
  getCurrencyExponent,
  groupMoneyText,
  moneyTextToMajor,
  partitionByAccountCurrency,
  resolveCurrencyFilter,
  resolvePresentationCurrency,
  sanitizeMoneyText,
  sortCurrencyCodes,
  toMajorUnit,
  toMinorUnit,
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

  it('respeta el exponente de la moneda: 4599 USD son 45,99', () => {
    expect(formatAmount(4599, 'USD')).toBe('USD 45,99')
  })

  it('convierte los enteros guardados según la escala de cada moneda', () => {
    // 15000 en COP son "quince mil"; en USD son 150,00 si se guardaron como
    // centavos (15000 centavos) — eso es exactamente lo que corrije la
    // migración de divisas con centavos.
    expect(formatAmount(15000, 'COP')).toBe('COP 15.000')
    expect(formatAmount(15000, 'USD')).toBe('USD 150,00')
    expect(formatAmount(15000, 'ARS')).toBe('ARS 150,00')
  })
})

describe('exponentes por moneda', () => {
  it('COP, CLP y JPY tienen exponente 0; las demás con centavos, 2', () => {
    expect(CURRENCY_EXPONENTS).toMatchObject({ COP: 0, CLP: 0, JPY: 0 })
    expect(CURRENCY_EXPONENTS).toMatchObject({ USD: 2, EUR: 2, MXN: 2, ARS: 2, PEN: 2 })
  })

  it('desconocida cae al fallback seguro de 2 decimales', () => {
    expect(getCurrencyExponent('XYZ')).toBe(2)
    expect(getCurrencyExponent('cop')).toBe(0)
  })
})

describe('conversión minor/major', () => {
  it('toMinorUnit multiplica por la potencia del exponente, redondeado', () => {
    expect(toMinorUnit(45.99, 'USD')).toBe(4599)
    expect(toMinorUnit(1.1, 'USD')).toBe(110)
    expect(toMinorUnit(15000, 'COP')).toBe(15000)
  })

  it('toMajorUnit es el reverso de toMinorUnit', () => {
    expect(toMajorUnit(4599, 'USD')).toBe(45.99)
    expect(toMajorUnit(15000, 'COP')).toBe(15000)
  })
})

describe('texto de importe', () => {
  it('sanitizeMoneyText distingue miles (del propio campo) del decimal escrito', () => {
    expect(sanitizeMoneyText('45,99', 2)).toBe('45,99')
    expect(sanitizeMoneyText('45.99', 2)).toBe('45.99')
    expect(sanitizeMoneyText('1.500', 2)).toBe('1500')
    expect(sanitizeMoneyText('1.500,50', 2)).toBe('1500,50')
    expect(sanitizeMoneyText('$45a,9b9', 2)).toBe('45,99')
    expect(sanitizeMoneyText('45,999', 2)).toBe('45999')
    expect(sanitizeMoneyText('15000', 0)).toBe('15000')
    expect(sanitizeMoneyText('1.500', 0)).toBe('1500')
  })

  it('moneyTextToMajor normaliza coma a punto y devuelve 0 para vacío', () => {
    expect(moneyTextToMajor('45,99')).toBe(45.99)
    expect(moneyTextToMajor('')).toBe(0)
  })

  it('groupMoneyText agrupa miles y conserva la fracción', () => {
    expect(groupMoneyText('1900000')).toBe('1.900.000')
    expect(groupMoneyText('1500,5')).toBe('1.500,5')
  })

  it('formatMajorUnits fija los decimales de la moneda', () => {
    expect(formatMajorUnits(45, 2)).toBe('45,00')
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
    expect(formatAmount(1250, 'ARS')).toBe('ARS 12,50')
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
