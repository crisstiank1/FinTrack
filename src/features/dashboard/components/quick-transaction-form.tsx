import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus } from 'lucide-react'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { AmountInput } from '@/features/dashboard/components/amount-input'
import { CategoryChips, type CategoryChip } from '@/features/dashboard/components/category-chips'
import {
  transactionDefaultValues,
  transactionSchema,
  type TransactionFormValues,
} from '@/features/transactions/schemas'
import { formatAmount } from '@/lib/currency'
import type { Tables } from '@/types/database.types'

/** Lo que se guarda como descripción cuando la nota queda vacía. */
export const EMPTY_NOTE_HINT = 'Si la dejas vacía, se guarda el nombre de la categoría.'

interface QuickTransactionFormProps {
  accounts: Tables<'accounts'>[]
  categories: Tables<'categories'>[]
  /** Moneda del importe mientras no hay cuenta elegida. */
  currencyCode: string
  /** Categorías por uso reciente: deciden qué chips se ven sin desplegar «Más…». */
  frequentCategoryIds?: string[]
  onSubmit: (values: TransactionFormValues) => Promise<void> | void
  isSubmitting?: boolean
}

/**
 * Alta de un movimiento sin salir del dashboard.
 *
 * Comparte `transactionSchema` y la mutación con el formulario completo de
 * `/transactions`: lo que cambia es la forma de pedirlo, no lo que se considera
 * válido. Aquí el importe manda —va primero y en grande—, la categoría se elige
 * con un toque y la descripción se deduce, porque anotar un gasto tiene que
 * costar menos que el gasto.
 */
