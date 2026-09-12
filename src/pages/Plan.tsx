import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAccounts } from '@/features/accounts/hooks'
import { calculateDiff } from '@/features/plan/calculations/diff'
import { calculateRemaining } from '@/features/plan/calculations/remaining'
import {
  sumBudgetsForCategories,
  sumEffectiveCategoryBudgets,
  sumPlannedIncome,
  sumPlannedLineAmounts,
  summarizeAllocation,
} from '@/features/plan/calculations/reconciliation'
import {
  BudgetVsActualTable,
  type PlanComparisonGroup,
  type PlanComparisonRow,
} from '@/features/plan/components/budget-vs-actual-table'
import { PlanHeader } from '@/features/plan/components/plan-header'
import { PlanSummary } from '@/features/plan/components/plan-summary'
import {
  useCategoryClassifications,
  useEffectiveCategoryBudgets,
  usePlanActuals,
  usePlanIncomeSources,
  usePlanLines,
  usePlanMonth,
} from '@/features/plan/hooks'
import { planRowDiffKind, type PlanRowId } from '@/features/plan/labels'
import {
  partitionPlanLines,
  planLineCategoryIds,
  toPlannedIncomeSources,
  toPlannedLineAmounts,
} from '@/features/plan/read-model'
import { currentMonthKey, formatMonthLabel } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

/**
 * Plan mensual, primera entrega: resumen del mes y cuadro Presupuesto vs.
 * Actual, **solo lectura**.
 *
 * El único control de datos de la pantalla es el selector de mes. Ningún valor
 * «Actual» es editable en ninguna parte, porque ninguno se guarda: todos se
 * calculan desde `transactions` (docs/09-plan-mensual.md).
 *
 * Esta página **ensambla**, no calcula: cada cifra sale de una función ya
 * publicada en `calculations/`, de `read-model.ts` o de los hooks de lectura.
 * Lo único que decide aquí es de qué conjunto sale cada plan, y cuándo ese
 * conjunto está vacío —que es distinto de valer cero—.
 */

/** Colección vacía con identidad estable, para no invalidar los `useMemo`. */
const NO_INCOME_SOURCES: Tables<'plan_income_sources'>[] = []

/**
 * Plan de un grupo de categorías.
 *
 * `null` cuando ninguna de ellas tiene presupuesto efectivo este mes: no hay
 * con qué comparar, y decirlo con un 0 fingiría un objetivo que nadie fijó. Un
 * 0 solo aparece si el usuario lo declaró, y entonces llega en el mapa.
 */
function plannedForCategories(
  budgetsByCategory: Record<string, number>,
  categoryIds: string[],
): number | null {
  const budgeted = categoryIds.filter((categoryId) => budgetsByCategory[categoryId] !== undefined)
  if (budgeted.length === 0) return null

  return sumBudgetsForCategories(budgetsByCategory, budgeted)
}

/** Suma dos planes que pueden no existir. Solo es `null` si falta cada uno. */
function addPlanned(first: number | null, second: number | null): number | null {
  if (first === null && second === null) return null
  return (first ?? 0) + (second ?? 0)
}

function comparisonRow(
  id: PlanRowId,
  plannedMinor: number | null,
  actualMinor: number,
  isSubtotal = false,
): PlanComparisonRow {
  return {
    id,
    plannedMinor,
    actualMinor,
    diff: calculateDiff(actualMinor, plannedMinor, planRowDiffKind[id]),
    isSubtotal,
  }
}

function PlanSkeleton() {
  return (
    <div className="mt-8 animate-pulse" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-32 rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <div className="mt-8 h-96 rounded-xl border border-border bg-card" />
    </div>
  )
}

