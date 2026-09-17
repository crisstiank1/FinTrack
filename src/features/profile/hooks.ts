import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'

import {
  fetchDisplayName,
  fetchPrimaryCurrency,
  updateDisplayName,
  updatePrimaryCurrency,
} from './api'

/** Moneda principal del perfil. Si la consulta falla, `data` queda indefinido. */
export function usePrimaryCurrency() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['profile', user?.id, 'currency'],
    queryFn: () => fetchPrimaryCurrency(user!.id),
    enabled: !!user,
  })
}

/**
 * Cambia la moneda principal desde Ajustes (M12).
 *
 * Invalida la consulta de moneda y la de cuentas: cambiar la principal puede
 * cambiar la moneda en que cada pantalla presenta sus totales
 * (`resolvePresentationCurrency`), y el Libro y Movimientos la derivan de la
 * caché de cuentas.
 */
export function useUpdatePrimaryCurrency() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (currencyCode: string) => updatePrimaryCurrency(user!.id, currencyCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['accounts', user?.id] })
    },
  })
}

/** Nombre del perfil. `null` si nunca se guardó uno. */
export function useDisplayName() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['profile', user?.id, 'display-name'],
    queryFn: () => fetchDisplayName(user!.id),
    enabled: !!user,
  })
}

/**
 * Cambia el nombre desde Ajustes. Solo invalida su propia consulta: el nombre no
 * afecta a monedas, cuentas ni cifras.
 */
export function useUpdateDisplayName() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (displayName: string) => updateDisplayName(user!.id, displayName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id, 'display-name'] })
    },
  })
}
