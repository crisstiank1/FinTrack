import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useAccounts } from '@/features/accounts/hooks'
import { useAuth } from '@/features/auth/auth-provider'
import { useBudgets } from '@/features/budgets/hooks'
import { buildBudgetProgressList, type BudgetProgress } from '@/features/budgets/progress'
import { resolveBudget } from '@/features/budgets/resolution'
import { useTransactions } from '@/features/transactions/hooks'
import { calculateMonthlyIncome } from '@/lib/calculations'

import {
  createPlanMonth,
  deletePlanIncomeSource,
  deletePlanIncomeSourceCategories,
  fetchCategoryClassifications,
  fetchPlanAllocations,
  fetchPlanIncomeSourceCategories,
  fetchPlanIncomeSources,
  fetchPlanLines,
  fetchPlanMonth,
  fetchTransactionsByAccounts,
  insertPlanAllocations,
  insertPlanIncomeSource,
  insertPlanIncomeSourceCategories,
  updatePlanIncomeSource,
  upsertPlanAllocations,
} from './api'
import {
  calculateBalanceForAccountType,
  sumTransferContributions,
} from './calculations/contributions'
import {
  groupExpensesByClassification,
  splitExpensesByPlanLine,
  sumActualExpenses,
  type ExpenseGroupBreakdown,
  type ExpenseLineBreakdown,
} from './calculations/expenses'
import { PlanError } from './errors'
import {
  buildAllocationRows,
  diffIncomeSourceCategories,
  nextIncomeSourcePosition,
  type AllocationPercentInput,
  type PositionedRow,
} from './mutations'
import {
  buildClassificationMap,
  buildIncomeActualBySource,
  buildTransferContributionCandidates,
  partitionPlanLines,
  planLineCategoryIds,
  toBalanceTransactions,
  toPlanExpenseTransactions,
  type IncomeActualBySource,
} from './read-model'

/**
 * Capa de consultas del Plan mensual.
 *
 * Dos clases de hook conviven aquí, y la diferencia importa:
 *
 * - **Consultas**: una por tabla, cacheadas por TanStack Query.
 * - **Derivaciones**: `useMemo` sobre datos ya obtenidos, siguiendo el patrón
 *   de `useBudgetProgress`. No se cachean como una segunda consulta, porque
 *   duplicarían en memoria datos que ya están pedidos y podrían quedar
 *   desfasadas respecto a su origen.
 *
 * Ninguna fórmula se define aquí: cada cifra sale de una función ya publicada
 * y probada en `calculations/`, en `@/lib/calculations` o en
 * `@/features/budgets`.
 */

/* -------------------------------------------------------------------------- */
/* Claves de consulta                                                         */
/* -------------------------------------------------------------------------- */

/*
 * Las cinco tablas del plan cuelgan de la raíz 'plan' porque se leen siempre
 * juntas por mes: cuando existan mutaciones, una sola invalidación las
 * refrescará. `category_classifications` tiene raíz propia porque no depende
 * del mes y una reclasificación debe alcanzar a todos los meses en caché.
 */

export function planMonthQueryKey(userId: string | undefined, monthKey: string) {
  return ['plan', userId, 'month', monthKey] as const
}

export function planAllocationsQueryKey(
  userId: string | undefined,
  planMonthId: string | undefined,
) {
  return ['plan', userId, 'allocations', planMonthId] as const
}

export function planIncomeSourcesQueryKey(
  userId: string | undefined,
  planMonthId: string | undefined,
) {
  return ['plan', userId, 'income-sources', planMonthId] as const
}

export function planIncomeSourceCategoriesQueryKey(
  userId: string | undefined,
  planMonthId: string | undefined,
) {
  return ['plan', userId, 'income-source-categories', planMonthId] as const
}

export function planLinesQueryKey(userId: string | undefined, monthKey: string) {
  return ['plan', userId, 'lines', monthKey] as const
}

export function categoryClassificationsQueryKey(userId: string | undefined) {
  return ['category-classifications', userId] as const
}

