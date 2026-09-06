import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('rechaza un saldo inicial negativo', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<AccountForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Nombre de la cuenta'), 'Cuenta de prueba')
    const balanceInput = screen.getByLabelText('Saldo inicial')
    await user.clear(balanceInput)
    await user.type(balanceInput, '-100')
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText('El saldo no puede ser negativo')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
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

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ icon: 'home' }), expect.anything())
  })
})
