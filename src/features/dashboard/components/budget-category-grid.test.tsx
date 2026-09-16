import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { BudgetProgress } from '@/features/budgets/progress'

import { BudgetCategoryGrid, type BudgetCategoryItem } from './budget-category-grid'

function item(
  overrides: Partial<BudgetCategoryItem> & { progress?: Partial<BudgetProgress> } = {},
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
      status: 'warning_90',
      source: 'template',
      ...progress,
    },
    ...rest,
  }
}

const sinPresupuesto = item({
  categoryId: 'cat-fun',
  categoryName: 'Ocio',
  progress: {
    categoryId: 'cat-fun',
    budgetMinor: null,
    spentMinor: 30_000,
    remainingMinor: null,
    ratio: null,
    status: 'unbudgeted',
    source: null,
  },
})

const month = '2026-09'

function renderGrid(props: Partial<Parameters<typeof BudgetCategoryGrid>[0]> = {}) {
  const onSave = props.onSave ?? vi.fn()

  render(
    <BudgetCategoryGrid
      items={[item(), sinPresupuesto]}
      currencyCode="COP"
      monthKey={month}
      allowTemplate
      {...props}
      onSave={onSave}
    />,
  )

  return onSave
}

/** Celda de una categoría, por su nombre. */
function cell(name: string) {
  return within(screen.getByText(name).closest('li') as HTMLElement)
}

describe('BudgetCategoryGrid', () => {
  it('lista todas las categorías, con presupuesto y sin él', () => {
    renderGrid()

    expect(cell('Alimentación').getByRole('progressbar')).toHaveAttribute('aria-valuenow', '92')
    // Sin presupuesto no se dibuja una barra al 0 %: se dice con palabras.
    expect(cell('Ocio').queryByRole('progressbar')).not.toBeInTheDocument()
    expect(cell('Ocio').getByText('Sin presupuesto este mes')).toBeInTheDocument()
    expect(cell('Ocio').getByText('COP 30.000')).toBeInTheDocument()
  })

  it('cada celda trae su importe, y la que no tiene presupuesto queda vacía', () => {
    renderGrid()

    expect((screen.getByLabelText('Presupuesto de Alimentación') as HTMLInputElement).value).toBe(
      '130000',
    )
    expect((screen.getByLabelText('Presupuesto de Ocio') as HTMLInputElement).value).toBe('')
  })

  it('el alcance y «Guardar» aparecen solo en la celda que se está tocando', async () => {
    const user = userEvent.setup()
    renderGrid()

    expect(screen.queryByRole('button', { name: 'Guardar' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Presupuesto de Ocio'), '80000')

    // Una sola celda abierta: un «Guardar» y un juego de alcances en toda la rejilla.
    expect(screen.getAllByRole('button', { name: 'Guardar' })).toHaveLength(1)
    expect(cell('Ocio').getByRole('radio', { name: 'Desde este mes en adelante' })).toBeChecked()
    expect(cell('Alimentación').queryByRole('radio')).not.toBeInTheDocument()
  })

  it('guarda el importe escrito con el alcance elegido', async () => {
    const user = userEvent.setup()
    const onSave = renderGrid()

    const campo = screen.getByLabelText('Presupuesto de Alimentación')
    await user.clear(campo)
    await user.type(campo, '150000')
    await user.click(cell('Alimentación').getByRole('radio', { name: 'Solo este mes' }))
    await user.click(cell('Alimentación').getByRole('button', { name: 'Guardar' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'cat-food' }), {
      amount: 150000,
      scope: 'exception',
    })
  })

  it('en un mes cerrado solo deja ajustar ese mes', async () => {
    const user = userEvent.setup()
    renderGrid({ allowTemplate: false })

    await user.type(screen.getByLabelText('Presupuesto de Ocio'), '80000')

    const celda = cell('Ocio')
    expect(celda.getByRole('radio', { name: 'Solo este mes' })).toBeChecked()
    expect(
      celda.queryByRole('radio', { name: 'Desde este mes en adelante' }),
    ).not.toBeInTheDocument()
    expect(celda.getByText(/ya pasó: solo puedes ajustar ese mes/)).toBeInTheDocument()
  })

  it('un importe con decimales no se guarda y se explica por qué', async () => {
    const user = userEvent.setup()
    const onSave = renderGrid()

    await user.type(screen.getByLabelText('Presupuesto de Ocio'), '80,5')
    await user.click(cell('Ocio').getByRole('button', { name: 'Guardar' }))

    expect(cell('Ocio').getByText(/sin decimales/)).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('avisa de lo que significa un presupuesto en 0', async () => {
    const user = userEvent.setup()
    renderGrid()

    await user.type(screen.getByLabelText('Presupuesto de Ocio'), '0')

    expect(cell('Ocio').getByText(/no tendrá barra, porcentaje ni alertas/)).toBeInTheDocument()
  })

  it('«Cancelar» cierra la celda y devuelve el importe guardado', async () => {
    const user = userEvent.setup()
    const onSave = renderGrid()

    const campo = screen.getByLabelText('Presupuesto de Alimentación')
    await user.clear(campo)
    await user.type(campo, '999')
    await user.click(cell('Alimentación').getByRole('button', { name: 'Cancelar' }))

    expect((screen.getByLabelText('Presupuesto de Alimentación') as HTMLInputElement).value).toBe(
      '130000',
    )
    expect(onSave).not.toHaveBeenCalled()
  })

  it('marca las categorías archivadas', () => {
    render(
      <BudgetCategoryGrid
        items={[item({ categoryName: 'Antigua', isArchived: true })]}
        currencyCode="COP"
        monthKey={month}
        allowTemplate
        onSave={vi.fn()}
      />,
    )

    expect(cell('Antigua').getByText('Archivada')).toBeInTheDocument()
  })

  it('mientras se guarda no deja volver a enviar', async () => {
    const user = userEvent.setup()
    renderGrid({ isSubmitting: true })

    await user.type(screen.getByLabelText('Presupuesto de Ocio'), '80000')

    expect(cell('Ocio').getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })
})
