import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TransferForm } from './transfer-form'
import { createTransferSchema } from '@/features/transactions/schemas'
import type { Tables } from '@/types/database.types'

const accounts = [
  { id: 'acc-1', name: 'Efectivo', currency_code: 'COP', is_archived: false },
  { id: 'acc-2', name: 'Ahorros', currency_code: 'COP', is_archived: false },
  { id: 'acc-usd', name: 'Cuenta USD', currency_code: 'USD', is_archived: false },
] as Tables<'accounts'>[]

const NOTE = 'FinTrack no convierte divisas: registra cuánto salió y cuánto entró.'

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

  describe('misma moneda', () => {
    it('pide un solo monto y la pata entrante lleva el mismo importe', async () => {
      const onSubmit = vi.fn()
      const user = userEvent.setup()
      render(<TransferForm accounts={accounts} currencyCode="COP" onSubmit={onSubmit} />)

      await user.selectOptions(screen.getByLabelText('Desde'), 'acc-1')
      await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-2')

      expect(screen.queryByLabelText(/Monto recibido/)).not.toBeInTheDocument()
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument()

      await user.type(screen.getByLabelText('Monto'), '25000')
      await user.click(screen.getByRole('button', { name: /transferir/i }))

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 25000, receivedAmount: 25000 }),
        expect.anything(),
      )
    })

    it('muestra la equivalencia en la moneda de la cuenta de origen, no en la de la página', async () => {
      const user = userEvent.setup()
      const usdAccounts = [
        ...accounts,
        { id: 'acc-usd-2', name: 'Otra USD', currency_code: 'USD', is_archived: false },
      ] as Tables<'accounts'>[]
      render(<TransferForm accounts={usdAccounts} currencyCode="COP" onSubmit={vi.fn()} />)

      await user.selectOptions(screen.getByLabelText('Desde'), 'acc-usd')
      await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-usd-2')
      await user.type(screen.getByLabelText('Monto'), '40')

      expect(screen.getByText('Equivale a USD 40')).toBeInTheDocument()
    })
  })

  describe('monedas distintas', () => {
    it('pide el monto recibido en la moneda de destino y explica que no se convierte', async () => {
      const user = userEvent.setup()
      render(<TransferForm accounts={accounts} currencyCode="COP" onSubmit={vi.fn()} />)

      await user.selectOptions(screen.getByLabelText('Desde'), 'acc-1')
      await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-usd')

      expect(screen.getByLabelText('Monto enviado (COP)')).toBeInTheDocument()
      expect(screen.getByLabelText('Monto recibido (USD)')).toBeInTheDocument()
      expect(screen.getByText(NOTE)).toBeInTheDocument()
    })

    it('no envía la transferencia sin monto recibido', async () => {
      const onSubmit = vi.fn()
      const user = userEvent.setup()
      render(<TransferForm accounts={accounts} currencyCode="COP" onSubmit={onSubmit} />)

      await user.selectOptions(screen.getByLabelText('Desde'), 'acc-1')
      await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-usd')
      await user.type(screen.getByLabelText('Monto enviado (COP)'), '100000')
      await user.click(screen.getByRole('button', { name: /transferir/i }))

      expect(await screen.findByText('Ingresa el monto recibido')).toBeInTheDocument()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('envía cada importe en su moneda, sin convertir', async () => {
      const onSubmit = vi.fn()
      const user = userEvent.setup()
      render(<TransferForm accounts={accounts} currencyCode="COP" onSubmit={onSubmit} />)

      await user.selectOptions(screen.getByLabelText('Desde'), 'acc-1')
      await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-usd')
      await user.type(screen.getByLabelText('Monto enviado (COP)'), '100000')
      await user.type(screen.getByLabelText('Monto recibido (USD)'), '25')

      expect(screen.getByText('Equivale a COP 100.000')).toBeInTheDocument()
      expect(screen.getByText('Equivale a USD 25')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /transferir/i }))

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: 'acc-1',
          toAccountId: 'acc-usd',
          amount: 100000,
          receivedAmount: 25,
        }),
        expect.anything(),
      )
    })

    it('volver a una cuenta de la misma moneda oculta y descarta el monto recibido', async () => {
      const onSubmit = vi.fn()
      const user = userEvent.setup()
      render(<TransferForm accounts={accounts} currencyCode="COP" onSubmit={onSubmit} />)

      await user.selectOptions(screen.getByLabelText('Desde'), 'acc-1')
      await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-usd')
      await user.type(screen.getByLabelText('Monto recibido (USD)'), '25')
      await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-2')

      expect(screen.queryByLabelText(/Monto recibido/)).not.toBeInTheDocument()

      await user.type(screen.getByLabelText('Monto'), '30000')
      await user.click(screen.getByRole('button', { name: /transferir/i }))

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ toAccountId: 'acc-2', amount: 30000, receivedAmount: 30000 }),
        expect.anything(),
      )
    })
  })
})

describe('createTransferSchema', () => {
  const schema = createTransferSchema(
    new Map([
      ['cop-1', 'COP'],
      ['cop-2', 'COP'],
      ['usd-1', 'USD'],
    ]),
  )
  const base = { transactionDate: '2026-09-14', description: 'Transferencia' }

  it('con la misma moneda rechaza un monto recibido distinto del enviado', () => {
    const result = schema.safeParse({
      ...base,
      fromAccountId: 'cop-1',
      toAccountId: 'cop-2',
      amount: 1000,
      receivedAmount: 900,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: ['receivedAmount'],
      message: 'Con la misma moneda, el monto recibido debe ser igual al enviado',
    })
  })

  it('con la misma moneda acepta un monto recibido igual y sin él lo iguala al enviado', () => {
    const withReceived = schema.parse({
      ...base,
      fromAccountId: 'cop-1',
      toAccountId: 'cop-2',
      amount: 1000,
      receivedAmount: 1000,
    })
    const withoutReceived = schema.parse({
      ...base,
      fromAccountId: 'cop-1',
      toAccountId: 'cop-2',
      amount: 1000,
    })

    expect(withReceived.receivedAmount).toBe(1000)
    expect(withoutReceived.receivedAmount).toBe(1000)
  })

  it('con monedas distintas exige un monto recibido entero y mayor que 0', () => {
    const missing = schema.safeParse({
      ...base,
      fromAccountId: 'cop-1',
      toAccountId: 'usd-1',
      amount: 1000,
    })
    const zero = schema.safeParse({
      ...base,
      fromAccountId: 'cop-1',
      toAccountId: 'usd-1',
      amount: 1000,
      receivedAmount: 0,
    })
    const decimal = schema.safeParse({
      ...base,
      fromAccountId: 'cop-1',
      toAccountId: 'usd-1',
      amount: 1000,
      receivedAmount: 2.5,
    })

    expect(missing.success).toBe(false)
    expect(zero.success).toBe(false)
    expect(decimal.success).toBe(false)
  })

  it('con monedas distintas conserva cada importe', () => {
    const values = schema.parse({
      ...base,
      fromAccountId: 'cop-1',
      toAccountId: 'usd-1',
      amount: 400000,
      receivedAmount: 100,
    })

    expect(values).toMatchObject({ amount: 400000, receivedAmount: 100 })
  })

  it('rechaza origen igual a destino', () => {
    const result = schema.safeParse({
      ...base,
      fromAccountId: 'usd-1',
      toAccountId: 'usd-1',
      amount: 10,
      receivedAmount: 10,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Elige dos cuentas distintas')
  })
})
