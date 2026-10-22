import { useState } from 'react'

import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/features/auth/components/login-form'
import { RegisterForm } from '@/features/auth/components/register-form'
import { useDocumentTitle } from '@/hooks/use-document-title'

type Mode = 'login' | 'register'

export default function Auth() {
  const [mode, setMode] = useState<Mode>('login')
  useDocumentTitle(mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta')

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
