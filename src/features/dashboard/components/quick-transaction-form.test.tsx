import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { todayIsoDate } from '@/lib/dates'
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

/** El campo de monto, cuya etiqueta lleva la moneda de la cuenta: «Monto (COP)». */
function amountField() {
  return screen.getByLabelText(/^Monto \(/) as HTMLInputElement
}

function chips() {
  return within(screen.getByRole('radiogroup', { name: 'Categoría' }))
}

/**
 * El formulario arranca con la fecha de hoy, en hora local. `toISOString` daría
 * la de UTC, que por la noche en Colombia ya es el día siguiente.
 */
const today = todayIsoDate()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QuickTransactionForm', () => {
  it('registra un gasto con la cuenta, el importe y la categoría elegidos', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()

    await user.type(amountField(), '15000')
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

    await user.type(amountField(), '300000')
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

    await user.type(amountField(), '15000')
    await user.click(chips().getByRole('radio', { name: 'Alimentación' }))
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Mercado del sábado')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Mercado del sábado' }),
    )
  })

  it('la etiqueta y la línea de ayuda dicen la moneda de la cuenta, sin «Equivale a»', async () => {
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByLabelText('Monto (COP)')).toBeInTheDocument()
    expect(screen.getByText('Se registrará en COP')).toBeInTheDocument()

    await user.type(amountField(), '40')
    expect(screen.getByText('Se registrará como COP 40')).toBeInTheDocument()
    expect(screen.queryByText(/Equivale a/)).not.toBeInTheDocument()
  })

  it('cambiar de cuenta entre monedas mantiene el entero guardado y re-lee la escala', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(amountField(), '40')
    await user.selectOptions(screen.getByLabelText('Cuenta del movimiento'), 'acc-usd')

    // 40 sigue siendo 40 en unidades mínimas, pero en USD eso es 0,40.
    expect(screen.getByLabelText('Monto (USD)')).toHaveValue('0,40')
    expect(screen.getByText('Se registrará como USD 0,40')).toBeInTheDocument()
  })

  it('el monto empieza vacío, con un «$» fijo fuera del valor', () => {
    renderForm()

    expect(amountField().value).toBe('')
    expect(amountField()).toHaveAttribute('placeholder', '0')
    expect(screen.getByText('$')).toHaveAttribute('aria-hidden', 'true')
  })

  it('no registra nada sin categoría', async () => {
    const user = userEvent.setup()
    const onSubmit = renderForm()

    await user.type(amountField(), '15000')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(await screen.findByText('Selecciona una categoría')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('tras registrar deja listo el siguiente: vacía importe, categoría y nota', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.selectOptions(screen.getByLabelText('Cuenta del movimiento'), 'acc-usd')
    await user.type(amountField(), '40')
    await user.click(chips().getByRole('radio', { name: 'Ocio' }))
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Cine')
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    // El importe vuelve a vacío. Se espera: el formulario solo se limpia cuando
    // el guardado termina bien.
    await waitFor(() => expect(amountField().value).toBe(''))
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

    await user.type(amountField(), '15000')
    await user.click(chips().getByRole('radio', { name: 'Alimentación' }))
    await user.click(screen.getByRole('button', { name: 'Agregar' }))

    expect(onSubmit).toHaveBeenCalledOnce()
    expect(amountField().value).toBe('15.000')
  })
})
