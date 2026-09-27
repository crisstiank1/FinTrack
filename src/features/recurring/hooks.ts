import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useAuth } from '@/features/auth/auth-provider'

import {
  createRecurringTemplate,
  deleteRecurringTemplate,
  updateRecurringTemplate,
  fetchProfileTimeZone,
  fetchProjections,
  fetchRecurringTemplates,
  projectRecurringTemplates,
} from './api'
import {
  pendingTemplates,
  templateFromMovement,
  userMonthKey,
  type MovementForTemplate,
} from './logic'

export function useRecurringTemplates() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['recurring', user?.id, 'templates'],
    queryFn: () => fetchRecurringTemplates(user!.id),
    enabled: !!user,
  })
}

/**
 * Qué plantillas activas faltan por proyectar en el mes actual del usuario
 * (zona horaria del perfil). Sin plantillas o sin datos, `pending` es vacío y
 * el Dashboard no muestra nada.
 */
export function useRecurringProjectionStatus() {
  const { user } = useAuth()
  const timeZoneQuery = useQuery({
    queryKey: ['profile', user?.id, 'timezone'],
    queryFn: () => fetchProfileTimeZone(user!.id),
    enabled: !!user,
  })
  const monthKey = userMonthKey(timeZoneQuery.data)
  const templatesQuery = useRecurringTemplates()
  const hasActive = (templatesQuery.data ?? []).some((template) => template.is_active)

  const projectionsQuery = useQuery({
    queryKey: ['recurring', user?.id, 'projections', monthKey],
    queryFn: () => fetchProjections(user!.id, monthKey),
    enabled: !!user && hasActive && !timeZoneQuery.isPending,
  })

  const ready = templatesQuery.isSuccess && projectionsQuery.isSuccess
  const pending = ready
    ? pendingTemplates(templatesQuery.data ?? [], projectionsQuery.data ?? [], monthKey)
    : []

  return { monthKey, pending, ready }
}

export function useProjectRecurring() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (monthKey: string) => projectRecurringTemplates(monthKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring', user?.id] })
      // Incluye los borradores: su clave cuelga de ['sheets', userId].
      queryClient.invalidateQueries({ queryKey: ['sheets', user?.id] })
    },
  })
}

/**
 * Crea la plantilla de un movimiento que ya se registró.
 *
 * Se llama **después** de crear el movimiento con el flujo de siempre. Si la
 * plantilla falla, el movimiento ya existe: se dice claramente y se ofrece
 * reintentar **solo la plantilla**, así reintentar nunca duplica el movimiento.
 * Devuelve si la plantilla quedó creada.
 */
export function useCreateTemplateAfterMovement() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  async function attempt(movement: MovementForTemplate): Promise<boolean> {
    try {
      await createRecurringTemplate({ ...templateFromMovement(movement), user_id: user!.id })
      queryClient.invalidateQueries({ queryKey: ['recurring', user?.id] })
      toast.success('Se repetirá cada mes', {
        description: 'Lo verás como borrador para revisar al proyectar cada mes.',
      })
      return true
    } catch (error) {
      toast.error('El movimiento se registró, pero no se pudo programar su repetición', {
        description: error instanceof Error ? error.message : undefined,
        duration: Infinity,
        action: { label: 'Reintentar', onClick: () => void attempt(movement) },
      })
      return false
    }
  }

  return attempt
}

export function useSetTemplateActive() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateRecurringTemplate(id, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring', user?.id] }),
  })
}

export function useDeleteTemplate() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRecurringTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recurring', user?.id] }),
  })
}
