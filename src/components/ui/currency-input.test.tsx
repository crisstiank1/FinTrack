import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CurrencyInput } from './currency-input'

function ControlledCurrencyInput({
  onChange,
  currency = 'COP',
  initial = 0,
}: {
  onChange: (value: number) => void
  currency?: string
  initial?: number
}) {
  const [value, setValue] = useState(initial)
  return (
    <CurrencyInput
      aria-label="Saldo inicial"
      currency={currency}
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('CurrencyInput', () => {
  it('en COP (exponente 0) agrupa miles y reporta el mismo entero', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledCurrencyInput onChange={onChange} />)

    const input = screen.getByLabelText('Saldo inicial')
    await user.type(input, '1900000')

    expect(input).toHaveValue('1.900.000')
    expect(onChange).toHaveBeenLastCalledWith(1900000)
  })

  it('convierte los digitados con el exponente de la moneda al reportar', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledCurrencyInput onChange={onChange} currency="USD" />)

    await user.type(screen.getByLabelText('Saldo inicial'), '45,99')

    // 45,99 USD son 4599 centavos, no 45.
    expect(onChange).toHaveBeenLastCalledWith(4599)
  })

  it('muestra centavos en el valor llega de fuera (editar un movimiento)', () => {
    render(<ControlledCurrencyInput onChange={vi.fn()} currency="USD" initial={4599} />)

    expect(screen.getByLabelText('Saldo inicial')).toHaveValue('45,99')
  })

  it('pisa los decimales al salir del campo', async () => {
    const user = userEvent.setup()
    render(<ControlledCurrencyInput onChange={vi.fn()} currency="USD" />)

    const input = screen.getByLabelText('Saldo inicial')
    await user.type(input, '45')
    fireEvent.blur(input)

    expect(input).toHaveValue('45,00')
  })

  it('en COP descarta puntos sin decimales: abc123.45 queda 12345', async () => {
    const user = userEvent.setup()
    render(<ControlledCurrencyInput onChange={vi.fn()} />)

    const input = screen.getByLabelText('Saldo inicial')
    await user.type(input, 'abc123.45')

    expect(input).toHaveValue('12.345')
  })
})