import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

/** Signo y color del monto, con el mismo criterio que el resto de la app. */
export function AmountCell({
  transaction,
  currencyCode,
}: {
  transaction: Tables<'transactions'>
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
