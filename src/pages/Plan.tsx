import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccounts } from '@/features/accounts/hooks'
import {
  categoryClassificationsQueryKey,
  useCategoryClassifications,
} from '@/features/categories/classifications/hooks'
import { useCategories } from '@/features/categories/hooks'
import {
  ALLOCATION_GROUPS,
  resolveAllocation,
  type AllocationGroup,
} from '@/features/plan/calculations/allocation'
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
  AllocationBreakdown,
  type AllocationRow,
} from '@/features/plan/components/allocation-breakdown'
import {
  AllocationForm,
  type AllocationFormSubmit,
} from '@/features/plan/components/allocation-form'
import {
  BudgetVsActualTable,
  type PlanComparisonGroup,
  type PlanComparisonRow,
} from '@/features/plan/components/budget-vs-actual-table'
import {
  IncomeSourceForm,
  type IncomeSourceFormSubmit,
} from '@/features/plan/components/income-source-form'
import {
  IncomeSourcesPanel,
  type IncomeSourceItem,
} from '@/features/plan/components/income-sources-panel'
import { PlanLineForm, type PlanLineFormSubmit } from '@/features/plan/components/plan-line-form'
import { PlanLinesPanel, type PlanLineItem } from '@/features/plan/components/plan-lines-panel'
import { PlanHeader } from '@/features/plan/components/plan-header'
import { PlanSummary } from '@/features/plan/components/plan-summary'
import type { BudgetProgress } from '@/features/budgets/progress'
import { PlanError } from '@/features/plan/errors'
import {
  useCreatePlanMonth,
  useDeleteIncomeSource,
  useEffectiveCategoryBudgets,
  usePlanActuals,
  usePlanAllocations,
  usePlanIncomeSourceCategories,
  usePlanIncomeSources,
  usePlanLines,
  usePlanLineProgress,
  usePlanMonth,
  useDeletePlanLine,
  useSaveAllocations,
  useSaveIncomeSource,
  useSavePlanLine,
} from '@/features/plan/hooks'
import { allocationGroupDiffKind, planRowDiffKind, type PlanRowId } from '@/features/plan/labels'
import {
  categoriesLinkedElsewhere,
  categoriesOfSource,
  selectAvailableLineCategories,
  selectLinkableIncomeCategories,
  usedLineCategoryIds,
  type CategoryLineKind,
} from '@/features/plan/mutations'
import {
  buildAllocationPercentages,
  partitionPlanLines,
  planLineCategoryIds,
  toPlannedIncomeSources,
  toPlannedLineAmounts,
} from '@/features/plan/read-model'
import { formatAmount } from '@/lib/currency'
import { currentMonthKey, formatMonthLabel } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

/**
 * Plan mensual: resumen del mes, cuadro Presupuesto vs. Actual, fuentes de
 * ingreso y reparto 50/30/20.
 *
 * Lo editable es **solo lo planeado**: las fuentes de ingreso y los cinco
 * porcentajes del reparto. Ningún valor «Actual» es editable en ninguna parte,
 * porque ninguno se guarda: todos se calculan desde `transactions`
 * (docs/09-plan-mensual.md).
 *
 * Esta página **ensambla**, no calcula: cada cifra sale de una función ya
 * publicada en `calculations/`, de `read-model.ts` o de los hooks de lectura.
 * Lo único que decide aquí es de qué conjunto sale cada plan, y cuándo ese
 * conjunto está vacío —que es distinto de valer cero—.
 */

/* Colecciones vacías con identidad estable, para no invalidar los `useMemo`. */
const NO_INCOME_SOURCES: Tables<'plan_income_sources'>[] = []
const NO_ALLOCATIONS: Tables<'plan_allocations'>[] = []
const NO_LINKS: Tables<'plan_income_source_categories'>[] = []
const NO_PLAN_LINES: Tables<'plan_lines'>[] = []

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

/**
 * Línea tal como la pinta el panel, con su categoría ya resuelta.
 *
 * Una categoría que ya no esté visible deja la fila con su nombre en blanco en
 * vez de romper: la clave foránea `on delete no action` hace que ese caso no
 * pueda darse con datos válidos, pero la fila no debe depender de ello.
 */
