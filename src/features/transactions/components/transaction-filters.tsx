import { Select } from '@/components/ui/select'
import type { TransactionFilters as Filters } from '@/features/transactions/api'
import type { Tables } from '@/types/database.types'

interface TransactionFiltersBarProps {
  filters: Filters
  accounts: Tables<'accounts'>[]
  /** Monedas de las cuentas del usuario. Con menos de dos no se muestra el selector. */
  currencyCodes: string[]
  onChange: (filters: Filters) => void
}

export function TransactionFiltersBar({
  filters,
  accounts,
  currencyCodes,
  onChange,
}: TransactionFiltersBarProps) {
  // Con una moneda elegida, una cuenta de otra moneda nunca devolvería filas.
  const availableAccounts = filters.currencyCode
    ? accounts.filter((account) => account.currency_code === filters.currencyCode)
    : accounts

  return (
    <div className="flex flex-wrap gap-3">
      <input
        type="month"
        aria-label="Mes"
        value={filters.month ?? ''}
        onChange={(event) => onChange({ ...filters, month: event.target.value || undefined })}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />

      {currencyCodes.length > 1 && (
        <Select
          aria-label="Moneda"
          className="w-auto"
          value={filters.currencyCode ?? ''}
          onChange={(event) => {
            const currencyCode = event.target.value || undefined
            const keepsAccount =
              !currencyCode ||
              accounts.find((account) => account.id === filters.accountId)?.currency_code ===
                currencyCode

            onChange({
              ...filters,
              currencyCode,
              accountId: keepsAccount ? filters.accountId : undefined,
            })
          }}
        >
          <option value="">Todas las monedas</option>
          {currencyCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      )}

      <Select
        aria-label="Cuenta"
        className="w-auto"
        value={filters.accountId ?? ''}
        onChange={(event) => onChange({ ...filters, accountId: event.target.value || undefined })}
      >
        <option value="">Todas las cuentas</option>
        {availableAccounts.map((account) => (
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