export function QuickTransactionForm({
  accounts,
  categories,
  currencyCode,
  frequentCategoryIds,
  onSubmit,
  isSubmitting,
}: QuickTransactionFormProps) {
  const activeAccounts = useMemo(
    () => accounts.filter((account) => !account.is_archived),
    [accounts],
  )

  // La cuenta por defecto es la primera en la moneda de la vista: así el importe
  // que se escribe es el que el usuario está viendo en las cifras de arriba.
  const defaultAccountId =
    activeAccounts.find((account) => account.currency_code === currencyCode)?.id ??
    activeAccounts[0]?.id ??
    ''

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof transactionSchema>, unknown, TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    mode: 'onBlur',
    // `categoryId` y `description` arrancan vacíos, no ausentes: con `undefined`
    // Zod respondería con su mensaje genérico de tipo en vez del redactado.
    defaultValues: {
      ...transactionDefaultValues,
      accountId: defaultAccountId,
      categoryId: '',
      description: '',
    },
  })

  const type = watch('type')
  const amount = Number(watch('amount')) || 0
  const accountId = watch('accountId')
  const categoryId = watch('categoryId')

  // La nota vive aparte del formulario: se guarda como descripción, y si queda
  // vacía manda el nombre de la categoría. Así el movimiento nunca se registra
  // sin descripción, que es lo que el esquema exige, sin pedirla dos veces.
  const [note, setNote] = useState('')

  const amountCurrency =
    activeAccounts.find((account) => account.id === accountId)?.currency_code ?? currencyCode

  const chips = useMemo<CategoryChip[]>(() => {
    const ofType = categories.filter((category) => category.type === type && !category.is_archived)
    const rank = (id: string) => {
      const index = frequentCategoryIds?.indexOf(id) ?? -1
      return index === -1 ? Number.MAX_SAFE_INTEGER : index
    }

    // Primero las más usadas del mes; las demás, y todas si el mes no tiene
    // movimientos, en orden alfabético. Se ordena aquí y no se confía en el
    // orden de llegada, para que la lista no dependa de cómo se consultó.
    return [...ofType]
      .sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, 'es'))
      .map((category) => ({ id: category.id, name: category.name, icon: category.icon }))
  }, [categories, type, frequentCategoryIds])

  const selectedCategoryName = chips.find((chip) => chip.id === categoryId)?.name ?? ''

  useEffect(() => {
    setValue('description', note.trim() || selectedCategoryName)
  }, [note, selectedCategoryName, setValue])

  // Las cuentas llegan después del primer render: si la que venía por defecto
  // no existía todavía, se elige en cuanto aparece.
  useEffect(() => {
    if (!accountId && defaultAccountId) setValue('accountId', defaultAccountId)
  }, [accountId, defaultAccountId, setValue])

  function handleTypeChange(nextType: 'income' | 'expense') {
    setValue('type', nextType, { shouldValidate: false })
    setValue('categoryId', '', { shouldValidate: false })
  }

  async function submit(values: TransactionFormValues) {
    try {
      await onSubmit(values)
    } catch {
      // Quien llama ya avisó del error; lo escrito se conserva para reintentar.
      return
    }

    // Se conservan tipo, cuenta y fecha: lo habitual es anotar varios gastos
    // seguidos del mismo día.
    setNote('')
    reset({
      ...transactionDefaultValues,
      type: values.type,
      accountId: values.accountId,
      transactionDate: values.transactionDate,
      categoryId: '',
      amount: 0,
    })
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit(submit)} noValidate>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de movimiento">
        <Button
          type="button"
          role="radio"
          size="sm"
          aria-checked={type === 'expense'}
          variant={type === 'expense' ? 'default' : 'outline'}
          onClick={() => handleTypeChange('expense')}
        >
          Gasto
        </Button>
        <Button
          type="button"
          role="radio"
          size="sm"
          aria-checked={type === 'income'}
          variant={type === 'income' ? 'default' : 'outline'}
          onClick={() => handleTypeChange('income')}
        >
          Ingreso
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quick-account">Cuenta</Label>
        {/* El nombre accesible incluye «del movimiento» porque el selector de la
            columna es otro «Cuenta» y filtra la vista en vez de elegir dónde se
            registra. El rótulo visible sigue siendo el corto. */}
        <Select
          id="quick-account"
          aria-label="Cuenta del movimiento"
          aria-invalid={!!errors.accountId}
          {...register('accountId')}
        >
          <option value="">Selecciona...</option>
          {activeAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
        {errors.accountId && <p className="text-sm text-destructive">{errors.accountId.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        {/* La etiqueta dice la moneda: el «$» es el mismo en COP, USD y ARS y
            no la distingue. FinTrack no convierte, así que el texto de debajo
            dice cómo se registrará, no a cuánto equivale. */}
        <Label htmlFor="quick-amount">Monto ({amountCurrency})</Label>
        <AmountInput
          id="quick-amount"
          aria-invalid={!!errors.amount}
          aria-describedby="quick-amount-hint"
          currency={amountCurrency}
          value={amount}
          onChange={(value) => setValue('amount', value, { shouldValidate: true })}
          className="h-12 text-xl font-semibold tabular-nums"
        />
        {errors.amount ? (
          <p id="quick-amount-hint" className="text-sm text-destructive">
            {errors.amount.message}
          </p>
        ) : (
          <p id="quick-amount-hint" className="text-xs text-muted-foreground">
            {amount > 0
              ? `Se registrará como ${formatAmount(amount, amountCurrency)}`
              : `Se registrará en ${amountCurrency}`}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {/* Rótulo visual: el nombre accesible del grupo lo pone `CategoryChips`
            con su propio `aria-label`, así no se anuncia dos veces. */}
        <span className="text-sm font-medium leading-none text-foreground">Categoría</span>
        {/* La lista cambia entera al cambiar de tipo: se remonta para que «Más…»
            no siga desplegado sobre categorías que ya no son las de antes. */}
        <CategoryChips
          key={type}
          categories={chips}
          value={categoryId || undefined}
          onChange={(category) => setValue('categoryId', category.id, { shouldValidate: true })}
        />
        {errors.categoryId && (
          <p className="text-sm text-destructive">{errors.categoryId.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quick-date">Fecha</Label>
        <Input
          id="quick-date"
          type="date"
          aria-invalid={!!errors.transactionDate}
          {...register('transactionDate')}
        />
        {errors.transactionDate && (
          <p className="text-sm text-destructive">{errors.transactionDate.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quick-note">Nota (opcional)</Label>
        <Input
          id="quick-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="ej. supermercado del sábado"
          aria-invalid={!!errors.description}
        />
        {errors.description ? (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{EMPTY_NOTE_HINT}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
        Agregar
      </Button>
    </form>
  )
}
