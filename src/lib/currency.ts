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

export const CURRENCIES = [
  { code: 'COP', label: 'Peso colombiano (COP)' },
  { code: 'USD', label: 'Dólar estadounidense (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'MXN', label: 'Peso mexicano (MXN)' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']
