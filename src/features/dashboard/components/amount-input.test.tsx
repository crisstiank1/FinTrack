import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AmountInput } from './amount-input'

/** Campo controlado, como lo usa el formulario rápido. */
function Controlled({ onChange = vi.fn(), initial = 0 }) {
  const [value, setValue] = useState(initial)

  return (
    <>
      <label htmlFor="amount">Monto (COP)</label>
      <AmountInput
        id="amount"
        value={value}
        onChange={(next) => {
          setValue(next)
          onChange(next)
        }}
      />
    </>
  )
}

function field() {
  return screen.getByLabelText('Monto (COP)') as HTMLInputElement
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

  it('ignora lo que no sean dígitos', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Controlled onChange={onChange} />)

    await user.type(field(), '$1a2,5')

    expect(onChange).toHaveBeenLastCalledWith(125)
  })
})
