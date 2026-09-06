import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

import { archiveAccount, createAccount, fetchAccounts, updateAccount } from './api'

export function useAccounts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: () => fetchAccounts(user!.id),
    enabled: !!user,
  })
}

export function useCreateAccount() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<TablesInsert<'accounts'>, 'user_id'>) =>
      createAccount({ ...input, user_id: user!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', user?.id] })
    },
  })
}

export function useUpdateAccount() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TablesUpdate<'accounts'> }) =>
      updateAccount(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', user?.id] })
    },
  })
}

export function useArchiveAccount() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => archiveAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', user?.id] })
    },
  })
}
