import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Tables } from '@/types/database.types'

import { QuickTransactionForm } from './quick-transaction-form'

const accounts = [
  { id: 'acc-cop', name: 'Efectivo', currency_code: 'COP', is_archived: false },
  { id: 'acc-usd', name: 'Cuenta USD', currency_code: 'USD', is_archived: false },
  { id: 'acc-old', name: 'Cuenta vieja', currency_code: 'COP', is_archived: true },
] as Tables<'accounts'>[]

const categories = [
  { id: 'cat-food', name: 'Alimentación', type: 'expense', icon: null, is_archived: false },
  { id: 'cat-fun', name: 'Ocio', type: 'expense', icon: null, is_archived: false },
  { id: 'cat-old', name: 'Vieja', type: 'expense', icon: null, is_archived: true },
  { id: 'cat-salary', name: 'Salario', type: 'income', icon: null, is_archived: false },
] as Tables<'categories'>[]

function renderForm(onSubmit = vi.fn()) {
  render(
    <QuickTransactionForm
      accounts={accounts}
      categories={categories}
      currencyCode="COP"
      onSubmit={onSubmit}
    />,
  )
  return onSubmit
}

function chips() {
  return within(screen.getByRole('radiogroup', { name: 'Categoría' }))
}

/** El formulario arranca con la fecha de hoy. */
const today = new Date().toISOString().slice(0, 10)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QuickTransactionForm', () => {
  it('registra un gasto con la cuenta, el importe y la categoría elegidos', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()

    await user.type(screen.getByLabelText('Monto'), '15000')
    await user.click(chips().getByRole('radio', { name: 'Alimentación' }))
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        accountId: 'acc-cop',
        categoryId: 'cat-food',
        amount: 15000,
        transactionDate: today,
        // Sin nota, la descripción es el nombre de la categoría: el esquema la
        // exige y pedirla dos veces sobra.
        description: 'Alimentación',
      }),
    )
  })

  it('registra un ingreso y cambia los chips al cambiar de tipo', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()

    expect(chips().getByRole('radio', { name: 'Alimentación' })).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Ingreso' }))

    expect(chips().getByRole('radio', { name: 'Salario' })).toBeInTheDocument()
    expect(chips().queryByRole('radio', { name: 'Alimentación' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Monto'), '300000')
    await user.click(chips().getByRole('radio', { name: 'Salario' }))
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'income', categoryId: 'cat-salary', amount: 300000 }),
    )
  })

  it('no ofrece categorías ni cuentas archivadas', () => {
    renderForm()

    expect(chips().queryByRole('radio', { name: 'Vieja' })).not.toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Cuenta del movimiento')).queryByRole('option', {
        name: 'Cuenta vieja',
      }),
    ).not.toBeInTheDocument()
  })

  it('la nota escrita manda como descripción', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()

    await user.type(screen.getByLabelText('Monto'), '15000')
    await user.click(chips().getByRole('radio', { name: 'Alimentación' }))
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Mercado del sábado')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Mercado del sábado' }),
    )
  })

  it('el importe se lee en la moneda de la cuenta elegida', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Monto'), '40')
    expect(screen.getByText('Equivale a COP 40')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Cuenta del movimiento'), 'acc-usd')

    expect(screen.getByText('Equivale a USD 40')).toBeInTheDocument()
  })

  it('no registra nada sin categoría', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()

    await user.type(screen.getByLabelText('Monto'), '15000')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(await screen.findByText('Selecciona una categoría')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('tras registrar deja listo el siguiente: vacía importe, categoría y nota', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Cuenta del movimiento'), 'acc-usd')
    await user.type(screen.getByLabelText('Monto'), '40')
    await user.click(chips().getByRole('radio', { name: 'Ocio' }))
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Cine')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    // El importe vuelve a 0, que es como el campo muestra «vacío». Se espera:
    // el formulario solo se limpia cuando el guardado termina bien.
    await waitFor(() =>
      expect((screen.getByLabelText('Monto') as HTMLInputElement).value).toBe('0'),
    )
    expect((screen.getByLabelText('Nota (opcional)') as HTMLInputElement).value).toBe('')
    expect(chips().getByRole('radio', { name: 'Ocio' })).toHaveAttribute('aria-checked', 'false')
    // La cuenta se conserva: lo normal es anotar varios seguidos de la misma.
    expect((screen.getByLabelText('Cuenta del movimiento') as HTMLSelectElement).value).toBe(
      'acc-usd',
    )
  })

  it('si guardar falla conserva lo escrito para reintentar', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockRejectedValue(new Error('sin conexión'))
    render(
      <QuickTransactionForm
        accounts={accounts}
        categories={categories}
        currencyCode="COP"
        onSubmit={onSubmit}
      />,
    )

    await user.type(screen.getByLabelText('Monto'), '15000')
    await user.click(chips().getByRole('radio', { name: 'Alimentación' }))
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect((screen.getByLabelText('Monto') as HTMLInputElement).value).toBe('15.000')
  })
})
