import { Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { BudgetProgressBar } from '@/features/budgets/components/budget-progress-bar'
import type { BudgetProgress } from '@/features/budgets/progress'

/** Una categoría de gasto del mes con su progreso ya resuelto. */
export interface BudgetCategoryItem {
  categoryId: string
  categoryName: string
  isArchived: boolean
  progress: BudgetProgress
}

interface BudgetCategoryGridProps {
  /** Solo categorías con presupuesto en el mes (ver `hasBudgetThisMonth` en `summary`). */
  items: BudgetCategoryItem[]
  /** Moneda de los presupuestos (la de presentación), no la de la vista. */
  currencyCode: string
  onEdit: (item: BudgetCategoryItem) => void
  isSubmitting?: boolean
}

/**
 * Categorías con presupuesto en el mes, cada una con su barra.
 *
 * Las que no tienen presupuesto no ocupan tarjeta: veinte celdas con «Sin
 * límite» tapaban las tres que importan. Se añaden desde «Agregar presupuesto».
 *
 * Editar abre `BudgetForm` en un diálogo, porque un campo suelto no puede decidir
 * entre versionar la plantilla y fijar la excepción de un mes. El botón va aparte
 * y no envuelve la celda: la barra son párrafos, y un párrafo dentro de un
 * `button` es HTML inválido.
 */
export function BudgetCategoryGrid({
  items,
  currencyCode,
  onEdit,
  isSubmitting,
}: BudgetCategoryGridProps) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {items.map((item) => (
        <li
          key={item.categoryId}
          className="flex flex-col gap-2 rounded-xl border border-border bg-surface-elevated p-3"
        >
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {item.categoryName}
            </span>
            {item.isArchived && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Archivada
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              disabled={isSubmitting}
              onClick={() => onEdit(item)}
              aria-label={`Editar presupuesto de ${item.categoryName}`}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </Button>
          </div>

          <BudgetProgressBar
            progress={item.progress}
            categoryName={item.categoryName}
            currencyCode={currencyCode}
          />
        </li>
      ))}
    </ul>
  )
}
