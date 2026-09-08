import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Tables } from '@/types/database.types'

import { BudgetHistory } from './budget-history'

function row(overrides: Partial<Tables<'budgets'>>): Tables<'budgets'> {
  return {
    id: 'budget-1',
    user_id: 'user-1',
    category_id: 'cat-food',
    period_month: null,
    effective_from: '2026-08-01',
    amount_minor: 500_000,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const plantilla = row({ id: 'tpl-1', effective_from: '2026-08-01', amount_minor: 500_000 })
const excepcion = row({
  id: 'exc-1',
  period_month: '2026-09-01',
  effective_from: '2026-09-01',
  amount_minor: 0,
})

function renderHistory(overrides: Partial<Parameters<typeof BudgetHistory>[0]> = {}) {
  const props = {
    categoryName: 'Alimentación',
    rows: [plantilla, excepcion],
    currencyCode: 'COP',
    onCorrect: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }

  render(<BudgetHistory {...props} />)
  return props
}

describe('BudgetHistory', () => {
  it('distingue plantillas de excepciones y su alcance', () => {
    renderHistory()

    expect(screen.getByText('Plantilla')).toBeInTheDocument()
    expect(screen.getByText('Desde agosto 2026')).toBeInTheDocument()
    expect(screen.getByText('COP 500.000')).toBeInTheDocument()

    expect(screen.getByText('Excepción')).toBeInTheDocument()
    expect(screen.getByText('Solo septiembre 2026')).toBeInTheDocument()
    expect(screen.getByText('COP 0')).toBeInTheDocument()
  })

  it('sin versiones lo dice en vez de mostrar una lista vacía', () => {
    renderHistory({ rows: [] })

    expect(screen.getByText(/todavía no tiene ninguna versión/i)).toBeInTheDocument()
  })

  it('corrige el monto de la fila elegida, no de otra', async () => {
    const user = userEvent.setup()
    const { onCorrect } = renderHistory()

    await user.click(
      screen.getByRole('button', { name: 'Corregir monto de la excepción de septiembre 2026' }),
    )

    const input = screen.getByLabelText('Monto mensual')
    await user.clear(input)
    await user.type(input, '12000')
    await user.click(screen.getByRole('button', { name: 'Guardar corrección' }))

    expect(onCorrect).toHaveBeenCalledWith('exc-1', 12_000)
  })

  it('la corrección no ofrece cambiar alcance ni mes', async () => {
    const user = userEvent.setup()
    renderHistory()

    await user.click(
      screen.getByRole('button', { name: 'Corregir monto de la plantilla desde agosto 2026' }),
    )

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    // El único campo editable es el monto.
    expect(screen.getByLabelText('Monto mensual')).toHaveValue('500000')
  })

  it('elimina la fila elegida tras confirmar', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderHistory()

    await user.click(
      screen.getByRole('button', { name: 'Eliminar la plantilla desde agosto 2026' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Eliminar' }))

    expect(onDelete).toHaveBeenCalledWith('tpl-1')
  })

  it('no elimina nada si se cancela', async () => {
    const user = userEvent.setup()
    const { onDelete } = renderHistory()

    await user.click(
      screen.getByRole('button', { name: 'Eliminar la excepción de septiembre 2026' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }))

    expect(onDelete).not.toHaveBeenCalled()
  })
})
