import type { NavigateFunction } from 'react-router-dom'

import { supabase } from '@/lib/supabase'

/**
 * Tras cualquier inicio de sesión (email/contraseña, Google o callback OAuth),
 * decide si el usuario va a /onboarding o /dashboard según su perfil.
 */
export async function redirectAfterAuth(navigate: NavigateFunction, userId: string) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .single()

  if (error || !profile?.onboarding_completed) {
    navigate('/onboarding', { replace: true })
  } else {
    navigate('/dashboard', { replace: true })
  }
}
