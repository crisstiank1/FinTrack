import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

import {
  createTransaction,
  createTransferPair,
  deleteTransaction,
  duplicateTransaction,
  fetchTransactions,
  updateTransaction,
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

function useInvalidateTransactions() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

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
