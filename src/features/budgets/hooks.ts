import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useAuth } from '@/features/auth/auth-provider'
import { useTransactions } from '@/features/transactions/hooks'
import { currentMonthKey } from '@/lib/dates'

import { deleteBudget, fetchBudgets, insertBudget, updateBudget } from './api'
import { BudgetError } from './errors'
import { planBudgetWrite, type BudgetWriteIntent } from './mutations'
import { buildBudgetProgressList, type BudgetProgress } from './progress'

/** Clave de la lista de presupuestos. En un solo sitio para que no se desincronice. */
function budgetsQueryKey(userId: string | undefined) {
  return ['budgets', userId] as const
}

/**
 * Todos los presupuestos del usuario de la sesión.
 *
 * La resolución por mes y categoría ocurre en memoria con `resolveBudget`: son
 * pocas filas y así cambiar de mes en la interfaz no dispara una consulta.
 */
export function useBudgets() {
  const { user } = useAuth()

  return useQuery({
    queryKey: budgetsQueryKey(user?.id),
    queryFn: () => fetchBudgets(user!.id),
    enabled: !!user,
  })
}

export interface SaveBudgetInput {
  amountMinor: number
  intent: BudgetWriteIntent
}

/**
 * Guarda un presupuesto según la intención declarada: versionar la plantilla,
 * fijar la excepción de un mes o corregir una fila histórica. No hay un hook
 * aparte para "poner a cero": eso es una excepción con `amountMinor: 0`.
 *
 * **Conflictos.** El plan se calcula sobre las filas conocidas, que pueden
 * estar obsoletas si otra pestaña escribió mientras tanto. Si el INSERT choca
 * con el índice único, `toBudgetError` lo convierte en `code: 'conflict'` y
 * aquí solo se refresca la lista. Deliberadamente **no** se reintenta como
 * UPDATE: eso pisaría en silencio el importe que guardó la otra pestaña. Quien
 * llama recibe el error, ve el valor actualizado y decide si vuelve a guardar.
 */
export function useSaveBudget() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ amountMinor, intent }: SaveBudgetInput) => {
      // `ensureQueryData` devuelve la caché si ya está y consulta si no. Sin
      // esto, guardar antes de que la lista cargue planificaría contra una
      // lista vacía y produciría un INSERT que el índice único rechazaría.
      const budgets = await queryClient.ensureQueryData({
        queryKey: budgetsQueryKey(user!.id),
        queryFn: () => fetchBudgets(user!.id),
      })

      const plan = planBudgetWrite(budgets, {
        userId: user!.id,
        amountMinor,
        intent,
        currentMonth: currentMonthKey(),
      })

      return plan.op === 'insert'
        ? await insertBudget(plan.row)
        : await updateBudget(plan.id, plan.patch)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetsQueryKey(user?.id) })
    },
    onError: (error) => {
      // Un conflicto significa que lo que teníamos en memoria ya no es lo que
      // hay en el servidor. Refrescar es lo único que se hace automáticamente.
      if (error instanceof BudgetError && error.code === 'conflict') {
        queryClient.invalidateQueries({ queryKey: budgetsQueryKey(user?.id) })
      }
    },
  })
}

export function useDeleteBudget() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (budgetId: string) => deleteBudget(budgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetsQueryKey(user?.id) })
    },
  })
}

export interface UseBudgetProgressOptions {
  monthKey: string
  /**
   * Categorías a evaluar. Quien llama decide si incluir las archivadas, que
   * hacen falta para consultar meses pasados.
   */
  categoryIds: string[]
}

/**
 * Progreso de cada categoría en un mes.
 *
 * No es una consulta propia sino una derivación memoizada de otras dos, para
 * no duplicar en caché datos que ya están pedidos.
 *
 * El gasto se lee **acotado al mes consultado**: `useTransactions` filtra por
 * rango de fechas y por `type: 'expense'` en el servidor. No se reutiliza
 * `useAllTransactions` del dashboard, que descarga el historial completo
 * paginado —hasta 50.000 filas— para poder acumular saldos desde el saldo
 * inicial de cada cuenta. Los presupuestos no necesitan nada de eso, y colgar
 * esta vista de esa consulta la haría depender de que el dashboard se hubiera
 * visitado antes.
 *
 * La clave de esa consulta empieza por 'transactions', así que las mutaciones
 * de movimientos ya existentes la refrescan sin trabajo adicional.
 */
export function useBudgetProgress({ monthKey, categoryIds }: UseBudgetProgressOptions) {
  const budgetsQuery = useBudgets()
  const expensesQuery = useTransactions({ month: monthKey, type: 'expense' })

  const budgets = budgetsQuery.data
  const expenses = expensesQuery.data

  const data = useMemo<BudgetProgress[] | undefined>(() => {
    if (!budgets || !expenses) return undefined
    return buildBudgetProgressList(budgets, expenses, categoryIds, monthKey)
  }, [budgets, expenses, categoryIds, monthKey])

  return {
    data,
    isPending: budgetsQuery.isPending || expensesQuery.isPending,
    isError: budgetsQuery.isError || expensesQuery.isError,
    error: budgetsQuery.error ?? expensesQuery.error,
  }
}