/**
 * Clave del historial acotado a unas cuentas.
 *
 * Empieza por 'transactions' para que las mutaciones de movimientos ya
 * existentes, que invalidan `['transactions', userId]`, también la refresquen.
 *
 * Los identificadores se ordenan aquí, y sobre una copia: dos llamadas con las
 * mismas cuentas en distinto orden deben compartir caché, y ordenar el array
 * de quien llama sería un efecto secundario sobre datos ajenos.
 */
export function transactionsByAccountsQueryKey(
  userId: string | undefined,
  accountIds: readonly string[],
) {
  return ['transactions', userId, 'by-accounts', [...accountIds].sort()] as const
}

/* -------------------------------------------------------------------------- */
/* Consultas                                                                  */
/* -------------------------------------------------------------------------- */

/** Cabecera del plan del mes. `data` es `null` cuando ese mes no tiene plan. */
export function usePlanMonth(monthKey: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: planMonthQueryKey(user?.id, monthKey),
    queryFn: () => fetchPlanMonth(user!.id, monthKey),
    enabled: !!user,
  })
}

/*
 * Las tres consultas siguientes dependen del `plan_month_id`, así que lo
 * reciben como argumento explícito en vez de resolverlo por dentro: la
 * dependencia queda visible en el punto de llamada y no se dispara una
 * consulta encadenada invisible.
 *
 * Sin ese identificador quedan deshabilitadas, y una consulta deshabilitada se
 * queda en `pending` para siempre. Traducir eso a «el mes no tiene plan» es
 * responsabilidad del consumidor; `usePlanActuals` lo hace con
 * `dependentRows`, y cualquier pantalla debe comprobar antes si hay plan en
 * vez de pintar un esqueleto indefinido.
 */

export function usePlanAllocations(planMonthId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: planAllocationsQueryKey(user?.id, planMonthId),
    queryFn: () => fetchPlanAllocations(user!.id, planMonthId!),
    enabled: Boolean(user?.id && planMonthId),
  })
}

export function usePlanIncomeSources(planMonthId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: planIncomeSourcesQueryKey(user?.id, planMonthId),
    queryFn: () => fetchPlanIncomeSources(user!.id, planMonthId!),
    enabled: Boolean(user?.id && planMonthId),
  })
}

export function usePlanIncomeSourceCategories(planMonthId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: planIncomeSourceCategoriesQueryKey(user?.id, planMonthId),
    queryFn: () => fetchPlanIncomeSourceCategories(user!.id, planMonthId!),
    enabled: Boolean(user?.id && planMonthId),
  })
}

/**
 * Líneas del mes. Depende solo del mes, no del `plan_month_id`: la columna
 * `period_month` de `plan_lines` permite pedirlas sin esperar a la cabecera.
 */
export function usePlanLines(monthKey: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: planLinesQueryKey(user?.id, monthKey),
    queryFn: () => fetchPlanLines(user!.id, monthKey),
    enabled: !!user,
  })
}

export function useCategoryClassifications() {
  const { user } = useAuth()

  return useQuery({
    queryKey: categoryClassificationsQueryKey(user?.id),
    queryFn: () => fetchCategoryClassifications(user!.id),
    enabled: !!user,
  })
}

/**
 * Historial acotado a unas cuentas. `enabled` permite esperar a que se sepa
 * cuáles son esas cuentas, en vez de pedir el historial de una lista vacía y
 * dejar esa respuesta en caché bajo una clave que ya no se volverá a usar.
 */
export function useTransactionsByAccounts(
  accountIds: readonly string[],
  options?: { enabled?: boolean },
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: transactionsByAccountsQueryKey(user?.id, accountIds),
    queryFn: () => fetchTransactionsByAccounts(user!.id, accountIds),
    enabled: !!user && (options?.enabled ?? true),
  })
}

/* -------------------------------------------------------------------------- */
/* Derivaciones                                                               */
/* -------------------------------------------------------------------------- */

