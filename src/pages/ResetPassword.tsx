import { useEffect, useState } from 'react'

import { RequestResetForm } from '@/features/auth/components/request-reset-form'
import { UpdatePasswordForm } from '@/features/auth/components/update-password-form'
import { supabase } from '@/lib/supabase'

export default function ResetPassword() {
  const [mode, setMode] = useState<'request' | 'update'>('request')

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update')
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl sm:p-10">
        {mode === 'request' ? <RequestResetForm /> : <UpdatePasswordForm />}
      </div>
    </div>
  )
}
