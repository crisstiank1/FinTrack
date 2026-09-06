import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { IconPicker } from '@/components/ui/icon-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { accountSchema, accountTypeOptions, type AccountFormValues } from '@/features/accounts/schemas'
import { CURRENCIES } from '@/lib/currency'

interface AccountFormProps {
  defaultValues?: Partial<AccountFormValues>
  onSubmit: (values: AccountFormValues) => void | Promise<void>
  submitLabel?: string
  isSubmitting?: boolean
}

export function AccountForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Guardar',
  isSubmitting,
}: AccountFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.input<typeof accountSchema>, unknown, AccountFormValues>({
    resolver: zodResolver(accountSchema),
    mode: 'onBlur',
    defaultValues: {
      type: 'cash',
      initialBalance: 0,
      currencyCode: 'COP',
      icon: 'wallet',
      color: '#E83E8C',
      ...defaultValues,
    },
  })

  const icon = watch('icon')
  const color = watch('color')

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="account-name">Nombre de la cuenta</Label>
        <Input
          id="account-name"
          placeholder="Ej. Cuenta de ahorros"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'account-name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="account-name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="account-type">Tipo</Label>
          <Select id="account-type" {...register('type')}>
            {accountTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="account-currency">Moneda</Label>
          <Select id="account-currency" {...register('currencyCode')}>
            {CURRENCIES.map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.code}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="account-initial-balance">Saldo inicial</Label>
        <Input
          id="account-initial-balance"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          aria-invalid={!!errors.initialBalance}
          aria-describedby={errors.initialBalance ? 'account-balance-error' : undefined}
          {...register('initialBalance')}
        />
        {errors.initialBalance && (
          <p id="account-balance-error" className="text-sm text-destructive">
            {errors.initialBalance.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Ícono</span>
        <IconPicker value={icon} onChange={(value) => setValue('icon', value, { shouldValidate: true })} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Color</span>
        <ColorPicker value={color} onChange={(value) => setValue('color', value, { shouldValidate: true })} />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