/** Estado de una derivación, con la misma forma que `useBudgetProgress`. */
export interface DerivedState<T> {
  data: T | undefined
  isPending: boolean
  isError: boolean
  error: Error | null
}

/** Colección vacía con identidad estable, para no invalidar los `useMemo`. */
const NO_ROWS: never[] = []

interface RowsQuery<T> {
  data: T[] | undefined
  isPending: boolean
  isError: boolean
  error: Error | null
}

/**
 * Traduce una consulta dependiente del plan del mes.
 *
 * Sin `planMonthId` la consulta está deshabilitada y TanStack Query la deja en
 * `pending` indefinidamente. Aquí eso se convierte en lo que realmente
 * significa: el mes no tiene plan, luego no hay filas y no hay nada que
 * esperar. Sin esta traducción, un mes sin plan dejaría la pantalla cargando
 * para siempre.
 */
function dependentRows<T>(query: RowsQuery<T>, planMonthId: string | undefined): RowsQuery<T> {
  if (planMonthId) return query
  return { data: NO_ROWS, isPending: false, isError: false, error: null }
}

/**
 * Presupuesto efectivo del mes por categoría, resuelto con la misma
 * `resolveBudget` de `/budgets`.
 *
 * `/plan` no tiene una segunda cifra presupuestada por categoría: lee la de
 * `budgets` (docs/06-presupuestos.md, «Frontera con Plan mensual»).
 *
 * Se recorren las categorías presentes en las propias filas de `budgets`, no
 * la lista de categorías: `resolveBudget` solo puede resolver lo que existe,
 * así que no hace falta decidir aquí si incluir las archivadas —y las
 * archivadas con presupuesto siguen apareciendo, que es lo que mantiene
 * consultables los meses cerrados—.
 *
 * Un presupuesto resuelto en 0 se omite del mapa, igual que hace
 * `buildBudgetProgress`: es la decisión explícita de no presupuestar ese mes,
 * y debe llegar a `calculateDiff` como «Sin presupuesto», nunca como un 0 que
 * la interfaz compararía como si fuera un objetivo real.
 */
export function useEffectiveCategoryBudgets(
  monthKey: string,
): DerivedState<Record<string, number>> {
  const budgetsQuery = useBudgets()
  const budgets = budgetsQuery.data

  const data = useMemo(() => {
    if (!budgets) return undefined

    const byCategory: Record<string, number> = {}
    const seen = new Set<string>()

    for (const budget of budgets) {
      if (seen.has(budget.category_id)) continue
      seen.add(budget.category_id)

      const resolved = resolveBudget(budgets, budget.category_id, monthKey)
      if (resolved === null || resolved.amountMinor <= 0) continue

      byCategory[budget.category_id] = resolved.amountMinor
    }

    return byCategory
  }, [budgets, monthKey])

  return {
    data,
    isPending: budgetsQuery.isPending,
    isError: budgetsQuery.isError,
    error: budgetsQuery.error,
  }
}

export interface UsePlanLineProgressOptions {
  monthKey: string
  /** Categorías de las líneas a evaluar, de `planLineCategoryIds`. */
  categoryIds: string[]
}

/**
 * Presupuesto, gasto y estado de progreso de las categorías descritas por
 * líneas, con la misma `buildBudgetProgressList` que usa `/budgets`.
 *
 * No se reutiliza `useBudgetProgress` porque aquel pide su propia consulta de
 * movimientos filtrada por `type: 'expense'`, y el Plan ya necesita los
 * movimientos del mes sin filtrar para el ingreso y las transferencias:
 * reutilizarlo dispararía dos consultas sobre la misma tabla y el mismo mes.
 * La función pura —el criterio de umbrales y la resolución del presupuesto— es
 * exactamente la misma, así que no hay un segundo lenguaje de estado.
 * `calculateBudgetableSpending` ya filtra por tipo dentro.
 */
