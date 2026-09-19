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
      <TransactionForm
        accounts={accounts}
        categories={categories}
        currencyCode="COP"
        onSubmit={onSubmit}
      />,
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
      <TransactionForm
        accounts={accounts}
        categories={categories}
        currencyCode="COP"
        onSubmit={vi.fn()}
      />,
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
      <TransactionForm
        accounts={accounts}
        categories={categories}
        currencyCode="COP"
        onSubmit={onSubmit}
      />,
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

  it('no ofrece tarjetas de crédito cuando el tipo es Ingreso', async () => {
    const user = userEvent.setup()
    const accountsWithCards = [
      { id: 'acc-cash', name: 'Efectivo', is_archived: false, type: 'cash' },
      { id: 'acc-card', name: 'Visa', is_archived: false, type: 'credit_card' },
    ] as Tables<'accounts'>[]
    render(
      <TransactionForm
        accounts={accountsWithCards}
        categories={categories}
        currencyCode="COP"
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'Visa' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Ingreso' }))

    expect(screen.queryByRole('option', { name: 'Visa' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Efectivo' })).toBeInTheDocument()
  })

  it('descarta una tarjeta de crédito elegida al cambiar a Ingreso', async () => {
    const user = userEvent.setup()
    const accountsWithCards = [
      { id: 'acc-cash', name: 'Efectivo', is_archived: false, type: 'cash' },
      { id: 'acc-card', name: 'Visa', is_archived: false, type: 'credit_card' },
    ] as Tables<'accounts'>[]
    render(
      <TransactionForm
        accounts={accountsWithCards}
        categories={categories}
        currencyCode="COP"
        onSubmit={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('Cuenta'), 'acc-card')
    expect((screen.getByLabelText('Cuenta') as HTMLSelectElement).value).toBe('acc-card')

    await user.click(screen.getByRole('radio', { name: 'Ingreso' }))

    expect((screen.getByLabelText('Cuenta') as HTMLSelectElement).value).toBe('')
    expect(screen.queryByRole('option', { name: 'Visa' })).not.toBeInTheDocument()
  })

  it('muestra el equivalente en la moneda de la cuenta elegida', async () => {
    const user = userEvent.setup()
    const accountsWithCurrency = [
      { id: 'acc-cop', name: 'Banco', currency_code: 'COP', is_archived: false },
      { id: 'acc-usd', name: 'Cuenta USD', currency_code: 'USD', is_archived: false },
    ] as Tables<'accounts'>[]
    render(
      <TransactionForm
        accounts={accountsWithCurrency}
        categories={categories}
        currencyCode="COP"
        onSubmit={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Monto'), '1500')
    // Sin cuenta elegida se usa la moneda que indica la página.
    expect(screen.getByText('Equivale a COP 1.500')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Cuenta'), 'acc-usd')
    expect(screen.getByText('Equivale a USD 15,00')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Cuenta'), 'acc-cop')
    expect(screen.getByText('Equivale a COP 1.500')).toBeInTheDocument()
  })

  it('nunca ofrece cuentas ni categorías archivadas en un movimiento nuevo', () => {
    render(
      <TransactionForm
        accounts={
          [
            { id: 'acc-1', name: 'Efectivo', is_archived: false },
            { id: 'acc-arch', name: 'Cuenta vieja', is_archived: true },
          ] as Tables<'accounts'>[]
        }
        categories={
          [
            { id: 'cat-expense-1', name: 'Mercado', type: 'expense', is_archived: false },
            { id: 'cat-arch', name: 'Viajes antiguos', type: 'expense', is_archived: true },
          ] as Tables<'categories'>[]
        }
        currencyCode="COP"
        onSubmit={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('option', { name: 'Cuenta vieja (Archivada)' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: 'Viajes antiguos (Archivada)' }),
    ).not.toBeInTheDocument()
  })

  it('al editar conserva la cuenta archivada original, bloqueada y aún elegida', () => {
    render(
      <TransactionForm
        accounts={
          [
            { id: 'acc-1', name: 'Efectivo', is_archived: false },
            { id: 'acc-arch', name: 'Cuenta vieja', is_archived: true },
          ] as Tables<'accounts'>[]
        }
        categories={categories}
        currencyCode="COP"
        defaultValues={{
          type: 'expense',
          description: 'Compra antigua',
          amount: 10000,
          accountId: 'acc-arch',
          categoryId: 'cat-expense-1',
          transactionDate: '2024-05-10',
        }}
        onSubmit={vi.fn()}
      />,
    )

    const cuenta = screen.getByLabelText('Cuenta') as HTMLSelectElement
    expect(cuenta.value).toBe('acc-arch')
    const option = screen.getByRole('option', { name: 'Cuenta vieja (Archivada)' })
    expect(option).toBeDisabled()
    // Se puede cambiar a una cuenta activa si se quiere.
    expect(screen.getByRole('option', { name: 'Efectivo' })).toBeEnabled()
  })

  it('al editar conserva la categoría archivada original, bloqueada y aún elegida', () => {
    render(
      <TransactionForm
        accounts={accounts}
        categories={
          [
            { id: 'cat-expense-1', name: 'Mercado', type: 'expense', is_archived: false },
            { id: 'cat-arch', name: 'Viajes antiguos', type: 'expense', is_archived: true },
          ] as Tables<'categories'>[]
        }
        currencyCode="COP"
        defaultValues={{
          type: 'expense',
          description: 'Viaje viejo',
          amount: 200000,
          accountId: 'acc-1',
          categoryId: 'cat-arch',
          transactionDate: '2024-05-10',
        }}
        onSubmit={vi.fn()}
      />,
    )

    const categoria = screen.getByLabelText('Categoría') as HTMLSelectElement
    expect(categoria.value).toBe('cat-arch')
    const option = screen.getByRole('option', { name: 'Viajes antiguos (Archivada)' })
    expect(option).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Mercado' })).toBeEnabled()
  })

  it('al editar un ingreso histórico con tarjeta conserva la cuenta sin descartarla', () => {
    render(
      <TransactionForm
        accounts={
          [
            { id: 'acc-cash', name: 'Efectivo', is_archived: false, type: 'cash' },
            { id: 'acc-card', name: 'Visa', is_archived: false, type: 'credit_card' },
          ] as Tables<'accounts'>[]
        }
        categories={
          [
            { id: 'cat-income-1', name: 'Salario', type: 'income', is_archived: false },
          ] as Tables<'categories'>[]
        }
        currencyCode="COP"
        defaultValues={{
          type: 'income',
          description: 'Ingreso antiguo',
          amount: 50000,
          accountId: 'acc-card',
          categoryId: 'cat-income-1',
          transactionDate: '2024-05-10',
        }}
        onSubmit={vi.fn()}
      />,
    )

    // La regla «no ingresos con tarjeta» no se aplica retroactivamente: editar
    // no borra una cuenta que el movimiento ya tenía guardada, solo la bloquea.
    const cuenta = screen.getByLabelText('Cuenta') as HTMLSelectElement
    expect(cuenta.value).toBe('acc-card')
    const option = screen.getByRole('option', { name: 'Visa (no recibe ingresos)' })
    expect(option).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Efectivo' })).toBeEnabled()
  })
})
