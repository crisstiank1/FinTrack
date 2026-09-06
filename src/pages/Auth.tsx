import { useState } from 'react'

import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/features/auth/components/login-form'
import { RegisterForm } from '@/features/auth/components/register-form'

type Mode = 'login' | 'register'

export default function Auth() {
  const [mode, setMode] = useState<Mode>('login')

  return (
    <AuthShell formSide={mode === 'login' ? 'left' : 'right'}>
      {mode === 'login' ? (
        <LoginForm onSwitchToRegister={() => setMode('register')} />
      ) : (
        <RegisterForm onSwitchToLogin={() => setMode('login')} />
      )}
    </AuthShell>
  )
}
