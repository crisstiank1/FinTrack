import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { ColorPicker } from '@/components/ui/color-picker'
import { CurrencyInput } from '@/components/ui/currency-input'
import { IconPicker } from '@/components/ui/icon-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  accountSchema,
  accountTypeOptions,
  type AccountFormValues,
} from '@/features/accounts/schemas'
import { currencyOptions, formatAmount } from '@/lib/currency'

interface AccountFormProps {
  defaultValues?: Partial<AccountFormValues>
  onSubmit: (values: AccountFormValues) => void | Promise<void>
  submitLabel?: string
  isSubmitting?: boolean
  /** Bloquea el selector de moneda cuando la cuenta ya tiene movimientos (D6). */
  currencyLocked?: boolean
}

export function AccountForm({
  defaultValues,
  onSubmit,
  submitLabel = 'Guardar',
  isSubmitting,
  currencyLocked = false,
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
  const initialBalance = Number(watch('initialBalance')) || 0
  const currencyCode = watch('currencyCode')

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
          <Select
            id="account-currency"
            disabled={currencyLocked}
            aria-invalid={!!errors.currencyCode}
            aria-describedby={
              errors.currencyCode || currencyLocked ? 'account-currency-hint' : undefined
            }
            {...register('currencyCode')}
          >
            {currencyOptions(defaultValues?.currencyCode).map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </Select>
          {errors.currencyCode ? (
            <p id="account-currency-hint" className="text-sm text-destructive">
              {errors.currencyCode.message}
            </p>
          ) : currencyLocked ? (
            <p id="account-currency-hint" className="text-xs text-muted-foreground">
              La moneda no se puede cambiar porque la cuenta ya tiene movimientos
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="account-initial-balance">Saldo inicial</Label>
        <CurrencyInput
          id="account-initial-balance"
          aria-invalid={!!errors.initialBalance}
          aria-describedby="account-balance-hint"
          currency={currencyCode || 'COP'}
          value={initialBalance}
          onChange={(value) => setValue('initialBalance', value, { shouldValidate: true })}
        />
        {errors.initialBalance ? (
          <p id="account-balance-hint" className="text-sm text-destructive">
            {errors.initialBalance.message}
          </p>
        ) : (
          <p id="account-balance-hint" className="text-xs text-muted-foreground">
            Equivale a {formatAmount(initialBalance, currencyCode || 'COP')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Ícono</span>
        <IconPicker
          value={icon}
          onChange={(value) => setValue('icon', value, { shouldValidate: true })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Color</span>
        <ColorPicker
          value={color}
          onChange={(value) => setValue('color', value, { shouldValidate: true })}
        />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