function toLineItem(
  line: Tables<'plan_lines'>,
  kind: CategoryLineKind,
  categoryById: Map<string, Tables<'categories'>>,
): PlanLineItem {
  const category = line.category_id ? categoryById.get(line.category_id) : undefined

  return {
    id: line.id,
    name: line.name,
    kind,
    categoryId: line.category_id ?? '',
    categoryName: category?.name ?? 'Categoría no disponible',
    isCategoryArchived: category?.is_archived ?? false,
    dueDate: line.due_date,
  }
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
  // `null` = ninguno abierto; `'new'` = alta; un id = edicion de esa fuente.
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null)
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null)
  const [isAllocationOpen, setIsAllocationOpen] = useState(false)
  // `null` = ninguno abierto; `'new'` = alta; un id = edicion de esa linea.
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()

  const planMonthQuery = usePlanMonth(monthKey)
  const planMonthId = planMonthQuery.data?.id

  const linesQuery = usePlanLines(monthKey)
  const classificationsQuery = useCategoryClassifications()
  const budgetsQuery = useEffectiveCategoryBudgets(monthKey)
  const actualsQuery = usePlanActuals({ monthKey, planMonthId })
  const incomeSourcesQuery = usePlanIncomeSources(planMonthId)
  const allocationsQuery = usePlanAllocations(planMonthId)
  const incomeSourceCategoriesQuery = usePlanIncomeSourceCategories(planMonthId)

  const createPlanMonth = useCreatePlanMonth()
  const saveIncomeSource = useSaveIncomeSource()
  const deleteIncomeSource = useDeleteIncomeSource()
  const saveAllocations = useSaveAllocations()
  const savePlanLine = useSavePlanLine()
  const deletePlanLine = useDeletePlanLine()

  // Sin `plan_month_id` la consulta de fuentes queda deshabilitada, y una
  // consulta deshabilitada se queda en `pending` para siempre. Un mes sin plan
  // no tiene fuentes, así que aquí eso se traduce a la lista vacía: sin esta
  // traducción la pantalla cargaría indefinidamente.
  const incomeSources = planMonthId ? incomeSourcesQuery.data : NO_INCOME_SOURCES
  const incomeSourcesPending = planMonthId ? incomeSourcesQuery.isPending : false
  const incomeSourcesError = planMonthId ? incomeSourcesQuery.isError : false

  const allocations = planMonthId ? allocationsQuery.data : NO_ALLOCATIONS
  const incomeSourceCategories = planMonthId ? incomeSourceCategoriesQuery.data : NO_LINKS
  const allocationsPending = planMonthId ? allocationsQuery.isPending : false
  const allocationsError = planMonthId ? allocationsQuery.isError : false

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
    incomeSourcesPending ||
    allocationsPending

  const isError =
    planMonthQuery.isError ||
    linesQuery.isError ||
    classificationsQuery.isError ||
    budgetsQuery.isError ||
    actualsQuery.isError ||
    incomeSourcesError ||
    allocationsError

  const actuals = actualsQuery.data
  const budgetsByCategory = budgetsQuery.data
  const lines = linesQuery.data
  const classifications = classificationsQuery.data

  const model = useMemo(() => {
    if (
      !actuals ||
      !budgetsByCategory ||
      !lines ||
      !classifications ||
      !incomeSources ||
      !allocations
    ) {
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

    // Reparto 50/30/20. Los porcentajes se estrechan en `read-model` y el
    // importe por grupo lo decide `resolveAllocation` por mayor resto: aquí no
    // se reparte nada a mano.
    const { percentages, ignoredGroups } = buildAllocationPercentages(allocations)
    const hasAllocation = Object.keys(percentages).length > 0
    const allocationAmounts =
      hasAllocation && incomePlannedMinor !== null
        ? resolveAllocation(incomePlannedMinor, percentages)
        : null

    // Lo real de cada grupo: gasto clasificado en necesidades, deseos y deuda;
    // aportes por transferencia en ahorro e inversión. Son dos orígenes
    // distintos a propósito, y ninguno se cruza con el otro.
    const actualByGroup: Record<AllocationGroup, number> = {
      needs: actuals.byGroup.needsMinor,
      wants: actuals.byGroup.wantsMinor,
      savings: actuals.savingsContributionsMinor,
      investment: actuals.investmentContributionsMinor,
      debt: actuals.byGroup.debtMinor,
    }

    const allocationRows: AllocationRow[] = ALLOCATION_GROUPS.map((group) => {
      const plannedMinor = allocationAmounts ? allocationAmounts[group] : null
      const actualMinor = actualByGroup[group]

      return {
        group,
        // Con reparto configurado, un grupo que no aparece tiene 0 puntos
        // base: al usuario no le tocó nada ahí, que es distinto de no haber
        // repartido todavía.
        percentBp: hasAllocation ? (percentages[group] ?? 0) : null,
        plannedMinor,
        actualMinor,
        diff: calculateDiff(actualMinor, plannedMinor, allocationGroupDiffKind[group]),
      }
    })

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
      allocation: {
        rows: allocationRows,
        hasAllocation,
        // La suma de los cinco grupos es exactamente el ingreso planeado
        // (docs/09-plan-mensual.md): se muestra ese mismo número, no otra suma.
        totalPlannedMinor: allocationAmounts ? incomePlannedMinor : null,
        unclassifiedMinor: actuals.byGroup.sinClasificarMinor,
        ignoredGroups,
      },
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
  }, [actuals, budgetsByCategory, lines, classifications, incomeSources, allocations])

  const hasPlan = Boolean(planMonthQuery.data)

  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories],
  )

  /**
   * Categoría completa por identificador. El mapa de arriba solo guarda
   * nombres; las líneas necesitan además saber si está archivada, que es lo que
   * distingue una referencia histórica de una corriente.
   */
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const sources = incomeSources ?? NO_INCOME_SOURCES
  const links = incomeSourceCategories ?? NO_LINKS

  /** Fuentes tal como las pinta el panel, con sus categorias ya resueltas. */
  const incomeSourceItems = useMemo<IncomeSourceItem[]>(
    () =>
      sources.map((source) => ({
        id: source.id,
        name: source.name,
        plannedMinor: source.planned_minor,
        categoryNames: categoriesOfSource(links, source.id).flatMap((categoryId) => {
          const name = categoriesById.get(categoryId)
          return name ? [name] : []
        }),
      })),
    [sources, links, categoriesById],
  )

  const editingSource =
    editingSourceId && editingSourceId !== 'new'
      ? sources.find((source) => source.id === editingSourceId)
      : undefined

  /**
   * Categorias que el formulario puede ofrecer: de ingreso, activas y libres
   * este mes. Las de la fuente que se esta editando no cuentan como ocupadas,
   * porque tienen que seguir marcadas y poder desmarcarse.
   */
  const linkableCategories = useMemo(
    () =>
      selectLinkableIncomeCategories(
        categories,
        categoriesLinkedElsewhere(links, editingSource?.id),
      ),
    [categories, links, editingSource],
  )

  const editingCategoryIds = useMemo(
    () => (editingSource ? categoriesOfSource(links, editingSource.id) : []),
    [links, editingSource],
  )

  /* ---------------------------------------------------------------------- */
  /* Líneas de facturas y gastos variables                                   */
  /* ---------------------------------------------------------------------- */

  const planLines = lines ?? NO_PLAN_LINES

  /**
   * Las dos listas que pinta el panel. Se reparten con `partitionPlanLines`,
   * la misma función que alimenta el desglose del cuadro, así que un `kind`
   * desconocido no acaba en ninguna de las dos en vez de colarse como factura.
   */
  const linePartition = useMemo(() => partitionPlanLines(planLines), [planLines])

  /**
   * Categorías descritas por una línea. `usePlanLineProgress` recibe esta
   * lista y devuelve, para cada una, el presupuesto efectivo y el gasto del
   * mes con las mismas funciones que usa `/budgets`.
   */
  const lineCategoryIds = useMemo(
    () => [
      ...planLineCategoryIds(linePartition.bills),
      ...planLineCategoryIds(linePartition.variables),
    ],
    [linePartition],
  )

  const lineProgressQuery = usePlanLineProgress({ monthKey, categoryIds: lineCategoryIds })

  /** Progreso por categoría, para que el panel no tenga que buscar en la lista. */
  const progressByCategory = useMemo(() => {
    const byCategory: Record<string, BudgetProgress> = {}
    for (const progress of lineProgressQuery.data ?? []) {
      byCategory[progress.categoryId] = progress
    }
    return byCategory
  }, [lineProgressQuery.data])

  const billItems = useMemo(
    () => linePartition.bills.map((line) => toLineItem(line, 'bill', categoryById)),
    [linePartition, categoryById],
  )
  const variableItems = useMemo(
    () => linePartition.variables.map((line) => toLineItem(line, 'variable', categoryById)),
    [linePartition, categoryById],
  )

  const editingLine =
    editingLineId && editingLineId !== 'new'
      ? planLines.find((line) => line.id === editingLineId)
      : undefined

  /**
   * Categorías que el formulario puede ofrecer: de gasto, activas y sin línea
   * este mes. Al editar no se ofrece ninguna, porque la categoría no cambia.
   */
  const availableLineCategories = useMemo(
    () => selectAvailableLineCategories(categories, usedLineCategoryIds(planLines)),
    [categories, planLines],
  )

  /** Presupuesto efectivo de una categoría, para la nota del formulario. */
  function budgetForCategory(categoryId: string): number | null {
    return budgetsByCategory?.[categoryId] ?? null
  }

  const hasAllocation = model?.allocation.hasAllocation ?? false

  /**
   * Reparto guardado, en puntos base, para abrir el formulario con lo que ya
   * hay. `undefined` cuando el mes no tiene reparto: entonces el formulario
   * usa su preset en vez de cinco ceros, que no son un punto de partida.
   */
  const savedPercentBp = useMemo(() => {
    if (!model || !hasAllocation) return undefined

    const saved: Record<string, number> = {}
    for (const row of model.allocation.rows) saved[row.group] = row.percentBp ?? 0
    return saved
  }, [model, hasAllocation])

  function reportPlanError(error: unknown, fallback: string) {
    const planError = error instanceof PlanError ? error : null
    toast.error(fallback, { description: planError?.message })
  }

  async function handleCreatePlanMonth() {
    try {
      await createPlanMonth.mutateAsync(monthKey)
      // El plan recien creado no tiene fuentes: el siguiente paso es evidente,
      // asi que se abre solo en lugar de dejar al usuario buscando el boton.
      setEditingSourceId('new')
    } catch (error) {
      reportPlanError(error, 'No se pudo crear el plan del mes')
    }
  }

  async function handleSaveIncomeSource(values: IncomeSourceFormSubmit) {
    if (!planMonthId) return

    try {
      await saveIncomeSource.mutateAsync({
        planMonthId,
        sourceId: editingSource?.id,
        name: values.name,
        plannedMinor: values.plannedMinor,
        categoryIds: values.categoryIds,
        currentCategoryIds: editingCategoryIds,
        sources,
      })
      toast.success(editingSource ? 'Fuente actualizada' : 'Fuente añadida')
      setEditingSourceId(null)
    } catch (error) {
      // El dialogo sigue abierto a proposito: parte de la escritura pudo
      // guardarse y la lista de abajo ya muestra el estado real.
      reportPlanError(error, 'No se pudo guardar la fuente de ingreso')
    }
  }

  async function handleDeleteIncomeSource(sourceId: string) {
    try {
      await deleteIncomeSource.mutateAsync(sourceId)
      toast.success('Fuente eliminada')
    } catch (error) {
      reportPlanError(error, 'No se pudo eliminar la fuente de ingreso')
    } finally {
      setDeletingSourceId(null)
    }
  }

  async function handleSaveAllocations(values: AllocationFormSubmit) {
    // Sin plan no hay a qué colgar las cinco filas. El botón ni siquiera se
    // pinta en ese caso; esto lo sostiene si alguna vez se pintara.
    if (!planMonthId) return

    try {
      await saveAllocations.mutateAsync({
        planMonthId,
        percentages: values.percentages,
        hasAllocation,
      })
      toast.success('Reparto guardado')
      setIsAllocationOpen(false)
    } catch (error) {
      // El diálogo sigue abierto: tras un conflicto, la pantalla de abajo ya se
      // está refrescando con el reparto que de verdad quedó guardado, y cerrar
      // aquí daría a entender que el envío salió bien.
      reportPlanError(error, 'No se pudo guardar el reparto')
    }
  }

  async function handleSavePlanLine(values: PlanLineFormSubmit) {
    if (!planMonthId) return

    try {
      await savePlanLine.mutateAsync({
        planMonthId,
        monthKey,
        lineId: editingLine?.id,
        kind: values.kind,
        name: values.name,
        categoryId: values.categoryId,
        dueDate: values.dueDate,
        lines: planLines,
      })
      toast.success(editingLine ? 'Línea actualizada' : 'Línea añadida')
      setEditingLineId(null)
    } catch (error) {
      // El diálogo sigue abierto: si la categoría se ocupó entre medias, el
      // usuario tiene que poder elegir otra sin volver a escribirlo todo.
      reportPlanError(error, 'No se pudo guardar la línea')
    }
  }

  async function handleDeletePlanLine(lineId: string) {
    try {
      await deletePlanLine.mutateAsync({ lineId, monthKey })
      toast.success('Línea eliminada')
    } catch (error) {
      reportPlanError(error, 'No se pudo eliminar la línea')
    } finally {
      setDeletingLineId(null)
    }
  }

  function handleRetry() {
    // Invalidar por prefijo alcanza todas las consultas que cuelgan de esas
    // raíces, incluidas las del mes en pantalla.
    //
    // La raíz de las clasificaciones se pide a su módulo dueño en vez de
    // escribirla aquí: el literal vive en un solo sitio, así que esta pantalla
    // no puede quedarse con una clave desfasada si aquel contrato cambia.
    queryClient.invalidateQueries({ queryKey: ['plan'] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: categoryClassificationsQueryKey.all })
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
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <p className="text-sm text-muted-foreground first-letter:uppercase">
                {monthLabel} todavía no tiene plan. Las cifras reales del mes se calculan igual;
                cuando lo planifiques podrás compararlas.
              </p>
              <Button
                type="button"
                onClick={handleCreatePlanMonth}
                disabled={createPlanMonth.isPending}
              >
                Crear plan de {monthLabel.split(' ')[0]}
              </Button>
            </div>
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
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  onClick={handleCreatePlanMonth}
                  disabled={createPlanMonth.isPending}
                >
                  Crear plan de {monthLabel.split(' ')[0]}
                </Button>
                <Button asChild variant="outline">
                  <Link to="/transactions">Registrar movimiento</Link>
                </Button>
              </div>
            </div>
          ) : (
            <>
              <PlanSummary currencyCode={currencyCode} {...model.summary} />
              {hasPlan && (
                <IncomeSourcesPanel
                  sources={incomeSourceItems}
                  totalPlannedMinor={model.summary.incomePlannedMinor}
                  currencyCode={currencyCode}
                  monthLabel={monthLabel}
                  isBusy={saveIncomeSource.isPending || deleteIncomeSource.isPending}
                  onAdd={() => setEditingSourceId('new')}
                  onEdit={setEditingSourceId}
                  onDelete={setDeletingSourceId}
                />
              )}
              <AllocationBreakdown
                {...model.allocation}
                currencyCode={currencyCode}
                monthLabel={monthLabel}
                onConfigure={hasPlan ? () => setIsAllocationOpen(true) : undefined}
                isBusy={saveAllocations.isPending}
              />

              {/* El enlace sale solo cuando hay gasto fuera de los grupos, y
                  lleva a Ajustes en vez de abrir un editor aquí: la
                  clasificación pertenece a la categoría y no al mes, así que
                  editarla bajo una cabecera que dice «septiembre 2026» daría a
                  entender que solo alcanza a septiembre. */}
              {model.allocation.unclassifiedMinor > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
                  <span>
                    Tienes {formatAmount(model.allocation.unclassifiedMinor, currencyCode)} sin
                    clasificar. El grupo de cada categoría se elige en Ajustes y vale para todos los
                    meses, no solo para este.
                  </span>
                  <Link
                    to="/settings"
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    Clasificar categorías
                  </Link>
                </p>
              )}
              {hasPlan && (
                <PlanLinesPanel
                  bills={billItems}
                  variables={variableItems}
                  progressByCategory={progressByCategory}
                  currencyCode={currencyCode}
                  monthLabel={monthLabel}
                  isBusy={savePlanLine.isPending || deletePlanLine.isPending}
                  onAdd={() => setEditingLineId('new')}
                  onEdit={setEditingLineId}
                  onDelete={setDeletingLineId}
                />
              )}

              <BudgetVsActualTable
                groups={model.groups}
                currencyCode={currencyCode}
                monthLabel={monthLabel}
              />
            </>
          )}
        </>
      )}

      <Dialog
        open={editingSourceId !== null}
        onOpenChange={(open) => !open && setEditingSourceId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSource ? `Editar ${editingSource.name}` : 'Nueva fuente de ingreso'}
            </DialogTitle>
          </DialogHeader>
          {editingSourceId !== null && (
            <IncomeSourceForm
              key={editingSourceId}
              categories={linkableCategories}
              defaultName={editingSource?.name}
              defaultPlannedMinor={editingSource?.planned_minor}
              defaultCategoryIds={editingCategoryIds}
              submitLabel={editingSource ? 'Guardar cambios' : 'Añadir fuente'}
              isSubmitting={saveIncomeSource.isPending}
              onSubmit={handleSaveIncomeSource}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isAllocationOpen} onOpenChange={setIsAllocationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasAllocation ? 'Editar reparto' : 'Configurar reparto'}</DialogTitle>
          </DialogHeader>
          {isAllocationOpen && model && (
            <AllocationForm
              defaultPercentBp={savedPercentBp}
              incomePlannedMinor={model.summary.incomePlannedMinor}
              currencyCode={currencyCode}
              submitLabel={hasAllocation ? 'Guardar cambios' : 'Guardar reparto'}
              isSubmitting={saveAllocations.isPending}
              onSubmit={handleSaveAllocations}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingLineId !== null}
        onOpenChange={(open) => !open && setEditingLineId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLine ? `Editar ${editingLine.name}` : 'Nueva línea'}</DialogTitle>
          </DialogHeader>
          {editingLineId !== null && (
            <PlanLineForm
              key={editingLineId}
              monthKey={monthKey}
              categories={editingLine ? [] : availableLineCategories}
              budgetForCategory={budgetForCategory}
              currencyCode={currencyCode}
              defaultValues={
                editingLine
                  ? {
                      name: editingLine.name,
                      kind: editingLine.kind as CategoryLineKind,
                      categoryId: editingLine.category_id ?? '',
                      dueDate: editingLine.due_date,
                    }
                  : undefined
              }
              lockedCategoryName={
                editingLine ? (categoriesById.get(editingLine.category_id ?? '') ?? '') : undefined
              }
              submitLabel={editingLine ? 'Guardar cambios' : 'Añadir línea'}
              isSubmitting={savePlanLine.isPending}
              onSubmit={handleSavePlanLine}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deletingLineId !== null}
        onOpenChange={(open) => !open && setDeletingLineId(null)}
        title="Eliminar línea"
        description="El gasto de su categoría volverá a contar como «No planeado». El presupuesto de la categoría y sus movimientos no se tocan."
        confirmLabel="Eliminar"
        onConfirm={() => deletingLineId && handleDeletePlanLine(deletingLineId)}
      />

      <ConfirmDialog
        open={deletingSourceId !== null}
        onOpenChange={(open) => !open && setDeletingSourceId(null)}
        title="Eliminar fuente de ingreso"
        description="Se eliminará la fuente y sus categorías vinculadas. Los movimientos registrados no se tocan."
        confirmLabel="Eliminar"
        onConfirm={() => deletingSourceId && handleDeleteIncomeSource(deletingSourceId)}
      />
    </div>
  )
}
