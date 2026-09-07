import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { accountTypeOptions } from '@/features/accounts/schemas'
import {
  accountsStepSchema,
  type AccountsStepValues,
  type DraftAccountValues,
} from '@/features/onboarding/schemas'
import { formatAmount } from '@/lib/currency'

interface AccountsStepProps {
  defaultValues?: DraftAccountValues[]
  currencyCode: string
  onBack: () => void
  onNext: (values: DraftAccountValues[]) => void
}

const EMPTY_ACCOUNT: DraftAccountValues = { name: '', type: 'cash', initialBalance: 0 }

export function AccountsStep({ defaultValues, currencyCode, onBack, onNext }: AccountsStepProps) {
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof accountsStepSchema>, unknown, AccountsStepValues>({
    resolver: zodResolver(accountsStepSchema),
    mode: 'onBlur',
    defaultValues: {
      accounts: defaultValues && defaultValues.length > 0 ? defaultValues : [EMPTY_ACCOUNT],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'accounts' })

  function submit(values: AccountsStepValues) {
    onNext(values.accounts)
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(submit)} noValidate>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tu primera cuenta</h1>
        <p className="text-sm text-muted-foreground">Agrega las cuentas donde manejas tu dinero.</p>
      </div>

      <div className="flex max-h-80 flex-col gap-4 overflow-y-auto pr-1">
        {fields.map((field, index) => (
          <div key={field.id} className="rounded-lg border border-border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Cuenta {index + 1}</span>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  aria-label={`Quitar cuenta ${index + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>

            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`account-${index}-name`}>Nombre</Label>
                <Input
                  id={`account-${index}-name`}
                  placeholder="Ej. Cuenta de ahorros"
                  aria-invalid={!!errors.accounts?.[index]?.name}
                  {...register(`accounts.${index}.name` as const)}
                />
                {errors.accounts?.[index]?.name && (
                  <p className="text-sm text-destructive">{errors.accounts[index]?.name?.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`account-${index}-type`}>Tipo</Label>
                  <Select id={`account-${index}-type`} {...register(`accounts.${index}.type` as const)}>
                    {accountTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor={`account-${index}-balance`}>Saldo inicial</Label>
                  <CurrencyInput
                    id={`account-${index}-balance`}
                    aria-invalid={!!errors.accounts?.[index]?.initialBalance}
                    value={Number(watch(`accounts.${index}.initialBalance` as const)) || 0}
                    onChange={(value) =>
                      setValue(`accounts.${index}.initialBalance` as const, value, {
                        shouldValidate: true,
                      })
                    }
                  />
                  {errors.accounts?.[index]?.initialBalance ? (
                    <p className="text-sm text-destructive">
                      {errors.accounts[index]?.initialBalance?.message}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Equivale a{' '}
                      {formatAmount(
                        Number(watch(`accounts.${index}.initialBalance` as const)) || 0,
                        currencyCode,
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={() => append(EMPTY_ACCOUNT)}>
        <Plus className="size-4" aria-hidden="true" />
        Agregar otra cuenta
      </Button>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Atrás
        </Button>
        <Button type="submit" className="flex-1">
          Continuar
        </Button>
      </div>
    </form>
  )
}
