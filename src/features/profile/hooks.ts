import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'

import { fetchPrimaryCurrency, updatePrimaryCurrency } from './api'

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
