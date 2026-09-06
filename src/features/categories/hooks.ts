import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

import { archiveCategory, createCategory, fetchCategories, updateCategory } from './api'

export function useCategories() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['categories', user?.id],
    queryFn: () => fetchCategories(user!.id),
    enabled: !!user,
  })
}

export function useCreateCategory() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: Omit<TablesInsert<'categories'>, 'user_id'>) =>
      createCategory({ ...input, user_id: user!.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', user?.id] })
    },
  })
}

export function useUpdateCategory() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TablesUpdate<'categories'> }) =>
      updateCategory(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', user?.id] })
    },
  })
}

export function useArchiveCategory() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => archiveCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', user?.id] })
    },
  })
}
