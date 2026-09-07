import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  transferDefaultValues,
  transferSchema,
  type TransferFormValues,
} from '@/features/transactions/schemas'
import { formatAmount } from '@/lib/currency'
import type { Tables } from '@/types/database.types'

interface TransferFormProps {
  accounts: Tables<'accounts'>[]
  currencyCode: string
  onSubmit: (values: TransferFormValues) => void | Promise<void>
  isSubmitting?: boolean
}

export function TransferForm({ accounts, currencyCode, onSubmit, isSubmitting }: TransferFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.input<typeof transferSchema>, unknown, TransferFormValues>({
    resolver: zodResolver(transferSchema),
    mode: 'onBlur',
    defaultValues: transferDefaultValues,
  })

  const amount = Number(watch('amount')) || 0
  const activeAccounts = accounts.filter((account) => !account.is_archived)

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="transfer-from">Desde</Label>
          <Select id="transfer-from" aria-invalid={!!errors.fromAccountId} {...register('fromAccountId')}>
            <option value="">Selecciona...</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          {errors.fromAccountId && (
            <p className="text-sm text-destructive">{errors.fromAccountId.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="transfer-to">Hacia</Label>
          <Select id="transfer-to" aria-invalid={!!errors.toAccountId} {...register('toAccountId')}>
            <option value="">Selecciona...</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          {errors.toAccountId && <p className="text-sm text-destructive">{errors.toAccountId.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transfer-amount">Monto</Label>
        <CurrencyInput
          id="transfer-amount"
          aria-invalid={!!errors.amount}
          value={amount}
          onChange={(value) => setValue('amount', value, { shouldValidate: true })}
        />
        {errors.amount ? (
          <p className="text-sm text-destructive">{errors.amount.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Equivale a {formatAmount(amount, currencyCode)}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transfer-date">Fecha</Label>
        <Input
          id="transfer-date"
          type="date"
          aria-invalid={!!errors.transactionDate}
          {...register('transactionDate')}
        />
        {errors.transactionDate && (
          <p className="text-sm text-destructive">{errors.transactionDate.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transfer-description">Descripción</Label>
        <Input id="transfer-description" aria-invalid={!!errors.description} {...register('description')} />
        {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        Transferir
      </Button>
    </form>
  )
}
