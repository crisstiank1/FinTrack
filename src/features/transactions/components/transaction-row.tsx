import { Copy, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/currency'
import { getIcon } from '@/lib/icons'
import type { Tables } from '@/types/database.types'

interface TransactionRowProps {
  transaction: Tables<'transactions'>
  accountName: string
  categoryName: string | null
  categoryIcon: string | null
  currencyCode: string
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export function TransactionRow({
  transaction,
  accountName,
  categoryName,
  categoryIcon,
  currencyCode,
  onEdit,
  onDuplicate,
  onDelete,
}: TransactionRowProps) {
  const isTransfer = transaction.type === 'transfer'
  const Icon = getIcon(isTransfer ? 'trending-up' : categoryIcon)
  const isNegative =
    transaction.type === 'expense' || (isTransfer && transaction.transfer_direction === 'outgoing')
  const sign = isNegative ? '−' : '+'
  const amountColor = isTransfer
    ? 'text-muted-foreground'
    : transaction.type === 'income'
      ? 'text-success'
      : 'text-danger'

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-muted-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{transaction.description}</p>
          <p className="truncate text-xs text-muted-foreground">
            {new Date(`${transaction.transaction_date}T00:00:00`).toLocaleDateString('es-CO')} ·{' '}
            {accountName}
            {categoryName ? ` · ${categoryName}` : isTransfer ? ' · Transferencia' : ''}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-sm font-semibold tabular-nums ${amountColor}`}>
          {sign} {formatAmount(transaction.amount_minor, currencyCode)}
        </span>
        <div className="flex gap-1">
          {!isTransfer && (
            <Button type="button" variant="ghost" size="icon" onClick={onEdit} aria-label="Editar movimiento">
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDuplicate}
            aria-label="Duplicar movimiento"
          >
            <Copy className="size-4" aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onDelete} aria-label="Eliminar movimiento">
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
