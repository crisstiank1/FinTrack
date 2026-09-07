import { signedAmountMinor } from '@/lib/calculations'
import { toCsv, type CsvColumn } from '@/lib/csv'
import { todayIsoDate } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

import { TYPE_LABELS } from './labels'

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
 *
 * Sobre las transferencias: se exportan las dos filas del par con signos
 * opuestos, así que sumar la columna Monto sobre un export completo da el
 * balance correcto (se anulan entre sí). Pero un export filtrado por una sola
 * cuenta contiene solo una de las dos mitades, y ahí la suma queda desviada
 * por ese monto. Las columnas Tipo y Grupo de transferencia existen para que
 * ese caso sea detectable y auditable: filtrando por Tipo se puede excluir o
 * emparejar las transferencias en la hoja de cálculo.
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
      header: 'Dirección',
      value: (row) =>
        row.transfer_direction === 'incoming'
          ? 'Recibida'
          : row.transfer_direction === 'outgoing'
            ? 'Enviada'
            : '',
    },
    { header: 'Grupo de transferencia', value: (row) => row.transfer_group_id ?? '' },
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
