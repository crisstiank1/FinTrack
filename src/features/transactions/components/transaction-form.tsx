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
  transactionDefaultValues,
  transactionSchema,
  type TransactionFormValues,
} from '@/features/transactions/schemas'
import { formatAmount } from '@/lib/currency'
import type { Tables } from '@/types/database.types'

interface TransactionFormProps {
  accounts: Tables<'accounts'>[]
  categories: Tables<'categories'>[]
  currencyCode: string
  defaultValues?: Partial<TransactionFormValues>
  onSubmit: (values: TransactionFormValues) => void | Promise<void>
  submitLabel?: string
  isSubmitting?: boolean
}

export function TransactionForm({
  accounts,
  categories,
  currencyCode,
  defaultValues,
  onSubmit,
  submitLabel = 'Guardar',
  isSubmitting,
}: TransactionFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<z.input<typeof transactionSchema>, unknown, TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    mode: 'onBlur',
    defaultValues: { ...transactionDefaultValues, ...defaultValues },
  })

  const type = watch('type')
  const amount = Number(watch('amount')) || 0
  const activeAccounts = accounts.filter((account) => !account.is_archived)
  const filteredCategories = categories.filter(
    (category) => category.type === type && !category.is_archived,
  )

  function handleTypeChange(nextType: 'income' | 'expense') {
    setValue('type', nextType, { shouldValidate: true })
    setValue('categoryId', '', { shouldValidate: false })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de movimiento">
        <Button
          type="button"
          role="radio"
          aria-checked={type === 'expense'}
          variant={type === 'expense' ? 'default' : 'outline'}
          onClick={() => handleTypeChange('expense')}
        >
          Gasto
        </Button>
        <Button
          type="button"
          role="radio"
          aria-checked={type === 'income'}
          variant={type === 'income' ? 'default' : 'outline'}
          onClick={() => handleTypeChange('income')}
        >
          Ingreso
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transaction-description">Descripción</Label>
        <Input
          id="transaction-description"
          placeholder="Ej. Mercado del mes"
          aria-invalid={!!errors.description}
          {...register('description')}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transaction-amount">Monto</Label>
        <CurrencyInput
          id="transaction-amount"
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

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="transaction-account">Cuenta</Label>
          <Select id="transaction-account" aria-invalid={!!errors.accountId} {...register('accountId')}>
            <option value="">Selecciona...</option>
            {activeAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="transaction-category">Categoría</Label>
          <Select id="transaction-category" aria-invalid={!!errors.categoryId} {...register('categoryId')}>
            <option value="">Selecciona...</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId.message}</p>}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transaction-date">Fecha</Label>
        <Input
          id="transaction-date"
          type="date"
          aria-invalid={!!errors.transactionDate}
          {...register('transactionDate')}
        />
        {errors.transactionDate && (
          <p className="text-sm text-destructive">{errors.transactionDate.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="transaction-notes">Notas (opcional)</Label>
        <Input id="transaction-notes" placeholder="Detalles adicionales" {...register('notes')} />
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
