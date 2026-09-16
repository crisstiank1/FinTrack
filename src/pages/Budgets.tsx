import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccounts } from '@/features/accounts/hooks'
import { BudgetAlerts, type BudgetAlertItem } from '@/features/budgets/components/budget-alerts'
import { BudgetForm } from '@/features/budgets/components/budget-form'
import { BudgetList, type BudgetListItem } from '@/features/budgets/components/budget-list'
import { selectBudgetCategories } from '@/features/budgets/categories'
import { BudgetError } from '@/features/budgets/errors'
import {
  useBudgetProgress,
  useBudgets,
  useDeleteBudget,
  useSaveBudget,
} from '@/features/budgets/hooks'
import { excludedExpensesNote } from '@/features/budgets/labels'
import { useCategories } from '@/features/categories/hooks'
import { usePrimaryCurrency } from '@/features/profile/hooks'
import { useMonthParam } from '@/hooks/use-month-param'
import { resolvePresentationCurrency } from '@/lib/currency'
import { currentMonthKey, formatMonthLabel, shiftMonthKey } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

export default function Budgets() {
  // El mes vive en la URL y no en el estado del componente porque las alertas
  // del dashboard enlazan a /budgets?month=YYYY-MM: sin eso, el enlace llevaría
  // siempre al mes actual y perdería la razón por la que se pulsó.
  const [monthKey, setMonthKey] = useMonthParam()
  const [editingCategory, setEditingCategory] = useState<Tables<'categories'> | null>(null)

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [], isPending: categoriesPending } = useCategories()
  const primaryCurrency = usePrimaryCurrency()
  const budgetsQuery = useBudgets()
  const saveBudget = useSaveBudget()
  const deleteBudget = useDeleteBudget()

  const budgets = useMemo(() => budgetsQuery.data ?? [], [budgetsQuery.data])

  const visibleCategories = useMemo(
    () => selectBudgetCategories(categories, budgets, monthKey),
    [categories, budgets, monthKey],
  )

  const categoryIds = useMemo(
    () => visibleCategories.map((category) => category.id),
    [visibleCategories],
  )

  // FinTrack no convierte divisas: los importes de un presupuesto no guardan
  // moneda y se entienden en la de presentación (la principal si hay alguna
  // cuenta en ella; si no, la de la primera cuenta), la misma del Plan. Mientras
  // la moneda principal carga, el progreso espera.
  const currencyCode = resolvePresentationCurrency(primaryCurrency.data, accounts)

  const progressQuery = useBudgetProgress({
    monthKey,
    categoryIds,
    currencyCode: primaryCurrency.isPending ? undefined : currencyCode,
  })
  const excludedNote = progressQuery.exclusions
    ? excludedExpensesNote(progressQuery.exclusions)
    : null
  const monthLabel = formatMonthLabel(monthKey)
  const isPastMonth = monthKey < currentMonthKey()

  const items = useMemo<BudgetListItem[]>(() => {
    const progressById = new Map(
      (progressQuery.data ?? []).map((entry) => [entry.categoryId, entry]),
    )

    return visibleCategories.flatMap((category) => {
      const progress = progressById.get(category.id)
      if (!progress) return []

      return [
        {
          category,
          progress,
          versions: budgets.filter((budget) => budget.category_id === category.id),
        },
      ]
    })
  }, [visibleCategories, progressQuery.data, budgets])

  const alertItems = useMemo<BudgetAlertItem[]>(
    () =>
      items.map((item) => ({
        categoryId: item.category.id,
        categoryName: item.category.name,
        isArchived: item.category.is_archived,
        progress: item.progress,
      })),
    [items],
  )

  function reportError(error: unknown, fallback: string) {
    if (error instanceof BudgetError && error.code === 'conflict') {
      // La lista ya se refrescó sola; no se reintenta ni se sobrescribe nada.
      toast.error('El presupuesto cambió en otra sesión', { description: error.message })
      return
    }

    toast.error(fallback, {
      description: error instanceof Error ? error.message : undefined,
    })
  }

  async function handleSave({
    amountMinor,
    scope,
  }: {
    amountMinor: number
    scope: 'template' | 'exception'
  }) {
    if (!editingCategory) return

    try {
      await saveBudget.mutateAsync({
        amountMinor,
        intent: { kind: scope, categoryId: editingCategory.id, monthKey },
      })
      toast.success('Presupuesto guardado')
      setEditingCategory(null)
    } catch (error) {
      reportError(error, 'No se pudo guardar el presupuesto')
    }
  }

  async function handleCorrect(budgetId: string, amountMinor: number) {
    try {
      await saveBudget.mutateAsync({ amountMinor, intent: { kind: 'correction', budgetId } })
      toast.success('Monto corregido')
    } catch (error) {
      reportError(error, 'No se pudo corregir el monto')
    }
  }

  async function handleDelete(budgetId: string) {
    try {
      await deleteBudget.mutateAsync(budgetId)
      toast.success('Versión eliminada')
    } catch (error) {
      reportError(error, 'No se pudo eliminar la versión')
    }
  }

  const isLoading = categoriesPending || budgetsQuery.isPending || progressQuery.isPending

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Presupuestos</h1>
          <p className="mt-0.5 text-sm text-muted-foreground first-letter:uppercase">
            {monthLabel}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}
            aria-label={`Mes anterior: ${formatMonthLabel(shiftMonthKey(monthKey, -1))}`}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>

          {/* Sin tope superior, a diferencia del dashboard: presupuestar un mes
              futuro es justo lo que permite el modelo de plantillas. */}
          <input
            type="month"
            aria-label="Mes"
            value={monthKey}
            onChange={(event) => event.target.value && setMonthKey(event.target.value)}
            className="h-8 rounded-md bg-transparent px-2 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}
            aria-label={`Mes siguiente: ${formatMonthLabel(shiftMonthKey(monthKey, 1))}`}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {isPastMonth && (
        <p className="mt-4 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          {monthLabel} ya está cerrado. Puedes ajustarlo solo con una excepción de ese mes o
          corrigiendo una versión desde el historial.
        </p>
      )}

      {budgetsQuery.isError && (
        <div role="alert" className="mt-6 rounded-xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-foreground">No pudimos cargar tus presupuestos.</p>
          <Button type="button" className="mt-4" onClick={() => void budgetsQuery.refetch()}>
            Reintentar
          </Button>
        </div>
      )}

      {!budgetsQuery.isError && isLoading && (
        <p className="mt-8 text-sm text-muted-foreground">Cargando presupuestos...</p>
      )}

      {!budgetsQuery.isError && !isLoading && items.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">
            No hay categorías de gasto que presupuestar en {monthLabel}.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea una categoría de gasto para empezar a repartir tu dinero.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/settings">Ir a categorías</Link>
          </Button>
        </div>
      )}

      {!budgetsQuery.isError && !isLoading && items.length > 0 && (
        <div className="mt-6 flex flex-col gap-6">
          {excludedNote && (
            <p
              role="note"
              className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground"
            >
              {excludedNote}
            </p>
          )}

          <BudgetAlerts items={alertItems} globalAlert={null} currencyCode={currencyCode} />

          <BudgetList
            items={items}
            currencyCode={currencyCode}
            onEdit={setEditingCategory}
            onCorrect={handleCorrect}
            onDelete={handleDelete}
            isSubmitting={saveBudget.isPending}
          />
        </div>
      )}

      <Dialog
        open={editingCategory !== null}
        onOpenChange={(open) => !open && setEditingCategory(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Presupuesto de {editingCategory?.name}</DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <BudgetForm
              monthKey={monthKey}
              allowTemplate={!isPastMonth}
              isSubmitting={saveBudget.isPending}
              onSubmit={handleSave}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
