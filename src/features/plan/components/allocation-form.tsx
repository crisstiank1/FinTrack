import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useId } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'

import {
  ALLOCATION_GROUPS,
  resolveAllocation,
  type AllocationGroup,
} from '../calculations/allocation'
import { allocationGroupLabel, NO_PLANNED_INCOME_LABEL } from '../labels'
import { toAllocationBasisPoints, type AllocationPercentInput } from '../mutations'
import {
  allocationFormSchema,
  allocationPercentSchema,
  ALLOCATION_PRESET,
  ALLOCATION_SUM_ERROR,
  type AllocationFormInput,
  type AllocationFormValues,
} from '../schemas'

export interface AllocationFormSubmit {
  /** Porcentajes enteros por grupo. La conversión a puntos base va después. */
  percentages: AllocationPercentInput
}

interface AllocationFormProps {
  /**
   * Reparto guardado, en puntos base. Ausente en la primera configuración, y
   * entonces el formulario abre con el preset.
   */
  defaultPercentBp?: Partial<Record<AllocationGroup, number>>
  /** Ingreso planeado del mes. `null` cuando el mes no tiene ninguna fuente. */
  incomePlannedMinor: number | null
  currencyCode: string
  submitLabel?: string
  isSubmitting?: boolean
  onSubmit: (values: AllocationFormSubmit) => void | Promise<void>
}

/** Marcador del importe que todavía no se puede repartir. */
const NO_AMOUNT = '—'

/**
 * Puntos base guardados al porcentaje que se teclea: 5000 → '50'.
 *
 * Un valor que no sea múltiplo de 100 —que esta interfaz no puede producir,
 * pero la tabla sí admite— se muestra tal cual, con sus decimales. Es
 * deliberado: el campo enseña lo que hay guardado y Zod lo rechaza al intentar
 * guardarlo, en vez de redondearlo en silencio y cambiar un reparto que el
 * usuario no vino a tocar.
 */
function basisPointsToPercentInput(basisPoints: number): string {
  return String(basisPoints / 100)
}

/**
 * Los cinco porcentajes ya escritos, o `null` si alguno todavía no es un
 * número válido. Todo o nada: un total calculado sobre cuatro campos sería un
 * número que nunca llega a 100 y marcaría como erróneo un reparto a medio
 * escribir.
 */
function readPercentages(values: AllocationFormInput): AllocationPercentInput | null {
  const percentages = {} as AllocationPercentInput

  for (const group of ALLOCATION_GROUPS) {
    const result = allocationPercentSchema.safeParse(values[group] ?? '')
    if (!result.success) return null
    percentages[group] = result.data
  }

  return percentages
}

/**
 * Configuración y edición del reparto 50/30/20.
 *
 * Los cinco grupos siempre están presentes, incluidos los que valen 0: el
 * reparto se guarda entero, así que dejar uno fuera del formulario haría que
 * su cero pareciese un dato que falta.
 *
 * El usuario escribe **porcentajes enteros** y los importes se derivan con
 * `resolveAllocation`, la misma función que reparte en el bloque de lectura:
 * aquí no se multiplica nada a mano, y por eso lo que se previsualiza es
 * exactamente lo que después se verá guardado.
 *
 * Los importes solo aparecen cuando el total es 100 %. Fuera de ahí,
 * `resolveAllocation` queda fuera de sus precondiciones y su resultado, aunque
 * determinista, ya no significa «el reparto»: enseñarlo sería inventarse una
 * previsualización de un reparto que no se puede guardar.
 */
