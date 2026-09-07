import { Columns3 } from 'lucide-react'
import type { Table } from '@tanstack/react-table'

import type { Tables } from '@/types/database.types'

interface ColumnVisibilityMenuProps {
  table: Table<Tables<'transactions'>>
}

/**
 * Selector de columnas.
 *
 * Usa `<details>` en vez de un menú flotante propio: trae por defecto el
 * comportamiento de teclado, foco y `aria-expanded` que habría que reconstruir
 * a mano, y el proyecto no tiene todavía un componente de menú.
 */
export function ColumnVisibilityMenu({ table }: ColumnVisibilityMenuProps) {
  const columns = table.getAllLeafColumns().filter((column) => column.getCanHide())

  return (
    <details className="relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Columns3 className="size-4" aria-hidden="true" />
        Columnas
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-border bg-popover p-2 shadow-lg">
        <ul className="flex flex-col">
          {columns.map((column) => (
            <li key={column.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={column.getIsVisible()}
                  onChange={column.getToggleVisibilityHandler()}
                />
                {column.columnDef.meta?.label ?? column.id}
              </label>
            </li>
          ))}
        </ul>

        <p className="mt-1 border-t border-border px-2 pt-2 text-xs text-muted-foreground">
          "Saldo acumulado" necesita todo el historial de movimientos, así que
          activarlo carga más datos.
        </p>
      </div>
    </details>
  )
}
