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
  /** Texto de la otra pata si es una transferencia (ver `formatTransferCounterpart`). */
  counterpartLabel?: string
  /**
   * Si se ofrece editar. Una transferencia solo se puede editar cuando se
   * conoce su otra pata (M8, ver `transferEditDefaults`).
   */
  canEdit: boolean
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
  counterpartLabel,
  canEdit,
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
    // En pantallas estrechas importe y acciones bajan a una segunda línea en
    // vez de dejar la descripción reducida a una o dos letras.
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-3 transition-shadow duration-200 hover:shadow-card">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary-strong">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{transaction.description}</p>
          <p className="truncate text-xs text-muted-foreground">
            {new Date(`${transaction.transaction_date}T00:00:00`).toLocaleDateString('es-CO')} ·{' '}
            {accountName}
            {categoryName ? ` · ${categoryName}` : isTransfer ? ' · Transferencia' : ''}
          </p>
          {isTransfer && counterpartLabel && (
            <p className="truncate text-xs text-muted-foreground">{counterpartLabel}</p>
          )}
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span className={`text-sm font-semibold tabular-nums ${amountColor}`}>
          {sign} {formatAmount(transaction.amount_minor, currencyCode)}
        </span>
        {/* Botones de solo icono: el nombre accesible incluye el movimiento, porque
            cada fila repite los mismos tres y un lector de pantalla no sabría a
            cuál se refiere «Eliminar movimiento». */}
        <div className="flex gap-1">
          {canEdit && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onEdit}
              aria-label={`${isTransfer ? 'Editar transferencia' : 'Editar movimiento'} «${transaction.description}»`}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDuplicate}
            aria-label={`Duplicar movimiento «${transaction.description}»`}
          >
            <Copy className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={`Eliminar movimiento «${transaction.description}»`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  )
}
