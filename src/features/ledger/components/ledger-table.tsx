import { flexRender, type Table } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { Tables } from '@/types/database.types'

interface LedgerTableProps {
  table: Table<Tables<'transactions'>>
}

/**
 * Tabla del libro para escritorio.
 *
 * El scroll horizontal vive en el contenedor de la tabla, no en la página: con
 * ocho columnas de ancho variable el desbordamiento es esperable, pero mover
 * la página entera de lado rompería el resto de la interfaz.
 */
export function LedgerTable({ table }: LedgerTableProps) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface-elevated">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort()
                const sorted = header.column.getIsSorted()
                const alignRight = header.column.columnDef.meta?.align === 'right'

                const label = flexRender(header.column.columnDef.header, header.getContext())

                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sorted === 'asc'
                        ? 'ascending'
                        : sorted === 'desc'
                          ? 'descending'
                          : canSort
                            ? 'none'
                            : undefined
                    }
                    className={cn(
                      'whitespace-nowrap border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                      alignRight ? 'text-right' : 'text-left',
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-sm uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                          alignRight && 'flex-row-reverse',
                        )}
                      >
                        {label}
                        {sorted === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>

        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/50">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={cn(
                    'px-3 py-2.5',
                    cell.column.columnDef.meta?.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
