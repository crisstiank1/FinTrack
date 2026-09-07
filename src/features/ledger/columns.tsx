import { createColumnHelper, type RowData } from '@tanstack/react-table'
import { Copy, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/currency'
import { formatShortDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

type Transaction = Tables<'transactions'>

declare module '@tanstack/react-table' {
  // TData y TValue no se usan aquí, pero la firma original de ColumnMeta los
  // declara y debe respetarse para que la fusión de tipos funcione.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Alineación de la celda; las cifras van a la derecha. */
    align?: 'left' | 'right'
    /** Nombre legible para el selector de columnas. */
    label: string
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}

export interface LedgerColumnContext {
  accountsById: Map<string, Tables<'accounts'>>
  categoriesById: Map<string, Tables<'categories'>>
  currencyCode: string
  /** Saldo al cierre de cada día. Ausente si la columna está oculta. */
  balanceByDate?: Map<string, number>
  onEdit: (transaction: Transaction) => void
  onDuplicate: (transaction: Transaction) => void
  onDelete: (transaction: Transaction) => void
}

export const TYPE_LABELS: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
}

const TYPE_STYLES: Record<string, string> = {
  income: 'bg-success/12 text-success',
  expense: 'bg-danger/12 text-danger',
  transfer: 'bg-muted text-muted-foreground',
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        TYPE_STYLES[type] ?? TYPE_STYLES.transfer,
      )}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}

/** Signo y color del monto, con el mismo criterio que el resto de la app. */
export function AmountCell({
  transaction,
  currencyCode,
}: {
  transaction: Transaction
  currencyCode: string
}) {
  const isTransfer = transaction.type === 'transfer'
  const isNegative =
    transaction.type === 'expense' || (isTransfer && transaction.transfer_direction === 'outgoing')

  return (
    <span
      className={cn(
        'whitespace-nowrap font-medium tabular-nums',
        isTransfer
          ? 'text-muted-foreground'
          : transaction.type === 'income'
            ? 'text-success'
            : 'text-danger',
      )}
    >
      {isNegative ? '−' : '+'} {formatAmount(transaction.amount_minor, currencyCode)}
    </span>
  )
}

const column = createColumnHelper<Transaction>()

export function createLedgerColumns(context: LedgerColumnContext) {
  const {
    accountsById,
    categoriesById,
    currencyCode,
    balanceByDate,
    onEdit,
    onDuplicate,
    onDelete,
  } = context

  return [
    column.accessor('transaction_date', {
      id: 'transaction_date',
      header: 'Fecha',
      meta: { label: 'Fecha' },
      cell: (info) => (
        <span className="whitespace-nowrap tabular-nums">{formatShortDate(info.getValue())}</span>
      ),
    }),

    column.accessor('description', {
      id: 'description',
      header: 'Descripción',
      meta: { label: 'Descripción' },
      cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
    }),

    column.display({
      id: 'account',
      header: 'Cuenta',
      // El orden por cuenta requeriría ordenar por el nombre de otra tabla;
      // PostgREST no lo hace sobre una relación sin una vista dedicada.
      enableSorting: false,
      meta: { label: 'Cuenta' },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {accountsById.get(row.original.account_id)?.name ?? 'Cuenta eliminada'}
        </span>
      ),
    }),

    column.display({
      id: 'category',
      header: 'Categoría',
      enableSorting: false,
      meta: { label: 'Categoría' },
      cell: ({ row }) => {
        const category = row.original.category_id
          ? categoriesById.get(row.original.category_id)
          : undefined

        return (
          <span className="whitespace-nowrap text-muted-foreground">
            {category?.name ?? (row.original.type === 'transfer' ? '—' : 'Sin categoría')}
          </span>
        )
      },
    }),

    column.accessor('type', {
      id: 'type',
      header: 'Tipo',
      enableSorting: false,
      meta: { label: 'Tipo' },
      cell: (info) => <TypeBadge type={info.getValue()} />,
    }),

    column.accessor('amount_minor', {
      id: 'amount_minor',
      header: 'Monto',
      meta: { align: 'right', label: 'Monto' },
      cell: ({ row }) => <AmountCell transaction={row.original} currencyCode={currencyCode} />,
    }),

    column.display({
      id: 'runningBalance',
      header: 'Saldo acumulado',
      enableSorting: false,
      meta: { align: 'right', label: 'Saldo acumulado' },
      cell: ({ row }) => {
        const balance = balanceByDate?.get(row.original.transaction_date)

        return (
          <span className="whitespace-nowrap tabular-nums text-muted-foreground">
            {balance === undefined ? '—' : formatAmount(balance, currencyCode)}
          </span>
        )
      },
    }),

    column.display({
      id: 'actions',
      header: 'Acciones',
      enableSorting: false,
      enableHiding: false,
      meta: { align: 'right', label: 'Acciones' },
      cell: ({ row }) => {
        const transaction = row.original

        return (
          <div className="flex justify-end gap-1">
            {transaction.type !== 'transfer' && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onEdit(transaction)}
                aria-label={`Editar ${transaction.description}`}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDuplicate(transaction)}
              aria-label={`Duplicar ${transaction.description}`}
            >
              <Copy className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(transaction)}
              aria-label={`Eliminar ${transaction.description}`}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        )
      },
    }),
  ]
}