export function usePlanLineProgress({
  monthKey,
  categoryIds,
}: UsePlanLineProgressOptions): DerivedState<BudgetProgress[]> {
  const budgetsQuery = useBudgets()
  const transactionsQuery = useTransactions({ month: monthKey })

  const budgets = budgetsQuery.data
  const transactions = transactionsQuery.data

  const data = useMemo(() => {
    if (!budgets || !transactions) return undefined
    return buildBudgetProgressList(budgets, transactions, categoryIds, monthKey)
  }, [budgets, transactions, categoryIds, monthKey])

  return {
    data,
    isPending: budgetsQuery.isPending || transactionsQuery.isPending,
    isError: budgetsQuery.isError || transactionsQuery.isError,
    error: budgetsQuery.error ?? transactionsQuery.error,
  }
}

export interface PlanActuals {
  incomeActualMinor: number
  expenseActualMinor: number
  /** Facturas, variables y no planeado. Suman `expenseActualMinor`. */
  byLine: ExpenseLineBreakdown
  /** needs, wants, debt y sin clasificar. También suman `expenseActualMinor`. */
  byGroup: ExpenseGroupBreakdown
  savingsContributionsMinor: number
  investmentContributionsMinor: number
  incomeBySource: IncomeActualBySource
}

export interface UsePlanActualsOptions {
  monthKey: string
  /** `undefined` cuando el mes no tiene plan. */
  planMonthId: string | undefined
}

/**
 * Todas las cifras «Actual» del mes.
 *
 * Una sola lectura de movimientos las alimenta: `useTransactions({ month })`,
 * sin filtro de tipo, porque el Plan necesita ingresos, gastos y las dos patas
 * de cada transferencia. Su clave empieza por `['transactions', userId]`, así
 * que las mutaciones de movimientos ya existentes la refrescan sin trabajo
 * adicional.
 *
 * **Riesgo conocido:** `fetchTransactions` no pagina, y PostgREST corta en
 * 1000 filas. Un mes con más de 1000 movimientos daría cifras truncadas sin
 * avisar. Es el mismo riesgo que ya corre `/budgets` con esa misma lectura;
 * arreglarlo es tocar `transactions/api.ts`, que está fuera de este paso.
 *
 * Ninguna cifra se calcula aquí: cada una es una llamada a una función ya
 * probada, y las dos particiones del gasto se mantienen separadas —no se
 * cruzan ni se suman entre sí (docs/09-plan-mensual.md)—.
 */
export function usePlanActuals({
  monthKey,
  planMonthId,
}: UsePlanActualsOptions): DerivedState<PlanActuals> {
  const transactionsQuery = useTransactions({ month: monthKey })
  const linesQuery = usePlanLines(monthKey)
  const classificationsQuery = useCategoryClassifications()
  const accountsQuery = useAccounts()

  const incomeSourcesQuery = usePlanIncomeSources(planMonthId)
  const incomeSourceCategoriesQuery = usePlanIncomeSourceCategories(planMonthId)

  const sourcesQuery = dependentRows(incomeSourcesQuery, planMonthId)
  const linksQuery = dependentRows(incomeSourceCategoriesQuery, planMonthId)

  const transactions = transactionsQuery.data
  const lines = linesQuery.data
  const classifications = classificationsQuery.data
  const accounts = accountsQuery.data
  const sources = sourcesQuery.data
  const links = linksQuery.data

  const data = useMemo<PlanActuals | undefined>(() => {
    if (!transactions || !lines || !classifications || !accounts || !sources || !links) {
      return undefined
    }

    const expenses = toPlanExpenseTransactions(transactions)
    const partition = partitionPlanLines(lines)
    // Un solo emparejamiento para las dos cifras: ahorro e inversión se
    // separan después, dentro de `sumTransferContributions`.
    const contributions = buildTransferContributionCandidates(transactions, accounts)

    return {
      incomeActualMinor: calculateMonthlyIncome(expenses),
      expenseActualMinor: sumActualExpenses(expenses),
      byLine: splitExpensesByPlanLine(
        expenses,
        planLineCategoryIds(partition.bills),
        planLineCategoryIds(partition.variables),
      ),
      byGroup: groupExpensesByClassification(expenses, buildClassificationMap(classifications)),
      savingsContributionsMinor: sumTransferContributions(contributions, 'savings'),
      investmentContributionsMinor: sumTransferContributions(contributions, 'investment'),
      incomeBySource: buildIncomeActualBySource(
        transactions,
        links,
        sources.map((source) => source.id),
      ),
    }
  }, [transactions, lines, classifications, accounts, sources, links])

  return {
    data,
    isPending:
      transactionsQuery.isPending ||
      linesQuery.isPending ||
      classificationsQuery.isPending ||
      accountsQuery.isPending ||
      sourcesQuery.isPending ||
      linksQuery.isPending,
    isError:
      transactionsQuery.isError ||
      linesQuery.isError ||
      classificationsQuery.isError ||
      accountsQuery.isError ||
      sourcesQuery.isError ||
      linksQuery.isError,
    error:
      transactionsQuery.error ??
      linesQuery.error ??
      classificationsQuery.error ??
      accountsQuery.error ??
      sourcesQuery.error ??
      linksQuery.error,
  }
}

