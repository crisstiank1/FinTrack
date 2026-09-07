import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import type { LedgerFilters } from '@/features/ledger/api'
import type { Tables } from '@/types/database.types'

interface LedgerFiltersBarProps {
  filters: LedgerFilters
  /** Texto de búsqueda sin retardo, para que el campo no se sienta lento. */
  searchInput: string
  onSearchInputChange: (value: string) => void
  onChange: (filters: LedgerFilters) => void
  accounts: Tables<'accounts'>[]
  categories: Tables<'categories'>[]
}

export function LedgerFiltersBar({
  filters,
  searchInput,
  onSearchInputChange,
  onChange,
  accounts,
  categories,
}: LedgerFiltersBarProps) {
  // Con un tipo elegido, ofrecer categorías del otro tipo solo produce
  // combinaciones que nunca devuelven resultados.
  const availableCategories = filters.type
    ? categories.filter((category) => category.type === filters.type)
    : categories

  const hasFilters =
    Boolean(searchInput) ||
    Boolean(filters.accountId) ||
    Boolean(filters.categoryId) ||
    Boolean(filters.type) ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo)

  function update(partial: Partial<LedgerFilters>) {
    onChange({ ...filters, ...partial })
  }

  function clearAll() {
    onSearchInputChange('')
    onChange({})
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5 lg:col-span-3">
          <Label htmlFor="ledger-search">Buscar por descripción</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="ledger-search"
              type="search"
              className="pl-9"
              placeholder="Ej. mercado"
              value={searchInput}
              onChange={(event) => onSearchInputChange(event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ledger-account">Cuenta</Label>
          <Select
            id="ledger-account"
            value={filters.accountId ?? ''}
            onChange={(event) => update({ accountId: event.target.value || undefined })}
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
                {account.is_archived ? ' (archivada)' : ''}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ledger-type">Tipo</Label>
          <Select
            id="ledger-type"
            value={filters.type ?? ''}
            onChange={(event) => {
              const type = (event.target.value || undefined) as LedgerFilters['type']
              // Cambiar de tipo puede dejar seleccionada una categoría del tipo
              // anterior, que no devolvería ninguna fila.
              const keepsCategory =
                !type ||
                categories.find((category) => category.id === filters.categoryId)?.type === type

              update({ type, categoryId: keepsCategory ? filters.categoryId : undefined })
            }}
          >
            <option value="">Todos los tipos</option>
            <option value="income">Ingresos</option>
            <option value="expense">Gastos</option>
            <option value="transfer">Transferencias</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ledger-category">Categoría</Label>
          <Select
            id="ledger-category"
            value={filters.categoryId ?? ''}
            onChange={(event) => update({ categoryId: event.target.value || undefined })}
          >
            <option value="">Todas las categorías</option>
            {availableCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ledger-date-from">Desde</Label>
          <Input
            id="ledger-date-from"
            type="date"
            max={filters.dateTo}
            value={filters.dateFrom ?? ''}
            onChange={(event) => update({ dateFrom: event.target.value || undefined })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ledger-date-to">Hasta</Label>
          <Input
            id="ledger-date-to"
            type="date"
            min={filters.dateFrom}
            value={filters.dateTo ?? ''}
            onChange={(event) => update({ dateTo: event.target.value || undefined })}
          />
        </div>

        <div className="flex items-end">
          {hasFilters && (
            <Button type="button" variant="ghost" onClick={clearAll}>
              <X className="size-4" aria-hidden="true" />
              Limpiar filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
