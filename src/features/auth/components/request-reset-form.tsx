import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestResetSchema, type RequestResetValues } from '@/features/auth/schemas'
import { supabase } from '@/lib/supabase'

export function RequestResetForm() {
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RequestResetValues>({
    resolver: zodResolver(requestResetSchema),
    mode: 'onBlur',
  })

  async function onSubmit(values: RequestResetValues) {
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      toast.error('No se pudo enviar el correo', { description: error.message })
      return
    }

    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Revisa tu correo</h1>
        <p className="text-sm text-muted-foreground">
          Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Restablecer contraseña</h1>
        <p className="text-sm text-muted-foreground">
          Ingresa tu correo y te enviaremos un enlace para restablecerla.
        </p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="reset-email">Correo electrónico</Label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'reset-email-error' : undefined}
            {...register('email')}
          />
          {errors.email && (
            <p id="reset-email-error" className="text-sm text-destructive">
              {errors.email.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Enviar enlace
        </Button>
      </form>

      <Link to="/auth" className="text-center text-sm text-primary hover:underline">
        Volver a iniciar sesión
      </Link>
    </div>
  )
}
