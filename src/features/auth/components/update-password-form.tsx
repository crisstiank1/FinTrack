import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { redirectAfterAuth } from '@/features/auth/redirect-after-auth'
import { updatePasswordSchema, type UpdatePasswordValues } from '@/features/auth/schemas'
import { supabase } from '@/lib/supabase'

export function UpdatePasswordForm() {
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdatePasswordValues>({
    resolver: zodResolver(updatePasswordSchema),
    mode: 'onBlur',
  })

  async function onSubmit(values: UpdatePasswordValues) {
    const { data, error } = await supabase.auth.updateUser({ password: values.password })

    if (error || !data.user) {
      toast.error('No se pudo actualizar la contraseña', { description: error?.message })
      return
    }

    toast.success('Contraseña actualizada correctamente.')
    await redirectAfterAuth(navigate, data.user.id)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Elige una nueva contraseña</h1>
        <p className="text-sm text-muted-foreground">Debe tener al menos 8 caracteres.</p>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-password">Nueva contraseña</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'new-password-error' : undefined}
            {...register('password')}
          />
          {errors.password && (
            <p id="new-password-error" className="text-sm text-destructive">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-new-password">Confirmar contraseña</Label>
          <Input
            id="confirm-new-password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'confirm-new-password-error' : undefined}
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p id="confirm-new-password-error" className="text-sm text-destructive">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Guardar contraseña
        </Button>
      </form>
    </div>
  )
}
