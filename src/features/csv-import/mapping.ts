import { EMPTY_MAPPING, type AmountMode, type ColumnMapping } from './normalize'

/**
 * Propuesta inicial de mapeo a partir de los encabezados.
 *
 * Es solo un punto de partida visible: la interfaz muestra cada elección en un
 * selector y el usuario puede cambiarla. No reconoce bancos concretos; reconoce
 * palabras frecuentes en extractos en español.
 */
const PATTERNS: Record<keyof ColumnMapping, RegExp> = {
  date: /^(fecha|f\.?\s*(operaci[oó]n|movimiento|transacci[oó]n)|date)/i,
  description: /(descripci[oó]n|concepto|detalle|referencia|description)/i,
  amount: /^(valor|monto|importe|amount)/i,
  debit: /(d[eé]bito|cargo|retiro|egreso|debit)/i,
  credit: /(cr[eé]dito|abono|dep[oó]sito|ingreso|credit)/i,
  balance: /(saldo|balance)/i,
}

function normalize(header: string): string {
  return header.normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

export function suggestMapping(headers: readonly string[]): {
  mapping: ColumnMapping
  amountMode: AmountMode
} {
  const mapping: ColumnMapping = { ...EMPTY_MAPPING }
  const taken = new Set<number>()

  // El saldo primero, para que «Saldo» no se tome como monto ni «Valor saldo»
  // como importe.
  const order: (keyof ColumnMapping)[] = [
    'balance',
    'date',
    'debit',
    'credit',
    'amount',
    'description',
  ]
  for (const field of order) {
    const index = headers.findIndex(
      (header, i) =>
        !taken.has(i) && (PATTERNS[field].test(header) || PATTERNS[field].test(normalize(header))),
    )
    if (index >= 0) {
      mapping[field] = index
      taken.add(index)
    }
  }

  const amountMode: AmountMode =
    mapping.debit !== null && mapping.credit !== null && mapping.amount === null
      ? 'debit_credit'
      : 'signed'

  if (amountMode === 'signed') {
    // Sin columna de monto, una sola columna de débito o crédito no basta.
    mapping.debit = null
    mapping.credit = null
  }

  return { mapping, amountMode }
}
