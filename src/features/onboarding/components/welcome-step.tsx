import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { welcomeStepSchema, type WelcomeStepValues } from '@/features/onboarding/schemas'
import { CURRENCIES } from '@/lib/currency'

interface WelcomeStepProps {
  defaultValues?: WelcomeStepValues
  onNext: (values: WelcomeStepValues) => void
}

export function WelcomeStep({ defaultValues, onNext }: WelcomeStepProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WelcomeStepValues>({
    resolver: zodResolver(welcomeStepSchema),
    mode: 'onBlur',
    defaultValues: { displayName: '', currencyCode: 'COP', ...defaultValues },
  })

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onNext)} noValidate>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">¡Bienvenido a FinTrack!</h1>
        <p className="text-sm text-muted-foreground">
          Cuéntanos un poco de ti para personalizar tu cuenta.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="onboarding-name">¿Cómo te llamas?</Label>
        <Input
          id="onboarding-name"
          placeholder="Tu nombre"
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'onboarding-name-error' : undefined}
          {...register('displayName')}
        />
        {errors.displayName && (
          <p id="onboarding-name-error" className="text-sm text-destructive">
            {errors.displayName.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="onboarding-currency">Moneda principal</Label>
        <Select id="onboarding-currency" {...register('currencyCode')}>
          {CURRENCIES.map((currency) => (
            <option key={currency.code} value={currency.code}>
              {currency.label}
            </option>
          ))}
        </Select>
      </div>

      <Button type="submit">Continuar</Button>
    </form>
  )
}