export interface ContributionBalances {
  savingsBalanceMinor: number
  investmentBalanceMinor: number
}

/**
 * `saldoEnAhorro` y su equivalente de inversión: saldo acumulado de esas
 * cuentas, no un flujo del mes.
 *
 * Va aparte de `usePlanActuals` a propósito. Es la única lectura que recorre
 * todo el historial, y encadenarla a las cifras del mes haría esperar a la
 * pantalla entera por un dato que solo es contexto. Nunca entra en el cuadro
 * Presupuesto vs. Actual ni en el Restante: mezclar un stock con flujos es el
 * error clásico de estas plantillas (docs/09-plan-mensual.md).
 *
 * Las cuentas salen de `useAccounts`, que la aplicación ya tiene en caché y
 * que además hace falta entera para emparejar transferencias —el origen de un
 * aporte suele ser una cuenta corriente—. De ahí se derivan los identificadores
 * de ahorro e inversión, que son los únicos cuyo historial se pide.
 */
export function usePlanContributionBalances(): DerivedState<ContributionBalances> {
  const accountsQuery = useAccounts()
  const accounts = accountsQuery.data

  const accountIds = useMemo(
    () =>
      (accounts ?? [])
        .filter((account) => account.type === 'savings' || account.type === 'investment')
        .map((account) => account.id),
    [accounts],
  )

  const historyQuery = useTransactionsByAccounts(accountIds, { enabled: accounts !== undefined })
  const history = historyQuery.data

  const data = useMemo<ContributionBalances | undefined>(() => {
    if (!accounts || !history) return undefined

    const transactions = toBalanceTransactions(history)

    return {
      savingsBalanceMinor: calculateBalanceForAccountType(accounts, transactions, 'savings'),
      investmentBalanceMinor: calculateBalanceForAccountType(accounts, transactions, 'investment'),
    }
  }, [accounts, history])

  return {
    data,
    isPending: accountsQuery.isPending || historyQuery.isPending,
    isError: accountsQuery.isError || historyQuery.isError,
    error: accountsQuery.error ?? historyQuery.error,
  }
}

/* -------------------------------------------------------------------------- */
/* Mutaciones                                                                 */
/* -------------------------------------------------------------------------- */

/*
 * Todas invalidan la raiz `['plan', userId]`. Crear el mes cambia el
 * `plan_month_id` del que cuelgan las consultas dependientes, asi que
 * invalidar por prefijo es lo unico que garantiza que ninguna se quede
 * colgando de un identificador viejo.
 */

/**
 * Crea el plan del mes, o recupera el que ya existia.
 *
 * El 23505 no es un fallo que mostrar: significa que otra pestana se adelanto.
 * Se relee el mes y se sigue con el existente, que es lo que el usuario queria.
 * Solo si la relectura tampoco encuentra nada se informa del problema, porque
 * entonces no hay plan con el que continuar.
 */
