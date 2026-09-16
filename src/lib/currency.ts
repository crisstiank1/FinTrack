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

/** Códigos del catálogo completo de monedas de FinTrack. */
export const CURRENCY_CODES = ['COP', 'USD', 'ARS', 'EUR', 'MXN'] as const

export type CurrencyCode = (typeof CURRENCY_CODES)[number]

// Un Record y no un array: si se añade una moneda sin etiqueta, falla la compilación.
const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  COP: 'Peso colombiano (COP)',
  USD: 'Dólar estadounidense (USD)',
  ARS: 'Peso argentino (ARS)',
  EUR: 'Euro (EUR)',
  MXN: 'Peso mexicano (MXN)',
}

/** Catálogo completo: monedas que FinTrack sabe formatear. */
export const CURRENCIES: readonly { code: CurrencyCode; label: string }[] = CURRENCY_CODES.map(
  (code) => ({ code, label: CURRENCY_LABELS[code] }),
)

/**
 * Monedas que se ofrecen al crear cuentas y en el onboarding. EUR y MXN son
 * solo lectura: se siguen formateando y pueden conservarse al editar una cuenta
 * que ya las tenga, pero no se ofrecen para cuentas nuevas.
 */
export const SELECTABLE_CURRENCY_CODES = ['COP', 'USD', 'ARS'] as const

export type SelectableCurrencyCode = (typeof SELECTABLE_CURRENCY_CODES)[number]

const SELECTABLE = new Set<string>(SELECTABLE_CURRENCY_CODES)

/**
 * Opciones de un selector de moneda. Al crear ofrecen COP, USD y ARS; al editar
 * añaden al final la moneda heredada de la cuenta si está fuera de las
 * ofrecidas (por ejemplo EUR o MXN), para que esas cuentas sigan siendo
 * editables.
 */
export function currencyOptions(
  inheritedCode?: string | null,
): readonly { code: CurrencyCode; label: string }[] {
  const selectable = CURRENCIES.filter((currency) => SELECTABLE.has(currency.code))
  const inherited = inheritedCode
    ? CURRENCIES.find((currency) => currency.code === inheritedCode)
    : undefined
  if (!inherited || selectable.includes(inherited)) return selectable
  return [...selectable, inherited]
}

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

/** Alcance efectivo del filtro de moneda de Movimientos y del Libro financiero. */
export interface CurrencyFilterScope {
  /**
   * Monedas que ofrece el selector, en orden de presentación. Salen de las
   * cuentas del usuario, archivadas incluidas porque tienen historial. Con
   * menos de dos, el selector se oculta.
   */
  currencyCodes: string[]
  /** Moneda que realmente acota, o `undefined` para todas. */
  currencyCode?: string
  /** Cuentas de esa moneda. `undefined` cuando no se acota; nunca vacío. */
  accountIds?: string[]
}

/**
 * Traduce la moneda elegida en el selector a las cuentas por las que filtrar.
 *
 * `transactions` no guarda moneda: la define la cuenta, así que filtrar por
 * moneda es filtrar por las cuentas en ella. Si el selector está oculto (una
 * sola moneda) o la moneda elegida ya no tiene cuentas, no se acota: nunca se
 * pide al servidor una lista de cuentas vacía.
 */
export function resolveCurrencyFilter(
  accounts: readonly { id: string; currency_code: string }[],
  selectedCode: string | undefined,
  primaryCode?: string | null,
): CurrencyFilterScope {
  const currencyCodes = sortCurrencyCodes(
    accounts.map((account) => account.currency_code),
    primaryCode,
  )

  if (!selectedCode || currencyCodes.length < 2 || !currencyCodes.includes(selectedCode)) {
    return { currencyCodes }
  }

  return {
    currencyCodes,
    currencyCode: selectedCode,
    accountIds: accounts
      .filter((account) => account.currency_code === selectedCode)
      .map((account) => account.id),
  }
}

/** Lo que una pantalla de una sola moneda deja fuera de sus cifras. */
export interface CurrencyExclusions {
  count: number
  /** Monedas de lo excluido, sin repetir y en orden de presentación. */
  currencyCodes: string[]
}

/**
 * Separa las filas cuya cuenta está en `currencyCode` de las que están en otra.
 *
 * El Plan y los presupuestos muestran una sola moneda y no convierten divisas:
 * lo de otras monedas no se suma, solo se cuenta para avisarlo. Una fila cuya
 * cuenta no se conoce no tiene moneda y se queda dentro, igual que el Libro y
 * Movimientos la muestran en la moneda de respaldo.
 */
export function partitionByAccountCurrency<T extends { account_id: string }>(
  rows: readonly T[],
  currencyByAccountId: ReadonlyMap<string, string>,
  currencyCode: string,
): { included: T[]; exclusions: CurrencyExclusions } {
  const included: T[] = []
  const excludedCurrencies: string[] = []

  for (const row of rows) {
    const rowCurrency = currencyByAccountId.get(row.account_id)
    if (rowCurrency === undefined || rowCurrency === currencyCode) included.push(row)
    else excludedCurrencies.push(rowCurrency)
  }

  return {
    included,
    exclusions: {
      count: excludedCurrencies.length,
      currencyCodes: sortCurrencyCodes(excludedCurrencies),
    },
  }
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

/**
 * Cuentas que conservarán su moneda al cambiar la principal (M12).
 *
 * Cambiar la moneda principal no migra cuentas: si el usuario pasa de COP a USD
 * teniendo cuentas en COP, esas cuentas siguen en COP y sus totales aparecen
 * aparte, o incluso dejan de existir cuentas en la nueva principal y la
 * presentación recae en la primera cuenta. Este conteo alimenta la advertencia
 * de Ajustes; `0` si no hay nada que advertir.
 */
export function accountsKeptInCurrentCurrency(
  accounts: readonly { currency_code: string }[],
  currentCurrencyCode: string,
  nextCurrencyCode: string,
): number {
  if (currentCurrencyCode === nextCurrencyCode) return 0
  return accounts.filter((account) => account.currency_code === currentCurrencyCode).length
}
