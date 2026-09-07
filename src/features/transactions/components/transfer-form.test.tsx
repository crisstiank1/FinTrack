import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TransferForm } from './transfer-form'
import type { Tables } from '@/types/database.types'

const accounts = [
  { id: 'acc-1', name: 'Efectivo', is_archived: false },
  { id: 'acc-2', name: 'Ahorros', is_archived: false },
] as Tables<'accounts'>[]

describe('TransferForm', () => {
  it('exige cuentas distintas de origen y destino', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<TransferForm accounts={accounts} currencyCode="COP" onSubmit={onSubmit} />)

    await user.selectOptions(screen.getByLabelText('Desde'), 'acc-1')
    await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-1')
    await user.type(screen.getByLabelText('Monto'), '10000')
    await user.click(screen.getByRole('button', { name: /transferir/i }))

    expect(await screen.findByText('Elige dos cuentas distintas')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('envía una transferencia válida entre dos cuentas distintas', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<TransferForm accounts={accounts} currencyCode="COP" onSubmit={onSubmit} />)

    await user.selectOptions(screen.getByLabelText('Desde'), 'acc-1')
    await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-2')
    await user.type(screen.getByLabelText('Monto'), '25000')
    await user.click(screen.getByRole('button', { name: /transferir/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 25000 }),
      expect.anything(),
    )
  })
})
