import { Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Logo } from '@/components/shared/logo'
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
    <main className="grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-border bg-card px-10 py-8 shadow-card">
        <Logo className="h-11" />
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          Verificando credenciales...
        </p>
      </div>
    </main>
  )
}