export function useCreatePlanMonth() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (monthKey: string) => {
      try {
        return await createPlanMonth(user!.id, monthKey)
      } catch (error) {
        if (error instanceof PlanError && error.code === 'month_conflict') {
          const existing = await fetchPlanMonth(user!.id, monthKey)
          if (existing) return existing

          throw new PlanError('month_missing_after_conflict')
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', user?.id] })
    },
  })
}

export interface SaveIncomeSourceInput {
  planMonthId: string
  /** `undefined` al crear; el identificador de la fuente al editar. */
  sourceId?: string
  name: string
  plannedMinor: number
  /** Conjunto completo de categorias que debe quedar vinculado. */
  categoryIds: string[]
  /** Categorias vinculadas ahora mismo, para calcular solo las diferencias. */
  currentCategoryIds: string[]
  /** Fuentes ya cargadas, para elegir la siguiente posicion al crear. */
  sources: PositionedRow[]
}

/**
 * Crea o edita una fuente y ajusta sus vinculos de categoria.
 *
 * Son hasta tres sentencias y **no hay transaccion**: PostgREST no las ofrece.
 * Si falla la de vinculos, la fuente queda guardada y el error se muestra tal
 * cual; la invalidacion del `onSettled` hace que la pantalla enseñe lo que de
 * verdad quedo persistido, en vez de afirmar un exito que no fue completo.
 */
export function useSaveIncomeSource() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SaveIncomeSourceInput) => {
      const source = input.sourceId
        ? await updatePlanIncomeSource(input.sourceId, {
            name: input.name,
            planned_minor: input.plannedMinor,
          })
        : await insertPlanIncomeSource({
            user_id: user!.id,
            plan_month_id: input.planMonthId,
            name: input.name,
            planned_minor: input.plannedMinor,
            position: nextIncomeSourcePosition(input.sources),
          })

      const { toAdd, toRemove } = diffIncomeSourceCategories(
        input.currentCategoryIds,
        input.categoryIds,
      )

      await deletePlanIncomeSourceCategories(source.id, toRemove)
      await insertPlanIncomeSourceCategories(
        toAdd.map((categoryId) => ({
          user_id: user!.id,
          plan_month_id: input.planMonthId,
          plan_income_source_id: source.id,
          category_id: categoryId,
        })),
      )

      return source
    },
    // `onSettled` y no `onSuccess`: tras un fallo parcial la pantalla tiene que
    // refrescarse igual, porque parte de la escritura si se guardo.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', user?.id] })
    },
  })
}

/** Borra una fuente. Sus vinculos caen por cascada (F4). */
export function useDeleteIncomeSource() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sourceId: string) => deletePlanIncomeSource(sourceId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', user?.id] })
    },
  })
}

export interface SaveAllocationsInput {
  planMonthId: string
  /** Porcentajes enteros por grupo, ya validados: suman 100. */
  percentages: AllocationPercentInput
  /**
   * `true` cuando el mes ya tiene reparto guardado. Decide entre estrenar el
   * conjunto y actualizarlo; no es una preferencia, es lo que separa un INSERT
   * de un UPSERT.
   */
  hasAllocation: boolean
}

/**
 * Guarda el reparto del mes: siempre los cinco grupos, siempre en una sentencia.
 *
 * La mutacion no reparte importes ni valida la suma: lo primero lo hace
 * `resolveAllocation` al mostrar, y lo segundo `allocationFormSchema` antes de
 * llegar aqui. Lo unico que decide es cual de las dos escrituras corresponde.
 *
 * `onSettled` y no `onSuccess`, como en las demas: tras un conflicto la
 * pantalla tiene que enseñar el reparto que de verdad quedo guardado, no el
 * que se intento guardar.
 */
export function useSaveAllocations() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: SaveAllocationsInput) => {
      const rows = buildAllocationRows({
        userId: user!.id,
        planMonthId: input.planMonthId,
        percentages: input.percentages,
      })

      return input.hasAllocation ? upsertPlanAllocations(rows) : insertPlanAllocations(rows)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', user?.id] })
    },
  })
}
