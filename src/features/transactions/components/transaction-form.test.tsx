import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TransactionForm } from './transaction-form'
import type { Tables } from '@/types/database.types'

const accounts = [
  { id: 'acc-1', name: 'Efectivo', is_archived: false },
  { id: 'acc-2', name: 'Ahorros', is_archived: false },
] as Tables<'accounts'>[]

const categories = [
  { id: 'cat-income-1', name: 'Salario', type: 'income', is_archived: false },
  { id: 'cat-expense-1', name: 'Mercado', type: 'expense', is_archived: false },
] as Tables<'categories'>[]

describe('TransactionForm', () => {
  it('exige descripción, monto, cuenta y categoría antes de enviar', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TransactionForm accounts={accounts} categories={categories} currencyCode="COP" onSubmit={onSubmit} />,
    )

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText('Ingresa una descripción')).toBeInTheDocument()
    expect(screen.getByText('El monto debe ser mayor a 0')).toBeInTheDocument()
    expect(screen.getByText('Selecciona una cuenta')).toBeInTheDocument()
    expect(screen.getByText('Selecciona una categoría')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('solo muestra categorías de ingreso cuando el tipo es Ingreso', async () => {
    const user = userEvent.setup()
    render(
      <TransactionForm accounts={accounts} categories={categories} currencyCode="COP" onSubmit={vi.fn()} />,
    )

    expect(screen.getByRole('option', { name: 'Mercado' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Salario' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Ingreso' }))

    expect(screen.getByRole('option', { name: 'Salario' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Mercado' })).not.toBeInTheDocument()
  })

  it('envía un gasto válido con el monto correcto', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TransactionForm accounts={accounts} categories={categories} currencyCode="COP" onSubmit={onSubmit} />,
    )

    await user.type(screen.getByLabelText('Descripción'), 'Mercado del mes')
    await user.type(screen.getByLabelText('Monto'), '50000')
    await user.selectOptions(screen.getByLabelText('Cuenta'), 'acc-1')
    await user.selectOptions(screen.getByLabelText('Categoría'), 'cat-expense-1')
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        description: 'Mercado del mes',
        amount: 50000,
        accountId: 'acc-1',
        categoryId: 'cat-expense-1',
      }),
      expect.anything(),
    )
  })
})
