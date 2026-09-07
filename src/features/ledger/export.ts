import { signedAmountMinor } from '@/lib/calculations'
import { toCsv, type CsvColumn } from '@/lib/csv'
import { todayIsoDate } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

import { TYPE_LABELS } from './columns'

type Transaction = Tables<'transactions'>

export interface ExportContext {
  accountsById: Map<string, Pick<Tables<'accounts'>, 'name' | 'currency_code'>>
  categoriesById: Map<string, Pick<Tables<'categories'>, 'name'>>
  fallbackCurrency: string
}

/**
 * Construye el CSV del libro.
 *
 * El monto va con signo (negativo para gastos y transferencias enviadas) y sin
 * separadores de miles ni código de moneda, para que sea un número sumable en
 * la hoja de cálculo. La moneda va en su propia columna.
 */
export function buildLedgerCsv(transactions: Transaction[], context: ExportContext): string {
  const { accountsById, categoriesById, fallbackCurrency } = context

  const columns: CsvColumn<Transaction>[] = [
    { header: 'Fecha', value: (row) => row.transaction_date },
    { header: 'Descripción', value: (row) => row.description },
    { header: 'Cuenta', value: (row) => accountsById.get(row.account_id)?.name ?? '' },
    {
      header: 'Categoría',
      value: (row) => (row.category_id ? (categoriesById.get(row.category_id)?.name ?? '') : ''),
    },
    { header: 'Tipo', value: (row) => TYPE_LABELS[row.type] ?? row.type },
    {
      header: 'Monto',
      value: (row) =>
        signedAmountMinor({
          type: row.type as 'income' | 'expense' | 'transfer',
          transfer_direction: row.transfer_direction as 'incoming' | 'outgoing' | null,
          amount_minor: row.amount_minor,
        }),
    },
    {
      header: 'Moneda',
      value: (row) => accountsById.get(row.account_id)?.currency_code ?? fallbackCurrency,
    },
    { header: 'Notas', value: (row) => row.notes ?? '' },
  ]

  return toCsv(transactions, columns)
}

export function ledgerCsvFilename(): string {
  return `fintrack-libro-${todayIsoDate()}.csv`
}
