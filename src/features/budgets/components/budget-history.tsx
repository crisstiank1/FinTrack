import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/currency'
import { formatMonthLabel, monthOfIsoDate } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

import { BudgetForm } from './budget-form'

interface BudgetHistoryProps {
  categoryName: string
  /** Todas las filas de esa categoría, en cualquier orden. */
  rows: Tables<'budgets'>[]
  currencyCode: string
  onCorrect: (budgetId: string, amountMinor: number) => void | Promise<void>
  onDelete: (budgetId: string) => void | Promise<void>
  isSubmitting?: boolean
}

/**
 * Versiones de una categoría: plantillas y excepciones.
 *
 * Solo permite dos cosas sobre cada fila, corregir el importe y eliminarla,
 * porque son las únicas que el modelo admite sin reescribir el pasado. La
 * categoría, el mes y la fecha de vigencia no se editan: cambiarlos convertiría
 * la fila en otra distinta. Por eso funciona también con categorías
 * archivadas, que se pueden seguir corrigiendo aunque no puedan estrenar
 * presupuesto.
 */
export function BudgetHistory({
  categoryName,
  rows,
  currencyCode,
  onCorrect,
  onDelete,
  isSubmitting,
}: BudgetHistoryProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const ordered = useMemo(
    () => [...rows].sort((a, b) => b.effective_from.localeCompare(a.effective_from)),
    [rows],
  )

  if (ordered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {categoryName} todavía no tiene ninguna versión de presupuesto.
      </p>
    )
  }

  async function handleCorrect(budgetId: string, amountMinor: number) {
    await onCorrect(budgetId, amountMinor)
    setEditingId(null)
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {ordered.map((row) => {
          const isException = row.period_month !== null
          const month = formatMonthLabel(monthOfIsoDate(row.period_month ?? row.effective_from))

          return (
            <li key={row.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {isException ? 'Excepción' : 'Plantilla'}
                  </span>
                  <p className="mt-1 text-sm text-foreground first-letter:uppercase">
                    {isException ? `Solo ${month}` : `Desde ${month}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums text-foreground">
                    {formatAmount(row.amount_minor, currencyCode)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Corregir monto de ${isException ? `la excepción de ${month}` : `la plantilla desde ${month}`}`}
                    onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Eliminar ${isException ? `la excepción de ${month}` : `la plantilla desde ${month}`}`}
                    onClick={() => setDeletingId(row.id)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              {editingId === row.id && (
                <div className="mt-3 border-t border-border pt-3">
                  <BudgetForm
                    monthKey={monthOfIsoDate(row.effective_from)}
                    defaultAmountMinor={row.amount_minor}
                    // Una corrección no crea versiones: no hay alcance que elegir.
                    mode="correction"
                    allowTemplate={false}
                    submitLabel="Guardar corrección"
                    isSubmitting={isSubmitting}
                    onSubmit={({ amountMinor }) => handleCorrect(row.id, amountMinor)}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Eliminar esta versión"
        description="Se elimina solo esta fila del historial. El progreso de los meses que dependían de ella se recalculará con la versión anterior, si existe."
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (deletingId) void onDelete(deletingId)
          setDeletingId(null)
        }}
      />
    </>
  )
}
