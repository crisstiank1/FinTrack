import { Select } from '@/components/ui/select'
import type { TransactionFilters as Filters } from '@/features/transactions/api'
import type { Tables } from '@/types/database.types'

interface TransactionFiltersBarProps {
  filters: Filters
  accounts: Tables<'accounts'>[]
  onChange: (filters: Filters) => void
}

export function TransactionFiltersBar({ filters, accounts, onChange }: TransactionFiltersBarProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <input
        type="month"
        aria-label="Mes"
        value={filters.month ?? ''}
        onChange={(event) => onChange({ ...filters, month: event.target.value || undefined })}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />

      <Select
        aria-label="Cuenta"
        className="w-auto"
        value={filters.accountId ?? ''}
        onChange={(event) => onChange({ ...filters, accountId: event.target.value || undefined })}
      >
        <option value="">Todas las cuentas</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Tipo"
        className="w-auto"
        value={filters.type ?? ''}
        onChange={(event) =>
          onChange({ ...filters, type: (event.target.value || undefined) as Filters['type'] })
        }
      >
        <option value="">Todos los tipos</option>
        <option value="income">Ingresos</option>
        <option value="expense">Gastos</option>
        <option value="transfer">Transferencias</option>
      </Select>
    </div>
  )
}
