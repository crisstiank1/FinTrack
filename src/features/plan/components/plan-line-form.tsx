import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatAmount } from '@/lib/currency'
import { monthRange } from '@/lib/dates'

import { CATEGORY_LINE_KINDS, type CategoryLineKind } from '../mutations'
import { buildPlanLineSchema, type PlanLineFormInput, type PlanLineFormValues } from '../schemas'

export interface PlanLineFormSubmit {
  name: string
  kind: CategoryLineKind
  categoryId: string
  dueDate: string | null
}

/** Categoría ofrecida por el selector, ya filtrada por quien llama. */
export interface SelectableLineCategory {
  id: string
  name: string
}

const KIND_LABEL: Record<CategoryLineKind, string> = {
  bill: 'Factura',
  variable: 'Gasto variable',
}

const KIND_HINT: Record<CategoryLineKind, string> = {
  bill: 'Un gasto que se repite y tiene una fecha esperada.',
  variable: 'Un gasto que varía cada mes y no tiene fecha fija.',
}

interface PlanLineFormProps {
  /** Mes del plan. Acota la fecha esperada y no se puede cambiar aquí. */
  monthKey: string
  /** Categorías de gasto activas y libres este mes. Vacío al editar. */
  categories: SelectableLineCategory[]
  /** Presupuesto efectivo de una categoría, o `null` si no tiene este mes. */
  budgetForCategory: (categoryId: string) => number | null
  currencyCode: string
  /** Al editar: los valores actuales, con la categoría y el tipo ya fijados. */
  defaultValues?: {
    name: string
    kind: CategoryLineKind
    categoryId: string
    dueDate: string | null
  }
  /** Nombre de la categoría al editar, que ya no es seleccionable. */
  lockedCategoryName?: string
  submitLabel?: string
  isSubmitting?: boolean
  onSubmit: (values: PlanLineFormSubmit) => void | Promise<void>
}

/**
 * Alta y edición de una línea de factura o gasto variable.
 *
 * **No tiene campo de importe.** C7 prohíbe que una línea medida por categoría
 * lleve cifra propia: la suya vive en `budgets` y solo ahí. En su lugar, el
 * formulario muestra el presupuesto efectivo ya resuelto y enlaza a
 * `/budgets`, para que quede claro dónde se cambia.
 *
 * Tampoco tiene campo «Actual»: ese valor no se guarda, se calcula desde
 * `transactions`.
 *
 * Al editar, la categoría y el tipo se muestran como contexto y no como
 * controles. Cambiarlos sería estrenar el destino para el trigger T3, chocaría
 * con U10 y reescribiría en silencio qué movimientos describe la línea.
 */
export function PlanLineForm({
  monthKey,
  categories,
  budgetForCategory,
  currencyCode,
  defaultValues,
  lockedCategoryName,
  submitLabel = 'Guardar',
  isSubmitting,
  onSubmit,
}: PlanLineFormProps) {
  const fieldId = useId()
  const isEditing = defaultValues !== undefined
  const { start, end } = monthRange(monthKey)

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PlanLineFormInput, unknown, PlanLineFormValues>({
    resolver: zodResolver(buildPlanLineSchema(monthKey)),
    mode: 'onBlur',
    defaultValues: {
      name: defaultValues?.name ?? '',
      kind: defaultValues?.kind ?? 'bill',
      categoryId: defaultValues?.categoryId ?? '',
      dueDate: defaultValues?.dueDate ?? '',
    },
  })

  const kind = watch('kind')
  const categoryId = watch('categoryId')
  const budgetMinor = categoryId ? budgetForCategory(categoryId) : null

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) =>
        onSubmit({
          name: values.name,
          kind: values.kind,
          categoryId: values.categoryId,
          dueDate: values.dueDate,
        }),
      )}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${fieldId}-name`}>Nombre</Label>
        <Input
          id={`${fieldId}-name`}
          autoComplete="off"
          placeholder="Ej. Arriendo"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? `${fieldId}-name-error` : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id={`${fieldId}-name-error`} className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>

      {/* El tipo se elige una sola vez. Al editar se enuncia, no se ofrece:
          cambiarlo es estrenar el destino y hay que borrar y crear. */}
      {isEditing ? (
        <p className="text-sm text-muted-foreground">
          Tipo: <span className="font-medium text-foreground">{KIND_LABEL[kind]}</span>. Para
          cambiarlo, elimina la línea y crea otra.
        </p>
      ) : (
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-foreground">Tipo</legend>
              <div className="flex flex-col gap-1">
                {CATEGORY_LINE_KINDS.map((option) => (
                  <label
                    key={option}
                    className="flex items-start gap-2 rounded-lg border border-border p-2 text-sm"
                  >
                    <input
                      type="radio"
                      className="mt-1 accent-primary"
                      value={option}
                      checked={field.value === option}
                      onChange={() => field.onChange(option)}
                    />
                    <span>
                      <span className="block text-foreground">{KIND_LABEL[option]}</span>
                      <span className="block text-xs text-muted-foreground">
                        {KIND_HINT[option]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        />
      )}

      {isEditing ? (
        <p className="text-sm text-muted-foreground">
          Categoría: <span className="font-medium text-foreground">{lockedCategoryName}</span>. Para
          cambiarla, elimina la línea y crea otra.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-category`}>Categoría</Label>
          {categories.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              No quedan categorías de gasto libres este mes. Cada categoría puede tener una sola
              línea.
            </p>
          ) : (
            <select
              id={`${fieldId}-category`}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
              aria-invalid={!!errors.categoryId}
              aria-describedby={errors.categoryId ? `${fieldId}-category-error` : undefined}
              {...register('categoryId')}
            >
              <option value="">Selecciona una categoría</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          )}
          {errors.categoryId && (
            <p id={`${fieldId}-category-error`} className="text-sm text-destructive">
              {errors.categoryId.message}
            </p>
          )}
        </div>
      )}

      {/* La fecha solo existe en una factura. En una variable no se pinta ni se
          registra: C3 la rechaza, y un campo visible pero inerte solo invita a
          preguntarse por qué no se puede rellenar. */}
      {kind === 'bill' && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-due-date`}>Fecha esperada (opcional)</Label>
          <Input
            id={`${fieldId}-due-date`}
            type="date"
            min={start}
            max={end}
            aria-invalid={!!errors.dueDate}
            aria-describedby={errors.dueDate ? `${fieldId}-due-date-error` : undefined}
            {...register('dueDate')}
          />
          {errors.dueDate && (
            <p id={`${fieldId}-due-date-error`} className="text-sm text-destructive">
              {errors.dueDate.message}
            </p>
          )}
        </div>
      )}

      {/* Ninguna línea lleva importe propio. Esta nota es lo que evita buscar
          un campo que el esquema prohíbe. */}
      <p className="rounded-lg border border-border bg-surface-elevated p-3 text-sm text-muted-foreground">
        El importe planeado de esta línea sale del presupuesto de su categoría.{' '}
        {categoryId ? (
          <>
            Ahora mismo:{' '}
            <span className="font-medium text-foreground">
              {budgetMinor === null
                ? 'Sin presupuesto este mes'
                : formatAmount(budgetMinor, currencyCode)}
            </span>
            .{' '}
          </>
        ) : null}
        <Link to="/budgets" className="font-medium text-primary underline underline-offset-4">
          Editar en Presupuestos
        </Link>
      </p>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
