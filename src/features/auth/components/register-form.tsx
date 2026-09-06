import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { GoogleIcon } from '@/features/auth/components/google-icon'
import { redirectAfterAuth } from '@/features/auth/redirect-after-auth'
import { registerSchema, type RegisterValues } from '@/features/auth/schemas'
import { supabase } from '@/lib/supabase'

interface RegisterFormProps {
  onSwitchToLogin: () => void
}

export function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const navigate = useNavigate()
  const [googleLoading, setGoogleLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onBlur',
  })

  async function onSubmit(values: RegisterValues) {
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      toast.error('No se pudo crear la cuenta', { description: error.message })
      return
    }

    if (data.session && data.user) {
      await redirectAfterAuth(navigate, data.user.id)
      return
    }

    setEmailSent(true)
  }

  async function handleGoogleSignup() {
    setGoogleLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      toast.error('No se pudo continuar con Google', { description: error.message })
      setGoogleLoading(false)
    }
  }

  if (emailSent) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Confirma tu correo</h1>
        <p className="text-sm text-muted-foreground">
          Te enviamos un enlace de confirmación. Revisa tu bandeja de entrada para activar tu cuenta.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Crea tu cuenta</h1>
        <p className="text-sm text-muted-foreground">Empieza a organizar tus finanzas en minutos.</p>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogleSignup}
        disabled={googleLoading}
      >
        {googleLoading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleIcon className="size-4" />
        )}
        Continuar con Google
      </Button>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">o con tu correo</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="register-email">Correo electrónico</Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'register-email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p id="register-email-error" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="register-password">Contraseña</Label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby="register-password-hint"
            {...register('password')}
          />
          <p
            id="register-password-hint"
            className={errors.password ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}
          >
            {errors.password ? errors.password.message : 'Mínimo 8 caracteres'}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="register-confirm-password">Confirmar contraseña</Label>
          <Input
            id="register-confirm-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'register-confirm-password-error' : undefined}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p id="register-confirm-password-error" className="text-sm text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Crear cuenta
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <button type="button" onClick={onSwitchToLogin} className="font-medium text-primary hover:underline">
          Iniciar sesión
        </button>
      </p>
    </div>
  )
}
