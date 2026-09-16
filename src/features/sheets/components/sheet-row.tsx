import { flexRender, type Row } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { SheetDraftRow } from '../api'
import { sheetErrorText, type FieldError } from '../schemas'

interface SheetRowProps {
  row: Row<SheetDraftRow>
  /** Errores de validación de esta fila (espejo de `register_sheet_draft`). */
  errors: FieldError[]
  onRemove: (draftId: string) => void
}

/**
 * Una fila de la rejilla. Las filas con errores se tiñen y resumen sus
 * problemas en la columna de acciones; el detalle queda con `title` y en la
 * primera celda errónea.
 */
export function SheetRow({ row, errors, onRemove }: SheetRowProps) {
  const detail = errors.map((error) => sheetErrorText(error.field, error.code)).join('\n')

  return (
    <tr className={cn('border-b border-border', errors.length > 0 && 'bg-destructive/5')}>
      {row.getVisibleCells().map((cell) => (
        <td key={cell.id} className="min-w-28 px-2 py-1 align-top">
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
      <td className="px-1 py-1 text-center align-top">
        {errors.length > 0 && (
          <span
            title={detail}
            className="mb-1 block text-xs font-medium text-destructive"
            aria-label="Fila con errores de validación"
          >
            {errors.length === 1 ? '1 error' : `${errors.length} errores`}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8"
          aria-label="Eliminar borrador"
          onClick={() => onRemove(row.original.id)}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </td>
    </tr>
  )
}
