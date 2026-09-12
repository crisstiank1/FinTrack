import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { budgetStatusLabel, budgetStatusTone, type BudgetTone } from '@/features/budgets/labels'
import type { BudgetProgress } from '@/features/budgets/progress'
import { formatAmount } from '@/lib/currency'
import { formatShortDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

import type { CategoryLineKind } from '../mutations'

export interface PlanLineItem {
  id: string
  name: string
  kind: CategoryLineKind
  categoryId: string
  /** Nombre de la categoría, ya resuelto. */
  categoryName: string
  /** La categoría se archivó después de crear la línea. */
  isCategoryArchived: boolean
  /** Solo en facturas, y solo si el usuario la escribió. */
  dueDate: string | null
}

interface PlanLinesPanelProps {
  bills: PlanLineItem[]
  variables: PlanLineItem[]
  /** Progreso por categoría, de `usePlanLineProgress`. Solo lectura. */
  progressByCategory: Record<string, BudgetProgress>
  currencyCode: string
  monthLabel: string
  isBusy?: boolean
  onAdd: () => void
  onEdit: (lineId: string) => void
  onDelete: (lineId: string) => void
}

const TONE_STYLES: Record<BudgetTone, string> = {
  neutral: 'text-muted-foreground',
  ok: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
}

/**
 * Facturas y gastos variables del mes.
 *
 * Las líneas son **descriptivas**: aportan nombre, agrupación y fecha esperada,
 * y deciden si el gasto de su categoría cuenta como factura, como variable o
 * como no planeado. No aportan cifras. Ni el presupuesto ni el gasto real son
 * editables aquí, y no por una decisión de interfaz: C7 impide que una línea
 * medida por categoría guarde importe, y ningún valor «Actual» se guarda en
 * ninguna tabla.
 *
 * Lo que sí se muestra es el progreso ya calculado —presupuesto efectivo, gasto
 * del mes y estado—, que viene de `usePlanLineProgress`, es decir de las mismas
 * `resolveBudget` y `buildBudgetProgressList` que usa `/budgets`. Cambiar el
 * presupuesto se hace allí, y cada fila enlaza a esa pantalla.
 */
export function PlanLinesPanel({
  bills,
  variables,
  progressByCategory,
  currencyCode,
  monthLabel,
  isBusy,
  onAdd,
  onEdit,
  onDelete,
}: PlanLinesPanelProps) {
  const titleId = useId()
  const isEmpty = bills.length === 0 && variables.length === 0

  return (
    <section aria-labelledby={titleId} className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            Facturas y gastos variables
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Describen en qué se va tu gasto. El importe de cada una sale de su presupuesto.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd} disabled={isBusy}>
          <Plus className="size-4" aria-hidden="true" />
          Añadir línea
        </Button>
      </div>

      {isEmpty ? (
        <div className="mt-3 rounded-xl border border-dashed border-border bg-card p-6 text-center">
          <p className="text-sm text-foreground first-letter:uppercase">
            {monthLabel} no tiene facturas ni gastos variables descritos.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Mientras tanto, todo tu gasto aparece en «No planeado».
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-6">
          <Group
            title="Facturas"
            lines={bills}
            emptyLabel="Todavía no has descrito ninguna factura."
            progressByCategory={progressByCategory}
            currencyCode={currencyCode}
            isBusy={isBusy}
            onEdit={onEdit}
            onDelete={onDelete}
          />
          <Group
            title="Gastos variables"
            lines={variables}
            emptyLabel="Todavía no has descrito ningún gasto variable."
            progressByCategory={progressByCategory}
            currencyCode={currencyCode}
            isBusy={isBusy}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      )}
    </section>
  )
}

interface GroupProps {
  title: string
  lines: PlanLineItem[]
  emptyLabel: string
  progressByCategory: Record<string, BudgetProgress>
  currencyCode: string
  isBusy?: boolean
  onEdit: (lineId: string) => void
  onDelete: (lineId: string) => void
}

function Group({
  title,
  lines,
  emptyLabel,
  progressByCategory,
  currencyCode,
  isBusy,
  onEdit,
  onDelete,
}: GroupProps) {
  const titleId = useId()

  return (
    <div>
      <h3 id={titleId} className="text-sm font-semibold text-foreground">
        {title}
      </h3>

      {lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul aria-labelledby={titleId} className="mt-2 flex flex-col gap-2">
          {lines.map((line) => {
            const progress = progressByCategory[line.categoryId]
            const tone = progress ? budgetStatusTone[progress.status] : 'neutral'

            return (
              <li
                key={line.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    <span className="truncate">{line.name}</span>
                    {line.isCategoryArchived && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                        Archivada
                      </span>
                    )}
                  </p>

                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{line.categoryName}</span>
                    {line.dueDate && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="size-3" aria-hidden="true" />
                        {formatShortDate(line.dueDate)}
                      </span>
                    )}
                  </p>

                  {/* Presupuesto y gasto, solo lectura: los dos vienen de
                      `/budgets` y de `transactions`, no de la línea. */}
                  <p className="mt-1 text-xs">
                    <span className="text-muted-foreground">
                      {progress?.budgetMinor === null || progress === undefined
                        ? 'Sin presupuesto este mes'
                        : `Presupuesto ${formatAmount(progress.budgetMinor, currencyCode)}`}
                      {' · '}
                      Gastado {formatAmount(progress?.spentMinor ?? 0, currencyCode)}
                    </span>{' '}
                    <span className={cn('font-medium', TONE_STYLES[tone])}>
                      {progress ? budgetStatusLabel[progress.status] : budgetStatusLabel.unbudgeted}
                    </span>
                  </p>

                  <Link
                    to="/budgets"
                    className="mt-1 inline-block text-xs font-medium text-primary underline underline-offset-4"
                  >
                    Editar presupuesto
                  </Link>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => onEdit(line.id)}
                    disabled={isBusy}
                    aria-label={`Editar ${line.name}`}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => onDelete(line.id)}
                    disabled={isBusy}
                    aria-label={`Eliminar ${line.name}`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
