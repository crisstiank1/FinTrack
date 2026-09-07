import { Copy, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AmountCell } from '@/features/ledger/components/amount-cell'
import { TYPE_LABELS } from '@/features/ledger/labels'
import { formatAmount } from '@/lib/currency'
import { formatShortDate } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

interface LedgerCardsProps {
  transactions: Tables<'transactions'>[]
  accountsById: Map<string, Tables<'accounts'>>
  categoriesById: Map<string, Tables<'categories'>>
  currencyCode: string
  balanceByDate?: Map<string, number>
  onEdit: (transaction: Tables<'transactions'>) => void
  onDuplicate: (transaction: Tables<'transactions'>) => void
  onDelete: (transaction: Tables<'transactions'>) => void
}

/**
 * Versión móvil del libro.
 *
 * Una tabla de ocho columnas en 375px obligaría a desplazarse de lado para
 * leer una sola fila. Se muestran los mismos datos como tarjetas apiladas.
 */
export function LedgerCards({
  transactions,
  accountsById,
  categoriesById,
  currencyCode,
  balanceByDate,
  onEdit,
  onDuplicate,
  onDelete,
}: LedgerCardsProps) {
  return (
    <ul className="flex flex-col gap-2 sm:hidden">
      {transactions.map((transaction) => {
        const account = accountsById.get(transaction.account_id)
        const category = transaction.category_id
          ? categoriesById.get(transaction.category_id)
          : undefined
        const balance = balanceByDate?.get(transaction.transaction_date)

        return (
          <li
            key={transaction.id}
            className="rounded-xl border border-border bg-card p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{transaction.description}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {formatShortDate(transaction.transaction_date)} ·{' '}
                  {account?.name ?? 'Cuenta eliminada'}
                  {category ? ` · ${category.name}` : ''}
                </p>
              </div>
              <AmountCell transaction={transaction} currencyCode={currencyCode} />
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {TYPE_LABELS[transaction.type] ?? transaction.type}
                {balance !== undefined && ` · Saldo ${formatAmount(balance, currencyCode)}`}
              </span>

              <div className="flex gap-1">
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
            </div>
          </li>
        )
      })}
    </ul>
  )
}
