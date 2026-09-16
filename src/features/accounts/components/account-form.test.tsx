import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AccountForm } from './account-form'

describe('AccountForm', () => {
  it('exige un nombre antes de enviar', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<AccountForm onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText('Ingresa un nombre')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('formatea el saldo inicial con separadores de miles y muestra el equivalente en la moneda elegida', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<AccountForm onSubmit={onSubmit} />)

    const balanceInput = screen.getByLabelText('Saldo inicial')
    await user.type(balanceInput, '1900000')

    expect(balanceInput).toHaveValue('1.900.000')
    expect(screen.getByText('Equivale a COP 1.900.000')).toBeInTheDocument()
  })

  it('no permite escribir signos negativos en el saldo inicial', async () => {
    const user = userEvent.setup()
    render(<AccountForm onSubmit={vi.fn()} />)

    const balanceInput = screen.getByLabelText('Saldo inicial')
    await user.type(balanceInput, '-100')

    expect(balanceInput).toHaveValue('100')
  })

  it('envía los valores con ícono y color seleccionados por defecto', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<AccountForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Nombre de la cuenta'), 'Cuenta de prueba')
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Cuenta de prueba',
        type: 'cash',
        initialBalance: 0,
        currencyCode: 'COP',
        icon: 'wallet',
        color: '#E83E8C',
      }),
      expect.anything(),
    )
  })

  it('permite elegir un ícono distinto', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<AccountForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Nombre de la cuenta'), 'Cuenta de prueba')
    await user.click(screen.getByRole('radio', { name: 'home' }))
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ icon: 'home' }),
      expect.anything(),
    )
  })

  it('ofrece «Cuenta de inversión» y envía type investment', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<AccountForm onSubmit={onSubmit} />)

    expect(screen.getByRole('option', { name: 'Cuenta de inversión' })).toHaveValue('investment')

    await user.type(screen.getByLabelText('Nombre de la cuenta'), 'Inversiones')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'investment')
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Inversiones', type: 'investment' }),
      expect.anything(),
    )
  })

  it('al editar una cuenta investment conserva el tipo al guardar', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <AccountForm
        onSubmit={onSubmit}
        defaultValues={{
          name: 'Inversiones',
          type: 'investment',
          initialBalance: 250_000,
          currencyCode: 'COP',
          icon: 'trending-up',
          color: '#E83E8C',
        }}
      />,
    )

    expect(screen.getByLabelText('Tipo')).toHaveValue('investment')

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Inversiones', type: 'investment', initialBalance: 250_000 }),
      expect.anything(),
    )
  })
})

describe('AccountForm — moneda', () => {
  it('ofrece COP, USD y ARS con etiquetas, y no ofrece EUR ni MXN', () => {
    render(<AccountForm onSubmit={vi.fn()} />)

    expect(screen.getByRole('option', { name: 'Peso colombiano (COP)' })).toHaveValue('COP')
    expect(screen.getByRole('option', { name: 'Dólar estadounidense (USD)' })).toHaveValue('USD')
    expect(screen.getByRole('option', { name: 'Peso argentino (ARS)' })).toHaveValue('ARS')
    expect(screen.queryByRole('option', { name: 'Euro (EUR)' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Peso mexicano (MXN)' })).not.toBeInTheDocument()
  })

  it('al editar una cuenta en EUR conserva EUR como opción heredada', () => {
    render(
      <AccountForm
        onSubmit={vi.fn()}
        defaultValues={{ name: 'Cuenta europea', currencyCode: 'EUR' }}
      />,
    )

    expect(screen.getByLabelText('Moneda')).toHaveValue('EUR')
    expect(screen.getByRole('option', { name: 'Euro (EUR)' })).toHaveValue('EUR')
  })

  it('bloquea la moneda y lo explica cuando la cuenta ya tiene movimientos', () => {
    render(
      <AccountForm
        onSubmit={vi.fn()}
        currencyLocked
        defaultValues={{ name: 'Cuenta en euros', currencyCode: 'EUR' }}
      />,
    )

    expect(screen.getByLabelText('Moneda')).toBeDisabled()
    expect(
      screen.getByText('La moneda no se puede cambiar porque la cuenta ya tiene movimientos'),
    ).toBeInTheDocument()
  })

  it('muestra el error cuando la moneda queda fuera del catálogo', async () => {
    render(<AccountForm onSubmit={vi.fn()} />)

    const currencySelect = screen.getByLabelText('Moneda')
    fireEvent.change(currencySelect, { target: { value: 'PEN' } })
    fireEvent.blur(currencySelect)

    expect(await screen.findByText('Selecciona una moneda')).toBeInTheDocument()
  })
})