export default function Plan() {
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const queryClient = useQueryClient()

  const { data: accounts = [] } = useAccounts()

  const planMonthQuery = usePlanMonth(monthKey)
  const planMonthId = planMonthQuery.data?.id

  const linesQuery = usePlanLines(monthKey)
  const classificationsQuery = useCategoryClassifications()
  const budgetsQuery = useEffectiveCategoryBudgets(monthKey)
  const actualsQuery = usePlanActuals({ monthKey, planMonthId })
  const incomeSourcesQuery = usePlanIncomeSources(planMonthId)

  // Sin `plan_month_id` la consulta de fuentes queda deshabilitada, y una
  // consulta deshabilitada se queda en `pending` para siempre. Un mes sin plan
  // no tiene fuentes, así que aquí eso se traduce a la lista vacía: sin esta
  // traducción la pantalla cargaría indefinidamente.
  const incomeSources = planMonthId ? incomeSourcesQuery.data : NO_INCOME_SOURCES
  const incomeSourcesPending = planMonthId ? incomeSourcesQuery.isPending : false
  const incomeSourcesError = planMonthId ? incomeSourcesQuery.isError : false

  // El MVP no convierte divisas: se usa la moneda de la primera cuenta como
  // moneda de presentación, mismo criterio que el dashboard y /budgets.
  const currencyCode = accounts[0]?.currency_code ?? 'COP'
  const monthLabel = formatMonthLabel(monthKey)

  const isPending =
    planMonthQuery.isPending ||
    linesQuery.isPending ||
    classificationsQuery.isPending ||
    budgetsQuery.isPending ||
    actualsQuery.isPending ||
    incomeSourcesPending

  const isError =
    planMonthQuery.isError ||
    linesQuery.isError ||
    classificationsQuery.isError ||
    budgetsQuery.isError ||
    actualsQuery.isError ||
    incomeSourcesError

  const actuals = actualsQuery.data
  const budgetsByCategory = budgetsQuery.data
  const lines = linesQuery.data
  const classifications = classificationsQuery.data

  const model = useMemo(() => {
    if (!actuals || !budgetsByCategory || !lines || !classifications || !incomeSources) {
      return undefined
    }

    const partition = partitionPlanLines(lines)
    const debtCategoryIds = classifications
      .filter((classification) => classification.budget_group === 'debt')
      .map((classification) => classification.category_id)

    // Un conjunto vacío no es un plan de cero: es la ausencia de plan.
    const incomePlannedMinor =
      incomeSources.length === 0 ? null : sumPlannedIncome(toPlannedIncomeSources(incomeSources))
    const billsPlannedMinor = plannedForCategories(
      budgetsByCategory,
      planLineCategoryIds(partition.bills),
    )
    const variablesPlannedMinor = plannedForCategories(
      budgetsByCategory,
      planLineCategoryIds(partition.variables),
    )
    const debtPlannedMinor = plannedForCategories(budgetsByCategory, debtCategoryIds)
    const savingsPlannedMinor =
      partition.savings.length === 0
        ? null
        : sumPlannedLineAmounts(toPlannedLineAmounts(partition.savings))
    const investmentPlannedMinor =
      partition.investments.length === 0
        ? null
        : sumPlannedLineAmounts(toPlannedLineAmounts(partition.investments))

    const allocation = summarizeAllocation(
      incomePlannedMinor ?? 0,
      sumEffectiveCategoryBudgets(budgetsByCategory),
      savingsPlannedMinor ?? 0,
      investmentPlannedMinor ?? 0,
    )

    // Sin ingreso planeado no hay sobreasignación que declarar: los
    // presupuestos de /budgets existen al margen del plan del mes, y restarlos
    // de un ingreso inexistente daría un negativo que no significa nada.
    const unassignedMinor = incomePlannedMinor === null ? null : allocation.unassignedMinor

    const remaining = calculateRemaining(
      actuals.incomeActualMinor,
      actuals.expenseActualMinor,
      actuals.savingsContributionsMinor,
      actuals.investmentContributionsMinor,
      allocation.unassignedMinor,
    )

    const groups: PlanComparisonGroup[] = [
      {
        id: 'income',
        rows: [comparisonRow('income', incomePlannedMinor, actuals.incomeActualMinor)],
      },
      {
        id: 'breakdown',
        rows: [
          comparisonRow(
            'expensesTotal',
            addPlanned(billsPlannedMinor, variablesPlannedMinor),
            actuals.expenseActualMinor,
            true,
          ),
          comparisonRow('bills', billsPlannedMinor, actuals.byLine.billsMinor),
          comparisonRow('variables', variablesPlannedMinor, actuals.byLine.variablesMinor),
          // Un gasto sin línea que lo describa no tiene presupuesto propio: su
          // plan es nulo por definición, no cero.
          comparisonRow('unplanned', null, actuals.byLine.unplannedMinor),
        ],
      },
      {
        id: 'indicators',
        rows: [
          comparisonRow('savings', savingsPlannedMinor, actuals.savingsContributionsMinor),
          comparisonRow('investment', investmentPlannedMinor, actuals.investmentContributionsMinor),
          comparisonRow('debt', debtPlannedMinor, actuals.byGroup.debtMinor),
          // `restantePlaneado` y `porAsignar` son el mismo número
          // (docs/09-plan-mensual.md): una sola cifra, un solo nombre.
          comparisonRow('remaining', unassignedMinor, remaining.restanteActual),
        ],
      },
    ]

    return {
      groups,
      summary: {
        incomeActualMinor: actuals.incomeActualMinor,
        incomePlannedMinor,
        expenseActualMinor: actuals.expenseActualMinor,
        expensePlannedMinor: addPlanned(billsPlannedMinor, variablesPlannedMinor),
        assignedMinor: allocation.assignedMinor,
        unassignedMinor,
        remainingActualMinor: remaining.restanteActual,
        remainingPlannedMinor: unassignedMinor,
        savingsContributionsMinor: actuals.savingsContributionsMinor,
        savingsPlannedMinor,
      },
      hasMovements:
        actuals.incomeActualMinor > 0 ||
        actuals.expenseActualMinor > 0 ||
        actuals.savingsContributionsMinor > 0 ||
        actuals.investmentContributionsMinor > 0,
    }
  }, [actuals, budgetsByCategory, lines, classifications, incomeSources])

  const hasPlan = Boolean(planMonthQuery.data)

  function handleRetry() {
    // Invalidar por prefijo alcanza todas las consultas que cuelgan de esas
    // raíces, incluidas las del mes en pantalla.
    queryClient.invalidateQueries({ queryKey: ['plan'] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['category-classifications'] })
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PlanHeader monthKey={monthKey} onMonthChange={setMonthKey} currencyCode={currencyCode} />

      {isError && (
        <div
          role="alert"
          className="mt-8 flex flex-col items-center rounded-2xl border border-border bg-card p-10 text-center"
        >
          <h2 className="text-lg font-semibold text-foreground">No pudimos cargar tu plan</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Revisa tu conexión e inténtalo de nuevo. Tus datos no se han perdido.
          </p>
          <Button type="button" className="mt-5" onClick={handleRetry}>
            Reintentar
          </Button>
        </div>
      )}

      {!isError && isPending && (
        <>
          <p role="status" className="sr-only">
            Cargando el plan de {monthLabel}
          </p>
          <PlanSkeleton />
        </>
      )}

      {!isError && !isPending && model && (
        <>
          {/* Un mes sin plan no es un error, así que no se anuncia como tal: es
              un estado normal, y las cifras reales se siguen mostrando. */}
          {!hasPlan && model.hasMovements && (
            <p className="mt-6 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground first-letter:uppercase">
              {monthLabel} todavía no tiene plan. Las cifras reales del mes se calculan igual;
              cuando lo planifiques podrás compararlas.
            </p>
          )}

          {!hasPlan && !model.hasMovements ? (
            <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <h2 className="text-lg font-semibold text-foreground first-letter:uppercase">
                {monthLabel} todavía no tiene nada que comparar
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Aquí verás tu mes planeado frente a lo que realmente ocurrió. Empieza registrando un
                movimiento.
              </p>
              <Button asChild variant="outline" className="mt-5">
                <Link to="/transactions">Registrar movimiento</Link>
              </Button>
            </div>
          ) : (
            <>
              <PlanSummary currencyCode={currencyCode} {...model.summary} />
              <BudgetVsActualTable
                groups={model.groups}
                currencyCode={currencyCode}
                monthLabel={monthLabel}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
