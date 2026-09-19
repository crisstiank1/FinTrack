import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

import {
  createTransaction,
  createTransferPair,
  deleteTransaction,
  duplicateTransaction,
  fetchTransactions,
  fetchTransferCounterparts,
  transferGroupIds,
  updateTransaction,
  updateTransferPair,
  type TransactionFilters,
} from './api'

export function useTransactions(filters: TransactionFilters) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['transactions', user?.id, filters],
    queryFn: () => fetchTransactions(user!.id, filters),
    enabled: !!user,
  })
}

/**
 * Contraparte de cada transferencia de la lista (ver `fetchTransferCounterparts`).
 * La clave empieza por 'transactions' para que crear o borrar una transferencia
 * la refresque con la invalidación que ya existe.
 */
export function useTransferCounterparts(
  transactions: Parameters<typeof fetchTransferCounterparts>[1] | undefined,
) {
  const { user } = useAuth()
  const groupIds = transferGroupIds(transactions ?? [])

  return useQuery({
    queryKey: ['transactions', user?.id, 'counterparts', groupIds],
    queryFn: () => fetchTransferCounterparts(user!.id, transactions ?? []),
    enabled: !!user && groupIds.length > 0,
  })
}

function useInvalidateTransactions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  /**
   * Invalida todo lo que derive de movimientos, por prefijo.
   *
   * El dashboard y el Libro no guardan un caché por mes: leen el historial
   * completo (`['transactions', userId, 'all']`) y derivan en cliente, así que
   * una edición que cambie la fecha de un movimiento —retroactiva o no— solo
   * puede quedar fresca invalidando ese prefijo. Las claves mensuales de otras
   * pantallas (presupuestos, plan) empiezan también por 'transactions', igual
   * que 'by-accounts', de modo que una invalidación por prefijo las cubre a
   * todas sin enumerarlas.
   */
  return () => {
    queryClient.invalidateQueries({ queryKey: ['transactions', user?.id] })
    queryClient.invalidateQueries({ queryKey: ['accounts', user?.id] })
  }
}

export function useCreateTransaction() {
  const { user } = useAuth()
  const invalidate = useInvalidateTransactions()

  return useMutation({
    mutationFn: (input: Omit<TablesInsert<'transactions'>, 'user_id'>) =>
      createTransaction({ ...input, user_id: user!.id }),
    onSuccess: invalidate,
  })
}

export function useCreateTransfer() {
  const { user } = useAuth()
  const invalidate = useInvalidateTransactions()

  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof createTransferPair>[0], 'userId'>) =>
      createTransferPair({ ...input, userId: user!.id }),
    onSuccess: invalidate,
  })
}

/**
 * Edita una transferencia entera (M8). Invalida lo mismo que crearla: las dos
 * patas cambian de importe o de cuenta, así que los saldos también.
 */
export function useUpdateTransfer() {
  const { user } = useAuth()
  const invalidate = useInvalidateTransactions()

  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof updateTransferPair>[0], 'userId'>) =>
      updateTransferPair({ ...input, userId: user!.id }),
    onSuccess: invalidate,
  })
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateTransactions()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TablesUpdate<'transactions'> }) =>
      updateTransaction(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateTransactions()

  return useMutation({
    mutationFn: deleteTransaction,
    onSuccess: invalidate,
  })
}

export function useDuplicateTransaction() {
  const { user } = useAuth()
  const invalidate = useInvalidateTransactions()

  return useMutation({
    mutationFn: (transactionId: string) => duplicateTransaction(user!.id, transactionId),
    onSuccess: invalidate,
  })
}
