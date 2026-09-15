import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'

import { fetchPrimaryCurrency } from './api'

/** Moneda principal del perfil. Si la consulta falla, `data` queda indefinido. */
export function usePrimaryCurrency() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['profile', user?.id, 'currency'],
    queryFn: () => fetchPrimaryCurrency(user!.id),
    enabled: !!user,
  })
}
