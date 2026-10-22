import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'

import { fetchCoachConsent, grantCoachConsent, revokeCoachConsent } from './api'

export function useCoachConsent() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['profile', user?.id, 'coach-consent'],
    queryFn: () => fetchCoachConsent(user!.id),
    enabled: !!user,
  })
}

export function useSetCoachConsent() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (grant: boolean) =>
      grant ? grantCoachConsent(user!.id) : revokeCoachConsent(user!.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['profile', user?.id, 'coach-consent'] }),
  })
}
