// FinTrack guarda amount_minor como unidades mínimas de la moneda
// (ver docs/02-base-de-datos.md: "COP 15.000 se guarda como 15000"). Lo que
// es una "unidad mínima" depende de la moneda: COP trabaja en pesos enteros
// (exponente 0), mientras que USD, EUR, MXN, ARS y PEN lo hacen en centavos
// (exponente 2). Todos los montos se guardan como enteros, pero la escala de
// cada moneda la decide su exponente.

/**
 * Diccionario de exponentes por moneda, según ISO 4217:
 * 0 = sin decimales (COP, CLP, JPY), 2 = con centavos (USD, EUR, MXN, ARS, PEN).
 */
export const CURRENCY_EXPONENTS: Record<string, number> = {
  COP: 0,
  CLP: 0,
  JPY: 0,
  USD: 2,
  EUR: 2,
  MXN: 2,
  ARS: 2,
  PEN: 2,
}

/**
 * Exponente decimal de una moneda. Por seguridad, asume 2 decimales si no la
 * conoce: para un código desconocido, equivocarse de escala es más caro que
 * mostrar dos decimales.
 */
export function getCurrencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2
}

/**
 * De unidades mayores (lo que el usuario escribe, ej. 45.99) a unidades
 * mínimas (ej. 4599). `Math.round` evita el clásico 45.99 * 100 = 4598.99…
 */
export function toMinorUnit(majorAmount: number, currency: string): number {
  const exponent = getCurrencyExponent(currency)
  return Math.round(majorAmount * Math.pow(10, exponent))
}

/**
 * De unidades mínimas (ej. 4599) a unidades mayores (ej. 45.99). Es el reverso
 * exacto de `toMinorUnit` para el mismo exponente.
 */
export function toMajorUnit(minorAmount: number, currency: string): number {
  return minorAmount / Math.pow(10, getCurrencyExponent(currency))
}

export function formatAmount(amountMinor: number, currencyCode: string): string {
  const exponent = getCurrencyExponent(currencyCode)
  const majorAmount = toMajorUnit(amountMinor, currencyCode)
  const formatted = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(majorAmount)
  return `${currencyCode} ${formatted}`
}

/**
 * Normaliza el texto que el usuario está escribiendo en un campo de importe:
 * deja solo dígitos y, si `exponent > 0`, un único separador decimal (se
 * aceptan '.' y ','), con la fracción recortada a `exponent` decimales. Para
 * exponente 0 el separador desaparece y quedan solo dígitos.
 */
/**
 * Normaliza el texto que el usuario está escribiendo en un campo de importe.
 *
 * El campo se muestra con agrupación local ('1.500' mientras se teclea), así
 * que el parseo tiene que soportar dos cosas a la vez: los separadores de miles
 * que el propio campo introdujo y el separador decimal (',' o '.') que el
 * usuario escribe para monedas con centavos.
 *
 * Reglas:
 * - Exponente 0: solo importan los dígitos; '.' y ',' se descartan (los miles
 *   aquí no existen, y COP no tiene fracción).
 * - Exponente > 0: el separador decimal es el ÚLTIMO que venga seguido de como
 *   mucho `exponent` dígitos ('1.500,50' → miles '.' y decimal ','; '45.99' →
 *   decimal '.' por no tener miles). Si ninguno cumple, todos fueron miles y se
 *   descartan ('1.500' → 1500).
 */
export function sanitizeMoneyText(text: string, exponent: number): string {
  const clean = text.replace(/[^0-9.,]+/g, '')
  if (exponent === 0) return clean.replace(/[.,]/g, '')
  let decimalIdx = -1
  let idx = clean.length
  while (idx > 0) {
    idx -= 1
    const char = clean[idx]
    if (char !== ',' && char !== '.') continue
    if (clean.length - idx - 1 <= exponent) {
      decimalIdx = idx
      break
    }
  }
  if (decimalIdx === -1) return clean.replace(/[.,]/g, '')
  const integer = clean.slice(0, decimalIdx).replace(/[.,]/g, '')
  const fraction = clean.slice(decimalIdx + 1).replace(/[.,]/g, '').slice(0, exponent)
  return `${integer}${clean[decimalIdx]}${fraction}`
}

/** Texto saneado a unidades mayores; texto vacío o inválido devuelve 0. */
export function moneyTextToMajor(text: string): number {
  if (!text) return 0
  const value = Number(text.replace(',', '.'))
  return Number.isFinite(value) ? value : 0
}

/** Agrupa el entero con separadores de miles y conserva la fracción escrita. */
export function groupMoneyText(text: string): string {
  const sepIndex = text.search(/[,.]/)
  if (sepIndex === -1) {
    const digits = text.replace(/[^\d]/g, '')
    return digits ? new Intl.NumberFormat('es-CO').format(Number(digits)) : ''
  }
  const integer = text.slice(0, sepIndex).replace(/[^\d]/g, '')
  const grouped = integer ? new Intl.NumberFormat('es-CO').format(Number(integer)) : '0'
  return `${grouped}${text.slice(sepIndex)}`
}

/** Unidades mayores fijadas a `exponent` decimales, para mostrar al salir del campo. */
export function formatMajorUnits(majorAmount: number, exponent: number): string {
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(majorAmount)
}

/**
 * Monto abreviado sin código de moneda ('4,3 M'), para ejes de gráficos donde
 * un valor completo como '4.250.000' no cabe. Nunca usarlo para las cifras
 * principales: ahí se necesita el valor exacto.
 */
export function formatCompactAmount(amountMinor: number, currencyCode: string = 'COP'): string {
  const majorAmount = toMajorUnit(amountMinor, currencyCode)
  return new Intl.NumberFormat('es-CO', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(majorAmount)
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
