/**
 * Montos de extractos bancarios → unidades mínimas de la moneda de la cuenta.
 *
 * Todo con texto y `BigInt`, nunca con `parseFloat`: `0.1 + 0.2` no es un
 * problema teórico cuando el resultado es un saldo. El exponente viene de
 * `getCurrencyExponent` (COP 0, USD/ARS 2), así que `15.000` en COP es 15000 y
 * `45,99` en USD es 4599. Nunca se divide ni se multiplica por 100 a ciegas.
 */

export type DecimalSeparator = ',' | '.'

export type AmountErrorCode =
  'empty' | 'not_a_number' | 'bad_grouping' | 'too_many_decimals' | 'too_large' | 'zero'

export type ParsedAmount =
  { ok: true; negative: boolean; minor: number } | { ok: false; code: AmountErrorCode }

const CURRENCY_TOKENS = /(COP|USD|ARS|EUR|MXN|PEN|CLP|US\$|\$|€)/gi

export function parseAmount(
  text: string,
  decimalSeparator: DecimalSeparator,
  exponent: number,
): ParsedAmount {
  let value = text.replace(/[\s\u00a0\u202f]/g, '').replace(/\u2212/g, '-')
  if (value === '') return { ok: false, code: 'empty' }

  let negative = false
  if (/^\(.*\)$/.test(value)) {
    negative = true
    value = value.slice(1, -1)
  }
  value = value.replace(CURRENCY_TOKENS, '')
  if (value.startsWith('-')) {
    negative = !negative
    value = value.slice(1)
  } else if (value.startsWith('+')) {
    value = value.slice(1)
  } else if (value.endsWith('-')) {
    negative = !negative
    value = value.slice(0, -1)
  }
  value = value.replace(CURRENCY_TOKENS, '')

  if (value === '' || !/^[0-9.,']+$/.test(value)) return { ok: false, code: 'not_a_number' }

  const thousands = decimalSeparator === ',' ? '.' : ','
  const parts = value.split(decimalSeparator)
  if (parts.length > 2) return { ok: false, code: 'bad_grouping' }

  const [integerRaw, fractionRaw = ''] = parts
  if (fractionRaw.includes(thousands) || fractionRaw.includes("'")) {
    return { ok: false, code: 'bad_grouping' }
  }

  // Separador de miles: si aparece, todos los grupos salvo el primero deben
  // tener tres cifras. Es lo que delata un separador decimal mal elegido:
  // «1,5» con punto decimal no es «15», es un error.
  const groups = integerRaw.split(new RegExp(`[${thousands === '.' ? '\\.' : ','}']`))
  if (groups.length > 1) {
    if (groups[0] === '' || groups[0].length > 3 || groups.slice(1).some((g) => g.length !== 3)) {
      return { ok: false, code: 'bad_grouping' }
    }
  }
  const integerDigits = groups.join('')
  if (integerDigits === '' && fractionRaw === '') return { ok: false, code: 'not_a_number' }
  if (!/^[0-9]*$/.test(integerDigits) || !/^[0-9]*$/.test(fractionRaw)) {
    return { ok: false, code: 'not_a_number' }
  }

  // Decimales de más solo se aceptan si son ceros: «15.000,00» en COP es
  // 15000, pero «15.000,50» no se puede representar en pesos enteros y
  // redondearlo en silencio cambiaría el movimiento.
  let fraction = fractionRaw
  if (fraction.length > exponent) {
    if (/[^0]/.test(fraction.slice(exponent))) return { ok: false, code: 'too_many_decimals' }
    fraction = fraction.slice(0, exponent)
  }

  const minorText = (integerDigits || '0') + fraction.padEnd(exponent, '0')
  const minor = BigInt(minorText)
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, code: 'too_large' }
  if (minor === 0n) return { ok: false, code: 'zero' }

  return { ok: true, negative, minor: Number(minor) }
}

/**
 * Propone el separador decimal mirando los valores de la columna.
 *
 * Solo propone cuando la evidencia es inequívoca: una o dos cifras tras el
 * último separador. Tres cifras («1.234», «1,234») pueden ser miles con
 * cualquiera de los dos, así que ahí devuelve `null` y la interfaz obliga a
 * elegir.
 */
export function suggestDecimalSeparator(values: readonly string[]): DecimalSeparator | null {
  let comma = 0
  let dot = 0
  for (const raw of values) {
    const value = raw.replace(/[\s()+\-$]/g, '')
    const match = /([.,])([0-9]{1,2})$/.exec(value)
    if (!match) continue
    if (match[1] === ',') comma += 1
    else dot += 1
  }
  if (comma > 0 && dot === 0) return ','
  if (dot > 0 && comma === 0) return '.'
  return null
}

const AMOUNT_ERROR_TEXT: Record<AmountErrorCode, string> = {
  empty: 'Monto vacío',
  not_a_number: 'El monto no es un número',
  bad_grouping: 'Separadores de miles o decimales incoherentes',
  too_many_decimals: 'El monto tiene más decimales de los que admite la moneda de la cuenta',
  too_large: 'Monto demasiado grande',
  zero: 'El monto es 0',
}

export function amountErrorText(code: AmountErrorCode): string {
  return AMOUNT_ERROR_TEXT[code]
}
