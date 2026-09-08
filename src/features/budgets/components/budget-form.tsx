import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMonthLabel } from '@/lib/dates'

import {
  budgetAmountSchema,
  budgetSchema,
  budgetScopeOptions,
  ZERO_BUDGET_WARNING,
  type BudgetFormInput,
  type BudgetFormValues,
} from '../schemas'

export interface BudgetFormSubmit {
  amountMinor: number
  /** Ignorado cuando el formulario está en modo corrección. */
  scope: 'template' | 'exception'
}

interface BudgetFormProps {
  monthKey: string
  /** Monto actual, si se está editando. */
  defaultAmountMinor?: number
  /**
   * `false` para un mes ya cerrado: versionar hacia atrás reescribiría meses
   * pasados, así que ahí solo cabe la excepción.
   */
  allowTemplate: boolean
  /** En corrección se edita el importe de una fila concreta; no hay alcance. */
  mode?: 'scoped' | 'correction'
  submitLabel?: string
  isSubmitting?: boolean
  onSubmit: (values: BudgetFormSubmit) => void | Promise<void>
}

const SCOPE_HINTS: Record<'template' | 'exception', (month: string) => string> = {
  template: (month) => `${month} y los meses siguientes`,
  exception: (month) => `solo ${month}`,
}

export function BudgetForm({
  monthKey,
  defaultAmountMinor,
  allowTemplate,
  mode = 'scoped',
  submitLabel = 'Guardar',
  isSubmitting,
  onSubmit,
}: BudgetFormProps) {
  const monthLabel = formatMonthLabel(monthKey)
  const showScope = mode === 'scoped'

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<BudgetFormInput, unknown, BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    mode: 'onBlur',
    defaultValues: {
      // Texto, no número: un campo numérico convertiría el vacío en 0, y 0 es
      // un valor con significado propio en presupuestos.
      amount: defaultAmountMinor === undefined ? '' : String(defaultAmountMinor),
      scope: allowTemplate ? 'template' : 'exception',
    },
  })

  // La advertencia se muestra mientras se escribe, no al enviar: guardar un 0
  // es legítimo, pero su efecto debe conocerse antes de pulsar el botón.
  const parsedAmount = budgetAmountSchema.safeParse(watch('amount') ?? '')
  const isZero = parsedAmount.success && parsedAmount.data === 0

  const scopeOptions = allowTemplate
    ? budgetScopeOptions
    : budgetScopeOptions.filter((option) => option.value === 'exception')

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) =>
        onSubmit({ amountMinor: values.amount, scope: values.scope }),
      )}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="budget-amount">Monto mensual</Label>
        <Input
          id="budget-amount"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ej. 1.200.000"
          aria-invalid={!!errors.amount}
          aria-describedby={errors.amount ? 'budget-amount-error' : undefined}
          {...register('amount')}
        />
        {errors.amount && (
          <p id="budget-amount-error" className="text-sm text-destructive">
            {errors.amount.message}
          </p>
        )}
        {!errors.amount && isZero && <p className="text-sm text-warning">{ZERO_BUDGET_WARNING}</p>}
      </div>

      {showScope && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Aplicar</legend>

          {!allowTemplate && (
            <p className="mb-1 text-xs text-muted-foreground">
              {monthLabel} ya pasó. Cambiar la plantilla ahora reescribiría meses ya cerrados, así
              que solo puedes ajustar ese mes.
            </p>
          )}

          {scopeOptions.map((option) => (
            <label
              key={option.value}
              className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm"
            >
              <input
                type="radio"
                value={option.value}
                className="mt-0.5 accent-primary"
                {...register('scope')}
              />
              <span>
                <span className="font-medium text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground first-letter:uppercase">
                  {SCOPE_HINTS[option.value](monthLabel)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
