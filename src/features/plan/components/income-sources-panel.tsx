import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/currency'

import { formatPlannedIncomeAmount } from '../labels'

export interface IncomeSourceItem {
  id: string
  name: string
  plannedMinor: number
  /** Nombres de las categorías vinculadas, ya resueltos. */
  categoryNames: string[]
}

interface IncomeSourcesPanelProps {
  sources: IncomeSourceItem[]
  /** Suma de lo planeado. `null` cuando no hay ninguna fuente. */
  totalPlannedMinor: number | null
  currencyCode: string
  monthLabel: string
  isBusy?: boolean
  onAdd: () => void
  onEdit: (sourceId: string) => void
  onDelete: (sourceId: string) => void
}

/**
 * Fuentes de ingreso planeadas del mes.
 *
 * Es el único bloque de `/plan` donde el usuario escribe, y solo sobre lo
 * planeado: ninguna cifra «Actual» aparece aquí ni se vuelve editable en
 * ninguna otra parte de la pantalla.
 *
 * Un mes con plan y sin fuentes es un estado normal y se dice como tal: el plan
 * ya existe, falta ponerle ingresos. No se reutiliza el aviso de «todavía no
 * tiene plan», que después de crearlo sería falso.
 */
export function IncomeSourcesPanel({
  sources,
  totalPlannedMinor,
  currencyCode,
  monthLabel,
  isBusy,
  onAdd,
  onEdit,
  onDelete,
}: IncomeSourcesPanelProps) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          Ingresos planeados
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={isBusy}>
          <Plus className="size-4" aria-hidden="true" />
          Añadir fuente
        </Button>
      </div>

      {sources.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-6 text-center">
          <p className="text-sm text-foreground first-letter:uppercase">
            Tu plan de {monthLabel} está listo.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Añade una fuente de ingreso para calcular el ingreso planeado y el reparto.
          </p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {sources.map((source) => (
            <li
              key={source.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{source.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {source.categoryNames.length > 0
                    ? source.categoryNames.join(', ')
                    : 'Sin categorías vinculadas'}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <span className="mr-2 text-sm tabular-nums text-foreground">
                  {formatAmount(source.plannedMinor, currencyCode)}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onEdit(source.id)}
                  disabled={isBusy}
                  aria-label={`Editar ${source.name}`}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => onDelete(source.id)}
                  disabled={isBusy}
                  aria-label={`Eliminar ${source.name}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Ingreso planeado</span>
        <span className="font-semibold tabular-nums text-foreground">
          {formatPlannedIncomeAmount(totalPlannedMinor, currencyCode)}
        </span>
      </p>
    </section>
  )
}
