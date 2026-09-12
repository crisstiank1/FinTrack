import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlanLineForm, type PlanLineFormSubmit } from './plan-line-form'

const onSubmit = vi.fn()

const categories = [
  { id: 'cat-vivienda', name: 'Vivienda' },
  { id: 'cat-mercado', name: 'Alimentación' },
]

const budgets: Record<string, number | null> = {
  'cat-vivienda': 900_000,
  'cat-mercado': null,
}

function renderForm(props: Partial<Parameters<typeof PlanLineForm>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PlanLineForm
        monthKey="2026-09"
        categories={categories}
        budgetForCategory={(categoryId) => budgets[categoryId] ?? null}
        currencyCode="COP"
        onSubmit={onSubmit}
        {...props}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  onSubmit.mockReset()
})

describe('PlanLineForm', () => {
  it('no tiene ningún campo de importe: la cifra vive en el presupuesto', () => {
    renderForm()

    expect(screen.queryByLabelText(/monto/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/importe/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/presupuesto/i)).not.toBeInTheDocument()
    expect(screen.getByText(/sale del presupuesto de su categoría/i)).toBeInTheDocument()
  })

  it('tampoco tiene campo «Actual»', () => {
    renderForm()

    expect(screen.queryByLabelText(/actual/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/gastado/i)).not.toBeInTheDocument()
  })

  it('una factura muestra la fecha esperada, acotada al mes del plan', () => {
    renderForm()

    const fecha = screen.getByLabelText(/Fecha esperada/)

    expect(fecha).toHaveAttribute('type', 'date')
    expect(fecha).toHaveAttribute('min', '2026-09-01')
    expect(fecha).toHaveAttribute('max', '2026-09-30')
  })

  it('un gasto variable no pinta el campo de fecha en absoluto', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('radio', { name: /Gasto variable/ }))

    expect(screen.queryByLabelText(/Fecha esperada/)).not.toBeInTheDocument()
  })

  it('guarda una factura con su fecha', async () => {
    const user = userEvent.setup()
    renderForm({ submitLabel: 'Añadir línea' })

    await user.type(screen.getByLabelText('Nombre'), 'Arriendo')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'cat-vivienda')
    await user.type(screen.getByLabelText(/Fecha esperada/), '2026-09-05')
    await user.click(screen.getByRole('button', { name: 'Añadir línea' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0] as PlanLineFormSubmit).toEqual({
      name: 'Arriendo',
      kind: 'bill',
      categoryId: 'cat-vivienda',
      dueDate: '2026-09-05',
    })
  })

  it('una factura sin fecha se guarda igual, con dueDate nulo', async () => {
    const user = userEvent.setup()
    renderForm({ submitLabel: 'Añadir línea' })

    await user.type(screen.getByLabelText('Nombre'), 'Arriendo')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'cat-vivienda')
    await user.click(screen.getByRole('button', { name: 'Añadir línea' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ dueDate: null })
  })

  it('un gasto variable se guarda sin fecha', async () => {
    const user = userEvent.setup()
    renderForm({ submitLabel: 'Añadir línea' })

    await user.type(screen.getByLabelText('Nombre'), 'Mercado')
    await user.click(screen.getByRole('radio', { name: /Gasto variable/ }))
    await user.selectOptions(screen.getByLabelText('Categoría'), 'cat-mercado')
    await user.click(screen.getByRole('button', { name: 'Añadir línea' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: 'Mercado',
      kind: 'variable',
      categoryId: 'cat-mercado',
      dueDate: null,
    })
  })

  it('no guarda sin categoría', async () => {
    const user = userEvent.setup()
    renderForm({ submitLabel: 'Añadir línea' })

    await user.type(screen.getByLabelText('Nombre'), 'Arriendo')
    await user.click(screen.getByRole('button', { name: 'Añadir línea' }))

    await waitFor(() => expect(screen.getByText('Elige una categoría')).toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('no guarda una fecha fuera del mes del plan', async () => {
    const user = userEvent.setup()
    renderForm({ submitLabel: 'Añadir línea' })

    await user.type(screen.getByLabelText('Nombre'), 'Arriendo')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'cat-vivienda')
    await user.type(screen.getByLabelText(/Fecha esperada/), '2026-10-05')
    await user.click(screen.getByRole('button', { name: 'Añadir línea' }))

    await waitFor(() =>
      expect(screen.getByText(/tiene que caer dentro del mes del plan/)).toBeInTheDocument(),
    )
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('muestra el presupuesto efectivo de la categoría elegida', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Categoría'), 'cat-vivienda')

    expect(screen.getByText('COP 900.000')).toBeInTheDocument()
  })

  it('dice cuándo la categoría no tiene presupuesto, sin fingir un cero', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Categoría'), 'cat-mercado')

    expect(screen.getByText('Sin presupuesto este mes')).toBeInTheDocument()
    expect(screen.queryByText('COP 0')).not.toBeInTheDocument()
  })

  it('enlaza a Presupuestos, que es donde se cambia la cifra', () => {
    renderForm()

    expect(screen.getByRole('link', { name: 'Editar en Presupuestos' })).toHaveAttribute(
      'href',
      '/budgets',
    )
  })

  describe('al editar', () => {
    const defaultValues = {
      name: 'Arriendo',
      kind: 'bill' as const,
      categoryId: 'cat-vivienda',
      dueDate: '2026-09-05',
    }

    it('no ofrece cambiar la categoría ni el tipo', () => {
      renderForm({ defaultValues, lockedCategoryName: 'Vivienda', categories: [] })

      expect(screen.queryByLabelText('Categoría')).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /Factura/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('radio', { name: /Gasto variable/ })).not.toBeInTheDocument()
    })

    it('enuncia ambos como contexto y dice cómo corregirlos', () => {
      renderForm({ defaultValues, lockedCategoryName: 'Vivienda', categories: [] })

      expect(screen.getByText(/Vivienda/)).toBeInTheDocument()
      expect(screen.getAllByText(/elimina la línea y crea otra/).length).toBeGreaterThan(0)
    })

    it('conserva categoría y tipo en el envío aunque no sean editables', async () => {
      const user = userEvent.setup()
      renderForm({
        defaultValues,
        lockedCategoryName: 'Vivienda',
        categories: [],
        submitLabel: 'Guardar cambios',
      })

      await user.clear(screen.getByLabelText('Nombre'))
      await user.type(screen.getByLabelText('Nombre'), 'Arriendo apartamento')
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(onSubmit).toHaveBeenCalled())
      expect(onSubmit.mock.calls[0][0]).toEqual({
        name: 'Arriendo apartamento',
        kind: 'bill',
        categoryId: 'cat-vivienda',
        dueDate: '2026-09-05',
      })
    })
  })

  it('avisa cuando no quedan categorías libres, en vez de un selector vacío', () => {
    renderForm({ categories: [] })

    expect(screen.getByText(/No quedan categorías de gasto libres/)).toBeInTheDocument()
  })
})
