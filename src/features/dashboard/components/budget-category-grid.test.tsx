import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { BudgetProgress } from '@/features/budgets/progress'

import { BudgetCategoryGrid, type BudgetCategoryItem } from './budget-category-grid'

function item(
  overrides: Omit<Partial<BudgetCategoryItem>, 'progress'> & {
    progress?: Partial<BudgetProgress>
  } = {},
): BudgetCategoryItem {
  const { progress, ...rest } = overrides

  return {
    categoryId: 'cat-food',
    categoryName: 'Alimentación',
    isArchived: false,
    progress: {
      categoryId: 'cat-food',
      budgetMinor: 130_000,
      spentMinor: 120_000,
      remainingMinor: 10_000,
      ratio: 120_000 / 130_000,
      status: 'ok',
      source: 'template',
      ...progress,
    },
    ...rest,
  }
}

/** Presupuesto explícito de 0: sin barra, pero asignado. */
const enCero = item({
  categoryId: 'cat-gifts',
  categoryName: 'Regalos',
  progress: {
    categoryId: 'cat-gifts',
    budgetMinor: null,
    spentMinor: 20_000,
    remainingMinor: null,
    ratio: null,
    status: 'unbudgeted',
    source: 'exception',
  },
})

/** Celda de una categoría, por su nombre. */
function cell(name: string) {
  return within(screen.getByText(name).closest('li') as HTMLElement)
}

describe('BudgetCategoryGrid', () => {
  it('muestra la barra, lo gastado y lo presupuestado de cada categoría', () => {
    render(<BudgetCategoryGrid items={[item()]} currencyCode="COP" onEdit={vi.fn()} />)

    const celda = cell('Alimentación')
    expect(celda.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '92')
    expect(celda.getByText('COP 120.000')).toBeInTheDocument()
    expect(celda.getByText(/de COP 130\.000/)).toBeInTheDocument()
  })

  it('un presupuesto excedido dice por cuánto', () => {
    render(
      <BudgetCategoryGrid
        items={[
          item({
            progress: {
              budgetMinor: 100_000,
              spentMinor: 120_000,
              remainingMinor: -20_000,
              ratio: 1.2,
              status: 'over',
            },
          }),
        ]}
        currencyCode="COP"
        onEdit={vi.fn()}
      />,
    )

    expect(cell('Alimentación').getByText('Excedido por COP 20.000')).toBeInTheDocument()
  })

  it('un presupuesto de 0 se ve y lo dice con palabras, sin barra', () => {
    render(<BudgetCategoryGrid items={[enCero]} currencyCode="COP" onEdit={vi.fn()} />)

    const celda = cell('Regalos')
    expect(celda.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(celda.getByText(/Presupuesto en COP 0/)).toBeInTheDocument()
  })

  it('editar devuelve la categoría completa para abrir su formulario', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const alimentacion = item()
    render(<BudgetCategoryGrid items={[alimentacion]} currencyCode="COP" onEdit={onEdit} />)

    await user.click(screen.getByRole('button', { name: 'Editar presupuesto de Alimentación' }))

    expect(onEdit).toHaveBeenCalledWith(alimentacion)
  })

  it('no hay campos que editar en la celda: se edita en el diálogo', () => {
    render(<BudgetCategoryGrid items={[item()]} currencyCode="COP" onEdit={vi.fn()} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('marca las categorías archivadas', () => {
    render(
      <BudgetCategoryGrid
        items={[item({ categoryName: 'Antigua', isArchived: true })]}
        currencyCode="COP"
        onEdit={vi.fn()}
      />,
    )

    expect(cell('Antigua').getByText('Archivada')).toBeInTheDocument()
  })

  it('mientras se guarda no deja abrir otro presupuesto', () => {
    render(<BudgetCategoryGrid items={[item()]} currencyCode="COP" onEdit={vi.fn()} isSubmitting />)

    expect(
      screen.getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    ).toBeDisabled()
  })
})
