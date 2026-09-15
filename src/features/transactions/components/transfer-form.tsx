import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  createTransferSchema,
  isCrossCurrencyTransfer,
  transferDefaultValues,
  type TransferFormInput,
  type TransferFormValues,
} from '@/features/transactions/schemas'
import { formatAmount } from '@/lib/currency'
import type { Tables } from '@/types/database.types'

interface TransferFormProps {
  accounts: Tables<'accounts'>[]
  /** Moneda de los montos mientras no se ha elegido la cuenta correspondiente. */
  currencyCode: string
  onSubmit: (values: TransferFormValues) => void | Promise<void>
  isSubmitting?: boolean
}

export function TransferForm({ accounts, currencyCode, onSubmit, isSubmitting }: TransferFormProps) {
  const currencyByAccountId = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.currency_code])),
    [accounts],
  )
  const schema = useMemo(() => createTransferSchema(currencyByAccountId), [currencyByAccountId])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TransferFormInput, unknown, TransferFormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: transferDefaultValues,
  })

  const amount = Number(watch('amount')) || 0
  const receivedAmount = watch('receivedAmount')
  const fromAccountId = watch('fromAccountId')
  const toAccountId = watch('toAccountId')
  const activeAccounts = accounts.filter((account) => !account.is_archived)

  const fromCurrency = currencyByAccountId.get(fromAccountId ?? '') ?? currencyCode
  const toCurrency = currencyByAccountId.get(toAccountId ?? '') ?? currencyCode
  const isCrossCurrency = isCrossCurrencyTransfer(currencyByAccountId, fromAccountId, toAccountId)

  // Con la misma moneda el monto recibido no se muestra: un valor que quedó de
  // una elección anterior no debe viajar oculto y hacer fallar el envío.
  useEffect(() => {
    if (!isCrossCurrency && receivedAmount !== undefined) {
      setValue('receivedAmount', undefined)
    }
  }, [isCrossCurrency, receivedAmount, setValue])

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
        <Label htmlFor="transfer-amount">
          {isCrossCurrency ? `Monto enviado (${fromCurrency})` : 'Monto'}
        </Label>
        <CurrencyInput
          id="transfer-amount"
          aria-invalid={!!errors.amount}
          value={amount}
          onChange={(value) => setValue('amount', value, { shouldValidate: true })}
        />
        {errors.amount ? (
          <p className="text-sm text-destructive">{errors.amount.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Equivale a {formatAmount(amount, fromCurrency)}
          </p>
        )}
      </div>

      {isCrossCurrency && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="transfer-received-amount">Monto recibido ({toCurrency})</Label>
          <CurrencyInput
            id="transfer-received-amount"
            aria-invalid={!!errors.receivedAmount}
            value={receivedAmount ?? 0}
            onChange={(value) =>
              setValue('receivedAmount', value > 0 ? value : undefined, { shouldValidate: true })
            }
          />
          {errors.receivedAmount ? (
            <p className="text-sm text-destructive">{errors.receivedAmount.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Equivale a {formatAmount(receivedAmount ?? 0, toCurrency)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            FinTrack no convierte divisas: registra cuánto salió y cuánto entró.
          </p>
        </div>
      )}

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
