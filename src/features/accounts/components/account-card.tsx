import { Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { accountTypeOptions } from '@/features/accounts/schemas'
import { formatAmount } from '@/lib/currency'
import { getIcon } from '@/lib/icons'
import type { Tables } from '@/types/database.types'

interface AccountCardProps {
  account: Tables<'accounts'>
  /**
   * Saldo actual (inicial + movimientos), no el saldo inicial: la tarjeta dice
   * "dinero disponible" y debe coincidir con el saldo consolidado del dashboard.
   */
  balanceMinor: number
  index: number
  onEdit: () => void
  onArchive: () => void
}

export function AccountCard({
  account,
  balanceMinor,
  index,
  onEdit,
  onArchive,
}: AccountCardProps) {
  const Icon = getIcon(account.icon)
  const typeLabel =
    accountTypeOptions.find((option) => option.value === account.type)?.label ?? account.type
  const accentColor = account.color ?? '#E83E8C'

  return (
    <div
      className="animate-card-in relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm transition-opacity duration-300"
      style={{ animationDelay: `${index * 40}ms`, opacity: account.is_archived ? 0.6 : 1 }}
    >
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: accentColor }} aria-hidden="true" />

      <div className="flex items-start justify-between">
        <div
          className="flex size-10 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        {account.is_archived && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            Archivada
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm text-muted-foreground">{typeLabel}</p>
        <h3 className="text-lg font-semibold text-foreground">{account.name}</h3>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
          {formatAmount(balanceMinor, account.currency_code)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">Dinero actual disponible en esta cuenta</p>
      </div>

      {!account.is_archived && (
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-4" aria-hidden="true" />
            Editar
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onArchive}>
            Archivar
          </Button>
        </div>
      )}
    </div>
  )
}
