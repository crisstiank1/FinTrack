import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CurrencyInput } from './currency-input'

function ControlledCurrencyInput({ onChange }: { onChange: (value: number) => void }) {
  const [value, setValue] = useState(0)
  return (
    <CurrencyInput
      aria-label="Saldo inicial"
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('CurrencyInput', () => {
  it('muestra separadores de miles en formato local mientras se escribe', async () => {
    const user = userEvent.setup()
    render(<ControlledCurrencyInput onChange={vi.fn()} />)

    const input = screen.getByLabelText('Saldo inicial')
    await user.type(input, '1900000')

    expect(input).toHaveValue('1.900.000')
  })

  it('reporta el valor numérico sin formato al consumidor', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ControlledCurrencyInput onChange={onChange} />)

    await user.type(screen.getByLabelText('Saldo inicial'), '1900000')

    expect(onChange).toHaveBeenLastCalledWith(1900000)
  })

  it('ignora caracteres no numéricos', async () => {
    const user = userEvent.setup()
    render(<ControlledCurrencyInput onChange={vi.fn()} />)

    const input = screen.getByLabelText('Saldo inicial')
    await user.type(input, 'abc123.45')

    expect(input).toHaveValue('12.345')
  })
})