export function AllocationForm({
  defaultPercentBp,
  incomePlannedMinor,
  currencyCode,
  submitLabel = 'Guardar reparto',
  isSubmitting,
  onSubmit,
}: AllocationFormProps) {
  const fieldId = useId()

  const defaultValues = Object.fromEntries(
    ALLOCATION_GROUPS.map((group) => [
      group,
      defaultPercentBp
        ? basisPointsToPercentInput(defaultPercentBp[group] ?? 0)
        : String(ALLOCATION_PRESET[group]),
    ]),
  ) as AllocationFormInput

  const {
    register,
    handleSubmit,
    getValues,
    watch,
    formState: { errors },
  } = useForm<AllocationFormInput, unknown, AllocationFormValues>({
    resolver: zodResolver(allocationFormSchema),
    mode: 'onBlur',
    defaultValues,
  })

  // El total se recalcula mientras se escribe, no al enviar: saber cuánto falta
  // para 100 es justo lo que hace falta para decidir el siguiente número.
  const percentages = readPercentages(watch())

  const total = percentages
    ? ALLOCATION_GROUPS.reduce((sum, group) => sum + percentages[group], 0)
    : null
  const isComplete = total === 100

  const amounts =
    percentages && isComplete && incomePlannedMinor !== null
      ? resolveAllocation(incomePlannedMinor, toAllocationBasisPoints(percentages))
      : null

  /**
   * Importe de un grupo, y por qué falta cuando falta. Las dos causas son
   * distintas y se dicen distinto: el mes no tiene ingreso que repartir, o el
   * reparto todavía no cuadra.
   */
  function amountLabel(group: AllocationGroup): string {
    if (incomePlannedMinor === null) return NO_PLANNED_INCOME_LABEL
    if (!amounts) return NO_AMOUNT
    return formatAmount(amounts[group], currencyCode)
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(() => {
        // El esquema completo se vuelve a aplicar aquí, y el resultado de
        // `handleSubmit` se ignora a propósito. React Hook Form reserva `root`
        // para errores globales y **no lo cuenta** al decidir si el formulario
        // es válido, así que el fallo del total llega hasta este punto: sin
        // este parse, un reparto que suma 110 % se enviaría con los cinco
        // porcentajes sin definir y acabaría en `percent_bp: NaN`.
        const result = allocationFormSchema.safeParse(getValues())
        if (!result.success) return

        onSubmit({ percentages: result.data })
      })}
      noValidate
    >
      <p className="text-sm text-muted-foreground">
        Reparte tu ingreso planeado entre los cinco grupos. Los porcentajes son enteros y tienen que
        sumar 100 %; un grupo puede quedarse en 0 %.
      </p>

      <div className="flex flex-col gap-3">
        {ALLOCATION_GROUPS.map((group) => {
          const error = errors[group]

          return (
            <div key={group} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Label htmlFor={`${fieldId}-${group}`} className="min-w-28 flex-1">
                {allocationGroupLabel[group]}
              </Label>

              <div className="flex items-center gap-1">
                <Input
                  id={`${fieldId}-${group}`}
                  className="w-20 text-right"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-invalid={!!error}
                  // El importe derivado describe al campo: quien use un lector
                  // de pantalla oye «Necesidades, 50, COP 700.000» sin tener
                  // que ir a buscar la cifra que su porcentaje produce.
                  aria-describedby={[
                    `${fieldId}-${group}-amount`,
                    error ? `${fieldId}-${group}-error` : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  {...register(group)}
                />
                <span aria-hidden="true" className="text-sm text-muted-foreground">
                  %
                </span>
              </div>

              <span
                id={`${fieldId}-${group}-amount`}
                className="w-32 text-right text-sm tabular-nums text-muted-foreground"
              >
                {amountLabel(group)}
              </span>

              {error && (
                <p
                  id={`${fieldId}-${group}-error`}
                  className="w-full text-sm text-destructive"
                  role="alert"
                >
                  {error.message}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* El total se anuncia como estado en vivo: cambia al teclear y es el
          dato que decide si el botón va a servir de algo. */}
      <div
        role="status"
        className="flex items-center justify-between gap-3 border-t border-border pt-3 text-sm"
      >
        <span className="font-medium text-foreground">Total</span>
        <span
          className={cn(
            'tabular-nums font-semibold',
            isComplete ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {total === null ? NO_AMOUNT : `${total} %`}
        </span>
      </div>

      {/* El fallo del total no pertenece a ningún grupo: no sobra en uno ni
          falta en otro, la suma es la que está mal. */}
      {total !== null && !isComplete && (
        <p className="text-sm text-destructive">{ALLOCATION_SUM_ERROR}</p>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
