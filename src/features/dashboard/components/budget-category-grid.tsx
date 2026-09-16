import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BudgetProgressBar } from '@/features/budgets/components/budget-progress-bar'
import type { BudgetProgress } from '@/features/budgets/progress'
import {
  budgetAmountSchema,
  budgetScopeOptions,
  ZERO_BUDGET_WARNING,
} from '@/features/budgets/schemas'
import { formatMonthLabel } from '@/lib/dates'

/** Una categoría de gasto del mes con su progreso ya resuelto. */
export interface BudgetCategoryItem {
  categoryId: string
  categoryName: string
  isArchived: boolean
  progress: BudgetProgress
}

export type BudgetScope = (typeof budgetScopeOptions)[number]['value']

interface BudgetCategoryGridProps {
  items: BudgetCategoryItem[]
  /** Moneda de los presupuestos (la de presentación), no la de la vista. */
  currencyCode: string
  monthKey: string
  /**
   * `false` en un mes ya cerrado: versionar la plantilla hacia atrás reescribiría
   * meses pasados, así que ahí solo cabe la excepción.
   */
  allowTemplate: boolean
  onSave: (
    item: BudgetCategoryItem,
    values: { amount: number; scope: BudgetScope },
  ) => Promise<void> | void
  isSubmitting?: boolean
}

/**
 * Todas las categorías de gasto del mes, cada una con su barra y su importe
 * editable en la propia celda.
 *
 * Se listan también las que no tienen presupuesto: son justo las que hay que
 * poder definir, y esconderlas dejaba el reparto a medias sin decirlo.
 *
 * El importe se escribe en la celda, pero **el alcance se sigue eligiendo**: al
 * tocar un campo aparecen «Desde este mes en adelante» y «Solo este mes», que es
 * la distinción real del modelo de presupuestos. Un campo suelto que guardara
 * solo un número decidiría por el usuario cuál de las dos cosas quiso.
 *
 * La validación del importe es `budgetAmountSchema`, la misma de `/budgets`: lo
 * que cambia aquí es dónde se escribe, no qué se acepta.
 */
export function BudgetCategoryGrid({
  items,
  currencyCode,
  monthKey,
  allowTemplate,
  onSave,
  isSubmitting,
}: BudgetCategoryGridProps) {
  // Solo una celda abierta a la vez: dos formularios abiertos invitan a escribir
  // en uno y guardar el otro.
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState<BudgetScope>('template')
  const [error, setError] = useState<string | null>(null)

  const scopeOptions = allowTemplate
    ? budgetScopeOptions
    : budgetScopeOptions.filter((option) => option.value === 'exception')

  function open(item: BudgetCategoryItem) {
    if (activeId === item.categoryId) return

    setActiveId(item.categoryId)
    setDraft(item.progress.budgetMinor !== null ? String(item.progress.budgetMinor) : '')
    setScope(allowTemplate ? 'template' : 'exception')
    setError(null)
  }

  function close() {
    setActiveId(null)
    setDraft('')
    setError(null)
  }

  function valueFor(item: BudgetCategoryItem) {
    if (activeId === item.categoryId) return draft
    return item.progress.budgetMinor !== null ? String(item.progress.budgetMinor) : ''
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>, item: BudgetCategoryItem) {
    event.preventDefault()

    const parsed = budgetAmountSchema.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Ingresa un monto válido, solo números')
      return
    }

    await onSave(item, { amount: parsed.data, scope })
    close()
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {items.map((item) => {
        const isActive = activeId === item.categoryId
        const inputId = `budget-${item.categoryId}`

        return (
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
            </div>

            <BudgetProgressBar
              progress={item.progress}
              categoryName={item.categoryName}
              currencyCode={currencyCode}
            />

            <form className="flex flex-col gap-2" onSubmit={(event) => handleSubmit(event, item)}>
              {/* El rótulo va oculto: el nombre de la categoría ya está arriba y
                  repetirlo en cada celda llenaría la rejilla de texto. */}
              <Label htmlFor={inputId} className="sr-only">
                Presupuesto de {item.categoryName}
              </Label>
              <Input
                id={inputId}
                inputMode="numeric"
                autoComplete="off"
                placeholder="Sin límite"
                className="h-8"
                value={valueFor(item)}
                aria-invalid={isActive && !!error}
                onFocus={() => open(item)}
                onChange={(event) => {
                  open(item)
                  setDraft(event.target.value)
                  setError(null)
                }}
              />

              {isActive && (
                <>
                  {error && <p className="text-xs text-destructive">{error}</p>}
                  {!error && draft.trim() === '0' && (
                    <p className="text-xs text-warning">{ZERO_BUDGET_WARNING}</p>
                  )}

                  <fieldset className="flex flex-col gap-1">
                    <legend className="sr-only">Aplicar</legend>

                    {!allowTemplate && (
                      <p className="text-xs text-muted-foreground first-letter:uppercase">
                        {formatMonthLabel(monthKey)} ya pasó: solo puedes ajustar ese mes.
                      </p>
                    )}

                    {scopeOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <input
                          type="radio"
                          name={`scope-${item.categoryId}`}
                          value={option.value}
                          className="accent-primary"
                          checked={scope === option.value}
                          onChange={() => setScope(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </fieldset>

                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" disabled={isSubmitting}>
                      Guardar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={close}>
                      Cancelar
                    </Button>
                  </div>
                </>
              )}
            </form>
          </li>
        )
      })}
    </ul>
  )
}
