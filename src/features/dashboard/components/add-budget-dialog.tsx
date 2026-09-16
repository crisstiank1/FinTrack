import { useState } from 'react'
import { ArrowLeft, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { BudgetForm, type BudgetFormSubmit } from '@/features/budgets/components/budget-form'
import { CategoryForm } from '@/features/categories/components/category-form'
import type { CategoryFormValues } from '@/features/categories/schemas'
import { formatMonthLabel } from '@/lib/dates'

/** Categoría a la que se le puede poner presupuesto. */
export interface BudgetCategoryOption {
  id: string
  name: string
}

interface AddBudgetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Categorías de gasto activas que todavía no tienen presupuesto en el mes. */
  categories: BudgetCategoryOption[]
  monthKey: string
  /** `false` en un mes cerrado: solo cabe la excepción (ver `BudgetForm`). */
  allowTemplate: boolean
  /** Crea la categoría y la devuelve. Si falla, lanza: el diálogo no avanza. */
  onCreateCategory: (values: CategoryFormValues) => Promise<BudgetCategoryOption>
  /** Guarda el presupuesto. Si falla, lanza: el diálogo sigue abierto. */
  onSaveBudget: (category: BudgetCategoryOption, values: BudgetFormSubmit) => Promise<void>
  isCreatingCategory?: boolean
  isSavingBudget?: boolean
}

/**
 * «Agregar presupuesto» desde el dashboard.
 *
 * Tres pasos, y ninguno reimplementa nada: elegir una categoría de gasto sin
 * presupuesto —o crearla con `CategoryForm`, con el tipo fijado en gasto—, y
 * poner el importe con `BudgetForm`, que conserva la elección entre versionar la
 * plantilla y fijar la excepción del mes.
 *
 * El contenido se monta al abrir: cada apertura empieza en el primer paso, sin
 * restos de la anterior.
 */
export function AddBudgetDialog({ open, onOpenChange, ...flow }: AddBudgetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <AddBudgetFlow {...flow} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

type Step = 'choose' | 'create' | 'amount'

function AddBudgetFlow({
  categories,
  monthKey,
  allowTemplate,
  onCreateCategory,
  onSaveBudget,
  isCreatingCategory,
  isSavingBudget,
  onDone,
}: Omit<AddBudgetDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [step, setStep] = useState<Step>('choose')
  const [chosenId, setChosenId] = useState('')
  const [selected, setSelected] = useState<BudgetCategoryOption | null>(null)
  const monthLabel = formatMonthLabel(monthKey)

  if (step === 'create') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Crear categoría de gasto</DialogTitle>
          <DialogDescription>Al crearla podrás ponerle su presupuesto.</DialogDescription>
        </DialogHeader>
        <CategoryForm
          fixedType="expense"
          submitLabel="Crear categoría"
          isSubmitting={isCreatingCategory}
          onSubmit={async (values) => {
            try {
              const created = await onCreateCategory(values)
              // Recién creada, queda elegida: el paso siguiente es su presupuesto.
              setSelected(created)
              setStep('amount')
            } catch {
              // Quien llama ya avisó; lo escrito se conserva para reintentar.
            }
          }}
        />
        <BackButton onClick={() => setStep('choose')} />
      </>
    )
  }

  if (step === 'amount' && selected) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Presupuesto de {selected.name}</DialogTitle>
        </DialogHeader>
        <BudgetForm
          monthKey={monthKey}
          allowTemplate={allowTemplate}
          amountInputVariant="symbol"
          isSubmitting={isSavingBudget}
          onSubmit={async (values) => {
            try {
              await onSaveBudget(selected, values)
              onDone()
            } catch {
              // Quien llama ya avisó; el diálogo sigue abierto para reintentar.
            }
          }}
        />
        <BackButton onClick={() => setStep('choose')} />
      </>
    )
  }

  const chosen = categories.find((category) => category.id === chosenId)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agregar presupuesto</DialogTitle>
        <DialogDescription className="first-letter:uppercase">
          {monthLabel}: elige una categoría de gasto o crea una nueva.
        </DialogDescription>
      </DialogHeader>

      {categories.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="add-budget-category">Categoría</Label>
          <Select
            id="add-budget-category"
            value={chosenId}
            onChange={(event) => setChosenId(event.target.value)}
          >
            <option value="">Selecciona...</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return
              setSelected(chosen)
              setStep('amount')
            }}
          >
            Continuar
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Todas tus categorías de gasto ya tienen presupuesto en este mes.
        </p>
      )}

      <Button type="button" variant="outline" onClick={() => setStep('create')}>
        <Plus className="size-4" aria-hidden="true" />
        Crear categoría de gasto
      </Button>
    </>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onClick}>
      <ArrowLeft className="size-4" aria-hidden="true" />
      Volver
    </Button>
  )
}
