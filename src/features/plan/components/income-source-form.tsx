import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { budgetAmountSchema } from '@/features/budgets/schemas'

import {
  planIncomeSourceSchema,
  ZERO_INCOME_WARNING,
  type PlanIncomeSourceFormInput,
  type PlanIncomeSourceFormValues,
} from '../schemas'

export interface IncomeSourceFormSubmit {
  name: string
  plannedMinor: number
  categoryIds: string[]
}

/** Categoría ofrecida por el selector, ya filtrada por quien llama. */
export interface SelectableCategory {
  id: string
  name: string
}

interface IncomeSourceFormProps {
  /** Categorías vinculables: de ingreso, activas y libres este mes. */
  categories: SelectableCategory[]
  defaultName?: string
  defaultPlannedMinor?: number
  defaultCategoryIds?: string[]
  submitLabel?: string
  isSubmitting?: boolean
  onSubmit: (values: IncomeSourceFormSubmit) => void | Promise<void>
}

/**
 * Alta y edición de una fuente de ingreso planeada.
 *
 * El importe es un campo de texto y no numérico, por el mismo motivo que en
 * `/budgets`: un campo numérico convierte el vacío en 0, y aquí `0` significa
 * «tengo esta fuente y aún vale cero», que no es lo mismo que no tener fuente
 * ninguna. Confundirlos haría que «Por asignar» comparase contra un ingreso que
 * nadie declaró.
 *
 * El selector solo muestra lo que el servidor aceptaría: categorías de ingreso,
 * sin archivar y que no alimenten ya otra fuente del mes. Ese filtrado lo hace
 * quien llama con `selectLinkableIncomeCategories`; aquí solo se pintan.
 */
export function IncomeSourceForm({
  categories,
  defaultName,
  defaultPlannedMinor,
  defaultCategoryIds,
  submitLabel = 'Guardar',
  isSubmitting,
  onSubmit,
}: IncomeSourceFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PlanIncomeSourceFormInput, unknown, PlanIncomeSourceFormValues>({
    resolver: zodResolver(planIncomeSourceSchema),
    mode: 'onBlur',
    defaultValues: {
      name: defaultName ?? '',
      plannedAmount: defaultPlannedMinor === undefined ? '' : String(defaultPlannedMinor),
      categoryIds: defaultCategoryIds ?? [],
    },
  })

  // La advertencia aparece mientras se escribe, no al enviar: guardar un 0 es
  // legítimo, pero conviene saber qué significa antes de pulsar el botón.
  const parsedAmount = budgetAmountSchema.safeParse(watch('plannedAmount') ?? '')
  const isZero = parsedAmount.success && parsedAmount.data === 0

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) =>
        onSubmit({
          name: values.name,
          plannedMinor: values.plannedAmount,
          categoryIds: values.categoryIds,
        }),
      )}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="income-source-name">Nombre</Label>
        <Input
          id="income-source-name"
          autoComplete="off"
          placeholder="Ej. Salario"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'income-source-name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="income-source-name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="income-source-amount">Monto planeado</Label>
        <Input
          id="income-source-amount"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ej. 3.000.000"
          aria-invalid={!!errors.plannedAmount}
          aria-describedby={errors.plannedAmount ? 'income-source-amount-error' : undefined}
          {...register('plannedAmount')}
        />
        {errors.plannedAmount && (
          <p id="income-source-amount-error" className="text-sm text-destructive">
            {errors.plannedAmount.message}
          </p>
        )}
        {!errors.plannedAmount && isZero && (
          <p className="text-sm text-warning">{ZERO_INCOME_WARNING}</p>
        )}
      </div>

      <Controller
        control={control}
        name="categoryIds"
        render={({ field }) => {
          const selected = field.value ?? []

          return (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">
                Categorías de ingreso
              </legend>
              <p className="mb-1 text-xs text-muted-foreground">
                Opcional. Sirven para saber cuánto entró realmente por esta fuente. Una categoría
                solo puede alimentar una fuente del mes.
              </p>

              {categories.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                  No hay categorías de ingreso disponibles para vincular.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {categories.map((category) => (
                    <label
                      key={category.id}
                      className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary"
                        value={category.id}
                        checked={selected.includes(category.id)}
                        onChange={(event) =>
                          field.onChange(
                            event.target.checked
                              ? [...selected, category.id]
                              : selected.filter((id) => id !== category.id),
                          )
                        }
                      />
                      <span className="text-foreground">{category.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )
        }}
      />

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
