import { ArrowLeftRight } from 'lucide-react'

import { formatAmount } from '@/lib/currency'
import { formatShortDate } from '@/lib/dates'
import { getIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

import type { DashboardAccount, DashboardCategory, DashboardTransaction } from '../summary'

interface RecentTransactionsProps {
  transactions: DashboardTransaction[]
  accountsById: Map<string, DashboardAccount>
  categoriesById: Map<string, DashboardCategory>
  fallbackCurrency: string
}

/**
 * Últimos movimientos del mes, en modo consulta.
 *
 * A diferencia de la fila de /transactions, aquí no hay editar/duplicar/eliminar:
 * el dashboard es para leer el estado financiero, y las acciones destructivas
 * viven donde el usuario ya tiene el contexto completo del movimiento.
 */
export function RecentTransactions({
  transactions,
  accountsById,
  categoriesById,
  fallbackCurrency,
}: RecentTransactionsProps) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {transactions.map((transaction) => {
        const account = accountsById.get(transaction.account_id)
        const category = transaction.category_id
          ? categoriesById.get(transaction.category_id)
          : undefined

        const isTransfer = transaction.type === 'transfer'
        const isNegative =
          transaction.type === 'expense' ||
          (isTransfer && transaction.transfer_direction === 'outgoing')

        const Icon = isTransfer ? ArrowLeftRight : getIcon(category?.icon)

        return (
          <li key={transaction.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-muted-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {transaction.description}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatShortDate(transaction.transaction_date)} ·{' '}
                {account?.name ?? 'Cuenta eliminada'}
                {category ? ` · ${category.name}` : isTransfer ? ' · Transferencia' : ''}
              </p>
            </div>

            <span
              className={cn(
                'shrink-0 text-sm font-semibold tabular-nums',
                isTransfer
                  ? 'text-muted-foreground'
                  : transaction.type === 'income'
                    ? 'text-success'
                    : 'text-danger',
              )}
            >
              {isNegative ? '−' : '+'}{' '}
              {formatAmount(transaction.amount_minor, account?.currency_code ?? fallbackCurrency)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
