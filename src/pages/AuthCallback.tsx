import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { redirectAfterAuth } from '@/features/auth/redirect-after-auth'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const handled = useRef(false)

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const authError = searchParams.get('error_description') || hashParams.get('error_description')

    if (authError) {
      toast.error('No se pudo iniciar sesión', { description: authError })
      navigate('/auth', { replace: true })
      return
    }

    function finish(userId: string) {
      if (handled.current) return
      handled.current = true
      redirectAfterAuth(navigate, userId)
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        finish(data.session.user.id)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        finish(session.user.id)
      }
    })

    const timeout = setTimeout(() => {
      if (!handled.current) {
        toast.error('No pudimos verificar tu sesión', {
          description: 'Intenta iniciar sesión de nuevo.',
        })
        navigate('/auth', { replace: true })
      }
    }, 8000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <div className="grid min-h-screen place-items-center bg-background text-foreground">
      <p className="text-sm text-muted-foreground">Verificando credenciales...</p>
    </div>
  )
}
