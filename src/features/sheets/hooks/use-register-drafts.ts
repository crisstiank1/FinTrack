import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'

import { registerSheetDraft } from '../api'

/**
 * Concurrencia máxima de `register_sheet_draft` en el cliente. No existe una
 * RPC por lotes (docs/07 §Registro): cada borrador se registra en su propia
 * transacción y aquí se limitan las llamadas simultáneas.
 */
export const REGISTER_CONCURRENCY = 3

/** Resultado por borrador para que la UI informe de éxitos y rechazos. */
export interface RegisterDraftOutcome {
  draftId: string
  ok: boolean
  status: 'registered' | 'invalid' | 'not_found' | 'error'
  transactionId?: string
  /** Motivos de rechazo cuando `status === 'invalid'`. */
  reasons?: { field: string; code: string }[]
  message?: string
}

async function mapWithPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

/**
 * Registra cada borrador con concurrencia acotada. Una fila rechazada por la
 * RPC (`invalid`/`not_found`) no aborta el resto; una excepción de PostgreSQL
 * (llega como error de `supabase.rpc`) se convierte en resultado `error`.
 */
export function useRegisterDrafts() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      draftIds,
    }: {
      sheetId: string
      draftIds: string[]
    }): Promise<RegisterDraftOutcome[]> =>
      mapWithPool(draftIds, REGISTER_CONCURRENCY, async (draftId) => {
        try {
          const response = await registerSheetDraft(draftId)
          if (response.status === 'registered') {
            return {
              draftId,
              ok: true,
              status: 'registered' as const,
              transactionId: response.transaction_id,
            }
          }
          if (response.status === 'invalid') {
            return {
              draftId,
              ok: false,
              status: 'invalid' as const,
              reasons: response.errors,
            }
          }
          return { draftId, ok: false, status: 'not_found' as const }
        } catch (error) {
          return { draftId, ok: false, status: 'error' as const, message: String(error) }
        }
      }),
    onSuccess: (_data, variables) => {
      if (user) {
        queryClient.invalidateQueries({
          queryKey: ['sheets', user.id, 'drafts', variables.sheetId],
        })
      }
    },
  })
}
