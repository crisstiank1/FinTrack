import { useEffect, useRef, useState } from 'react'
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
 * a mano, y el proyecto no tiene todavía un componente de menú. Lo que `details`
 * no trae —cerrar con Escape y cerrar al tocar fuera— se añade aquí (M9).
 */
export function ColumnVisibilityMenu({ table }: ColumnVisibilityMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [isOpen, setOpen] = useState(false)

  const columns = table.getAllLeafColumns().filter((column) => column.getCanHide())

  function close(returnFocus = false) {
    const details = detailsRef.current
    if (!details?.open) return

    details.open = false
    if (returnFocus) details.querySelector('summary')?.focus()
  }

  // Tocar fuera cierra el menú. Abierto tapa justo las filas que se quieren
  // mirar, y en una pantalla estrecha ocupa media tabla.
  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!detailsRef.current?.contains(event.target as Node)) close()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isOpen])

  return (
    <details
      ref={detailsRef}
      className="relative"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // El foco vuelve al botón: quien cierra con el teclado tiene que seguir
        // donde estaba, no al principio de la página.
        event.stopPropagation()
        close(true)
      }}
    >
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Columns3 className="size-4" aria-hidden="true" />
        Columnas
      </summary>

      {/*
        En pantalla ancha el menú cuelga del borde derecho del botón, que es el
        borde derecho de la cabecera. En estrecho, el botón está a la izquierda y
        sus 16 rem se salían por el borde izquierdo de la pantalla: ahí se ancla a
        la izquierda y se limita al ancho disponible.
      */}
      <div className="absolute left-0 z-20 mt-2 max-h-[70vh] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-border bg-popover p-2 shadow-lg sm:left-auto sm:right-0">
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
