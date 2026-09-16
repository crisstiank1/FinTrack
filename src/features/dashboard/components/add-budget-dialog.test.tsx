import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AddBudgetDialog } from './add-budget-dialog'

const categories = [
  { id: 'cat-fun', name: 'Entretenimiento' },
  { id: 'cat-pets', name: 'Mascotas' },
]

function renderDialog(props: Partial<Parameters<typeof AddBudgetDialog>[0]> = {}) {
  const handlers = {
    onOpenChange: vi.fn(),
    onCreateCategory: vi.fn().mockResolvedValue({ id: 'cat-new', name: 'Gimnasio' }),
    onSaveBudget: vi.fn().mockResolvedValue(undefined),
  }

  render(
    <AddBudgetDialog
      open
      categories={categories}
      monthKey="2026-09"
      allowTemplate
      {...handlers}
      {...props}
    />,
  )

  return { ...handlers, ...props }
}

function dialog() {
  return within(screen.getByRole('dialog'))
}

describe('AddBudgetDialog', () => {
  it('pone presupuesto a una categoría existente sin presupuesto', async () => {
    const user = userEvent.setup()
    const { onSaveBudget, onOpenChange } = renderDialog()

    expect(dialog().getByText('Agregar presupuesto')).toBeInTheDocument()
    expect(dialog().getByRole('button', { name: 'Continuar' })).toBeDisabled()

    await user.selectOptions(dialog().getByLabelText('Categoría'), 'cat-pets')
    await user.click(dialog().getByRole('button', { name: 'Continuar' }))

    expect(dialog().getByText('Presupuesto de Mascotas')).toBeInTheDocument()
    // El importe lleva el «$» fijo de la variante del dashboard.
    expect(dialog().getByText('$')).toBeInTheDocument()

    await user.type(dialog().getByLabelText('Monto mensual'), '80000')
    await user.click(dialog().getByRole('button', { name: 'Guardar' }))

    expect(onSaveBudget).toHaveBeenCalledWith(
      { id: 'cat-pets', name: 'Mascotas' },
      { amountMinor: 80000, scope: 'template' },
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('conserva la elección entre plantilla y excepción del mes', async () => {
    const user = userEvent.setup()
    const { onSaveBudget } = renderDialog()

    await user.selectOptions(dialog().getByLabelText('Categoría'), 'cat-fun')
    await user.click(dialog().getByRole('button', { name: 'Continuar' }))
    await user.type(dialog().getByLabelText('Monto mensual'), '50000')
    await user.click(dialog().getByRole('radio', { name: /Solo este mes/ }))
    await user.click(dialog().getByRole('button', { name: 'Guardar' }))

    expect(onSaveBudget).toHaveBeenCalledWith(
      { id: 'cat-fun', name: 'Entretenimiento' },
      { amountMinor: 50000, scope: 'exception' },
    )
  })

  it('crea una categoría de gasto y la deja elegida para su presupuesto', async () => {
    const user = userEvent.setup()
    const { onCreateCategory, onSaveBudget } = renderDialog()

    await user.click(dialog().getByRole('button', { name: 'Crear categoría de gasto' }))

    expect(dialog().getByText('Crear categoría de gasto')).toBeInTheDocument()
    // No hay camino para crear una categoría de ingreso desde aquí.
    expect(dialog().queryByLabelText('Tipo')).not.toBeInTheDocument()

    await user.type(dialog().getByLabelText('Nombre'), 'Gimnasio')
    await user.click(dialog().getByRole('button', { name: 'Crear categoría' }))

    expect(onCreateCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Gimnasio', type: 'expense' }),
    )
    expect(await dialog().findByText('Presupuesto de Gimnasio')).toBeInTheDocument()

    await user.type(dialog().getByLabelText('Monto mensual'), '120000')
    await user.click(dialog().getByRole('button', { name: 'Guardar' }))

    expect(onSaveBudget).toHaveBeenCalledWith(
      { id: 'cat-new', name: 'Gimnasio' },
      { amountMinor: 120000, scope: 'template' },
    )
  })

  it('sin categorías disponibles solo ofrece crear una', () => {
    renderDialog({ categories: [] })

    expect(
      dialog().getByText('Todas tus categorías de gasto ya tienen presupuesto en este mes.'),
    ).toBeInTheDocument()
    expect(dialog().queryByLabelText('Categoría')).not.toBeInTheDocument()
    expect(dialog().getByRole('button', { name: 'Crear categoría de gasto' })).toBeInTheDocument()
  })

  it('si guardar falla, el diálogo sigue abierto', async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderDialog({
      onSaveBudget: vi.fn().mockRejectedValue(new Error('sin conexión')),
    })

    await user.selectOptions(dialog().getByLabelText('Categoría'), 'cat-fun')
    await user.click(dialog().getByRole('button', { name: 'Continuar' }))
    await user.type(dialog().getByLabelText('Monto mensual'), '50000')
    await user.click(dialog().getByRole('button', { name: 'Guardar' }))

    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(dialog().getByText('Presupuesto de Entretenimiento')).toBeInTheDocument()
  })

  it('en un mes cerrado solo deja ajustar ese mes', async () => {
    const user = userEvent.setup()
    renderDialog({ allowTemplate: false })

    await user.selectOptions(dialog().getByLabelText('Categoría'), 'cat-fun')
    await user.click(dialog().getByRole('button', { name: 'Continuar' }))

    expect(dialog().getByRole('radio', { name: /Solo este mes/ })).toBeChecked()
    expect(
      dialog().queryByRole('radio', { name: /Desde este mes en adelante/ }),
    ).not.toBeInTheDocument()
  })

  it('«Volver» regresa a la elección de categoría', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(dialog().getByRole('button', { name: 'Crear categoría de gasto' }))
    await user.click(dialog().getByRole('button', { name: 'Volver' }))

    expect(dialog().getByText('Agregar presupuesto')).toBeInTheDocument()
  })
})
