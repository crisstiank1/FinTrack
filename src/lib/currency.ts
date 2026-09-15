import { dinero, toDecimal } from 'dinero.js'

// FinTrack guarda amount_minor como unidades enteras de la moneda
// (ver docs/02-base-de-datos.md: "COP 15.000 se guarda como 15000"),
// no como centavos. Por eso el exponente es siempre 0.
const MINOR_UNIT_EXPONENT = 0

function currencyDefinition(code: string) {
  return { code, base: 10 as const, exponent: MINOR_UNIT_EXPONENT }
}

export function formatAmount(amountMinor: number, currencyCode: string): string {
  const money = dinero({ amount: amountMinor, currency: currencyDefinition(currencyCode) })
  const decimal = toDecimal(money)
  const formatted = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(
    Number(decimal),
  )
  return `${currencyCode} ${formatted}`
}

/**
 * Monto abreviado sin código de moneda ('4,3 M'), para ejes de gráficos donde
 * un valor completo como '4.250.000' no cabe. Nunca usarlo para las cifras
 * principales: ahí se necesita el valor exacto.
 */
export function formatCompactAmount(amountMinor: number): string {
  return new Intl.NumberFormat('es-CO', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amountMinor)
}

export const CURRENCIES = [
  { code: 'COP', label: 'Peso colombiano (COP)' },
  { code: 'USD', label: 'Dólar estadounidense (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'MXN', label: 'Peso mexicano (MXN)' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

/**
 * Orden en que se listan varias monedas a la vez. La moneda principal va
 * siempre primero; las que no aparecen aquí van al final, alfabéticamente.
 */
const CURRENCY_DISPLAY_ORDER: readonly string[] = ['COP', 'USD', 'ARS', 'EUR', 'MXN']

/** Códigos únicos ordenados para mostrarse: la principal primero y luego el orden fijo. */
export function sortCurrencyCodes(codes: Iterable<string>, primaryCode?: string | null): string[] {
  const rank = (code: string) => {
    if (code === primaryCode) return -1
    const index = CURRENCY_DISPLAY_ORDER.indexOf(code)
    return index === -1 ? CURRENCY_DISPLAY_ORDER.length : index
  }

  return [...new Set(codes)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/**
 * Moneda en la que se presentan las cifras agregadas de una pantalla.
 *
 * FinTrack no convierte divisas, así que un total solo puede sumar cuentas de
 * una misma moneda. Se usa la moneda principal del perfil si el usuario tiene
 * alguna cuenta en ella; si no, la de la primera cuenta, que es el criterio que
 * la app usaba antes de separar monedas.
 */
export function resolvePresentationCurrency(
  primaryCode: string | null | undefined,
  accounts: readonly { currency_code: string }[],
): string {
  if (primaryCode && accounts.some((account) => account.currency_code === primaryCode)) {
    return primaryCode
  }
  return accounts[0]?.currency_code ?? primaryCode ?? 'COP'
}
