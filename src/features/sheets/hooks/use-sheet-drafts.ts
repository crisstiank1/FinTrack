import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'
import type { Json } from '@/types/database.types'

import {
  createDraft,
  createSheet,
  deleteDraft,
  fetchDrafts,
  fetchSheets,
  isUniquePositionViolation,
  nextDraftPosition,
  updateDraftCells,
  updateSheetColumns,
  type SheetDraftRow,
} from '../api'
import type { SheetColumn } from '../schemas'

export function useSheets() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['sheets', user?.id],
    queryFn: () => fetchSheets(user!.id),
    enabled: !!user,
  })
}

export function useCreateSheet() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, columns }: { name: string; columns: SheetColumn[] }) =>
      createSheet(user!.id, name, columns as unknown as Json),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheets', user!.id] })
    },
  })
}

export function useUpdateSheetColumns() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sheetId, columns }: { sheetId: string; columns: SheetColumn[] }) =>
      updateSheetColumns(sheetId, columns as unknown as Json),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheets', user!.id] })
    },
  })
}

export function useSheetDrafts(sheetId: string | null) {
  const { user } = useAuth()
  return useQuery({
    queryKey: draftsKey(user?.id, sheetId),
    queryFn: () => fetchDrafts(sheetId!),
    enabled: !!user && !!sheetId,
  })
}

/**
 * Crea un borrador en `max(position)+1`. La única `(sheet_id, position)` es
 * diferible `immediately` y sin `ON CONFLICT`, así que ante una colisión
 * (23505) se vuelve a leer y se reintenta una vez con la posición actualizada.
 */
export function useCreateDraft() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sheetId, cells }: { sheetId: string; cells: Json }) => {
      const drafts = queryClient.getQueryData<SheetDraftRow[]>(draftsKey(user?.id, sheetId)) ?? []
      const position = nextDraftPosition(drafts)
      return createDraft({ user_id: user!.id, sheet_id: sheetId, position, cells }).catch(
        (error: unknown) => {
          if (!isUniquePositionViolation(error)) throw error
          const refreshed =
            queryClient.getQueryData<SheetDraftRow[]>(draftsKey(user?.id, sheetId)) ?? []
          return createDraft({
            user_id: user!.id,
            sheet_id: sheetId,
            position: nextDraftPosition(refreshed),
            cells,
          })
        },
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheets', user!.id, 'drafts'] })
    },
  })
}

export function useUpdateDraftCells() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ draftId, cells }: { draftId: string; cells: Json }) =>
      updateDraftCells(draftId, cells),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheets', user!.id, 'drafts'] })
    },
  })
}

export function useDeleteDraft() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draftId: string) => deleteDraft(draftId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sheets', user!.id, 'drafts'] })
    },
  })
}

const sheetsKey = (userId: string) => ['sheets', userId] as const

export function draftsKey(userId: string | undefined, sheetId: string | null): unknown[] {
  return ['sheets', userId, 'drafts', sheetId]
}

export function sheetsQueryKey(userId: string): readonly unknown[] {
  return sheetsKey(userId)
}
