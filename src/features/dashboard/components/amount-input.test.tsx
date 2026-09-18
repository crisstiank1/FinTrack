import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AmountInput } from './amount-input'

/** Campo controlado, como lo usa el formulario rápido. */
function Controlled({ onChange = vi.fn(), initial = 0, currency = 'COP' }: {
  onChange?: (value: number) => void
  initial?: number
  currency?: string
}) {
  const [value, setValue] = useState(initial)

  return (
    <>
      <label htmlFor="amount">Monto ({currency})</label>
      <AmountInput
        id="amount"
        currency={currency}
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
    </>
  )
}

function field(currency = 'COP') {
  return screen.getByLabelText(`Monto (${currency})`) as HTMLInputElement
}

describe('AmountInput', () => {
  it('empieza vacío, con 0 solo como marcador', () => {
    render(<Controlled />)

    expect(field().value).toBe('')
    expect(field()).toHaveAttribute('placeholder', '0')
  })

  it('muestra un «$» fijo que no forma parte del valor', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Controlled onChange={onChange} />)

    expect(screen.getByText('$')).toHaveAttribute('aria-hidden', 'true')

    await user.type(field(), '15000')

    expect(field().value).toBe('15.000')
    expect(field().value).not.toContain('$')
    expect(onChange).toHaveBeenLastCalledWith(15000)
  })

  it('el «$» no se puede borrar: vaciar el campo deja el importe en 0', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Controlled onChange={onChange} initial={40} />)

    await user.clear(field())

    expect(field().value).toBe('')
    expect(onChange).toHaveBeenLastCalledWith(0)
    expect(screen.getByText('$')).toBeInTheDocument()
  })

  it('convierte los digitados con el exponente de la moneda al reportar', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Controlled onChange={onChange} currency="USD" />)

    await user.type(field('USD'), '45,99')

    expect(onChange).toHaveBeenLastCalledWith(4599)
  })

  it('muestra centavos al editar un importe existente en USD', () => {
    render(<Controlled currency="USD" initial={4599} />)

    expect(field('USD').value).toBe('45,99')
  })

  it('pisa los decimales al salir del campo', async () => {
    const user = userEvent.setup()
    render(<Controlled currency="USD" />)

    await user.type(field('USD'), '10')
    fireEvent.blur(field('USD'))

    expect(field('USD')).toHaveValue('10,00')
  })

  it('en COP ignora lo que no sean dígitos: 1a2,5 queda 125', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Controlled onChange={onChange} />)

    await user.type(field(), '1a2,5')

    // COP no tiene decimales: la coma se descarta y quedan los dígitos.
    expect(onChange).toHaveBeenLastCalledWith(125)
  })
})