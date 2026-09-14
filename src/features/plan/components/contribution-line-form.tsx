import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useId } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import {
  contributionLineLabel,
  lockedContributionAccountLabel,
  CONTRIBUTION_LINE_AMOUNT_LABEL,
  CONTRIBUTION_LINE_NAME_LABEL,
  CONTRIBUTION_LINE_NAME_PLACEHOLDER,
} from '../labels'
import type { ContributionLineKind } from '../mutations'
import {
  contributionLineSchema,
  type ContributionLineFormInput,
  type ContributionLineFormValues,
} from '../schemas'

export interface ContributionLineFormSubmit {
  name: string
  accountId: string
  plannedMinor: number
}

/** Cuenta ofrecida por el selector, ya filtrada por quien llama. */
export interface SelectableContributionAccount {
  id: string
  name: string
}

interface ContributionLineFormProps {
  /** Ahorro o inversión. Lo fija el botón que abrió el formulario. */
  kind: ContributionLineKind
  /** Cuentas del tipo, activas y libres este mes. Vacío al editar. */
  accounts: SelectableContributionAccount[]
  /** Al editar: los valores actuales, con la cuenta ya fijada. */
  defaultValues?: {
    name: string
    accountId: string
    plannedMinor: number
  }
  /** Nombre de la cuenta al editar, que ya no es seleccionable. */
  lockedAccountName?: string
  submitLabel?: string
  isSubmitting?: boolean
  onSubmit: (values: ContributionLineFormSubmit) => void | Promise<void>
}

/**
 * Alta y edición de un aporte planeado a ahorro o inversión.
 *
 * A diferencia de una línea de gasto, **aquí sí hay importe**: un aporte se
 * mide por cuenta y su cifra planeada vive en la propia línea. El importe es un
 * campo de texto, como en las fuentes de ingreso: vacío es un error y 0 es un
 * aporte planeado de cero.
 *
 * El selector solo muestra lo que el servidor aceptaría —cuentas del tipo, sin
 * archivar y sin aporte este mes— y ese filtrado lo hace quien llama con
 * `selectAvailableContributionAccounts`. Al editar, la cuenta se enuncia en vez
 * de ofrecerse: cambiarla es otro aporte.
 */
export function ContributionLineForm({
  kind,
  accounts,
  defaultValues,
  lockedAccountName,
  submitLabel = 'Guardar',
  isSubmitting,
  onSubmit,
}: ContributionLineFormProps) {
  const fieldId = useId()
  const isEditing = defaultValues !== undefined
  const labels = contributionLineLabel[kind]

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContributionLineFormInput, unknown, ContributionLineFormValues>({
    resolver: zodResolver(contributionLineSchema),
    mode: 'onBlur',
    defaultValues: {
      name: defaultValues?.name ?? '',
      accountId: defaultValues?.accountId ?? '',
      plannedAmount: defaultValues === undefined ? '' : String(defaultValues.plannedMinor),
    },
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit((values) =>
        onSubmit({
          name: values.name,
          accountId: values.accountId,
          plannedMinor: values.plannedAmount,
        }),
      )}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${fieldId}-name`}>{CONTRIBUTION_LINE_NAME_LABEL}</Label>
        <Input
          id={`${fieldId}-name`}
          autoComplete="off"
          placeholder={CONTRIBUTION_LINE_NAME_PLACEHOLDER}
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

      {isEditing ? (
        <p className="text-sm text-muted-foreground">
          {lockedContributionAccountLabel(lockedAccountName ?? '')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${fieldId}-account`}>{labels.accountField}</Label>
          <select
            id={`${fieldId}-account`}
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
            aria-invalid={!!errors.accountId}
            aria-describedby={errors.accountId ? `${fieldId}-account-error` : undefined}
            {...register('accountId')}
          >
            <option value="">Selecciona una cuenta</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          {errors.accountId && (
            <p id={`${fieldId}-account-error`} className="text-sm text-destructive">
              {errors.accountId.message}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${fieldId}-amount`}>{CONTRIBUTION_LINE_AMOUNT_LABEL}</Label>
        <Input
          id={`${fieldId}-amount`}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Ej. 500.000"
          aria-invalid={!!errors.plannedAmount}
          aria-describedby={errors.plannedAmount ? `${fieldId}-amount-error` : undefined}
          {...register('plannedAmount')}
        />
        {errors.plannedAmount && (
          <p id={`${fieldId}-amount-error`} className="text-sm text-destructive">
            {errors.plannedAmount.message}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {submitLabel}
      </Button>
    </form>
  )
}
