import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { currentMonthKey, formatMonthLabel, shiftMonthKey } from '@/lib/dates'

import type { DashboardAccount } from '../summary'

interface DashboardToolbarProps {
  monthKey: string
  onMonthChange: (monthKey: string) => void
  accounts: DashboardAccount[]
  accountId?: string
  onAccountChange: (accountId: string | undefined) => void
}

export function DashboardToolbar({
  monthKey,
  onMonthChange,
  accounts,
  accountId,
  onAccountChange,
}: DashboardToolbarProps) {
  // Adelantarse al mes actual solo mostraría un dashboard vacío.
  const isAtCurrentMonth = monthKey >= currentMonthKey()

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onMonthChange(shiftMonthKey(monthKey, -1))}
          aria-label={`Mes anterior: ${formatMonthLabel(shiftMonthKey(monthKey, -1))}`}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>

        <input
          type="month"
          aria-label="Mes"
          value={monthKey}
          max={currentMonthKey()}
          onChange={(event) => event.target.value && onMonthChange(event.target.value)}
          className="h-8 rounded-md bg-transparent px-2 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={isAtCurrentMonth}
          onClick={() => onMonthChange(shiftMonthKey(monthKey, 1))}
          aria-label={`Mes siguiente: ${formatMonthLabel(shiftMonthKey(monthKey, 1))}`}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <Select
        aria-label="Cuenta"
        className="h-10 w-auto"
        value={accountId ?? ''}
        onChange={(event) => onAccountChange(event.target.value || undefined)}
      >
        <option value="">Todas las cuentas</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </Select>
    </div>
  )
}
