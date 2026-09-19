import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TRANSFER_EDIT_WARNING, TransferForm } from './transfer-form'
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

  it('avisa con pedagogía cuando el destino es una tarjeta de crédito', async () => {
    const user = userEvent.setup()
    const withCard = [
      ...accounts,
      { id: 'acc-card', name: 'Visa', currency_code: 'COP', is_archived: false, type: 'credit_card' },
    ] as Tables<'accounts'>[]
    render(<TransferForm accounts={withCard} currencyCode="COP" onSubmit={vi.fn()} />)

    expect(screen.queryByText('Estás pagando una tarjeta de crédito')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Desde'), 'acc-1')
    await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-card')

    expect(screen.getByText('Estás pagando una tarjeta de crédito')).toBeInTheDocument()
    expect(screen.getByText(/no contará como un gasto nuevo/)).toBeInTheDocument()
  })

  it('no muestra el aviso de tarjeta al transferir entre cuentas corrientes', async () => {
    const user = userEvent.setup()
    render(<TransferForm accounts={accounts} currencyCode="COP" onSubmit={vi.fn()} />)

    await user.selectOptions(screen.getByLabelText('Desde'), 'acc-1')
    await user.selectOptions(screen.getByLabelText('Hacia'), 'acc-2')

    expect(screen.queryByText('Estás pagando una tarjeta de crédito')).not.toBeInTheDocument()
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

      expect(screen.getByText('Equivale a USD 40,00')).toBeInTheDocument()
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
      expect(screen.getByText('Equivale a USD 25,00')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /transferir/i }))

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          fromAccountId: 'acc-1',
          toAccountId: 'acc-usd',
          amount: 100000,
          receivedAmount: 2500,
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

describe('TransferForm — edición (M8)', () => {
  const editing = {
    fromAccountId: 'acc-1',
    toAccountId: 'acc-usd',
    amount: 100000,
    receivedAmount: 25,
    transactionDate: '2026-09-10',
    description: 'Paso a dólares',
  }

  function renderEditing(onSubmit = vi.fn()) {
    render(
      <TransferForm
        accounts={accounts}
        currencyCode="COP"
        defaultValues={editing}
        lockedCurrencies={{ from: 'COP', to: 'USD' }}
        submitLabel="Guardar cambios"
        onSubmit={onSubmit}
      />,
    )
    return onSubmit
  }

  it('abre la transferencia con el importe de cada pata', () => {
    renderEditing()

    expect((screen.getByLabelText('Desde') as HTMLSelectElement).value).toBe('acc-1')
    expect((screen.getByLabelText('Hacia') as HTMLSelectElement).value).toBe('acc-usd')
    expect((screen.getByLabelText('Monto enviado (COP)') as HTMLInputElement).value).toBe('100.000')
    expect((screen.getByLabelText('Monto recibido (USD)') as HTMLInputElement).value).toBe('0,25')
    expect((screen.getByLabelText('Fecha') as HTMLInputElement).value).toBe('2026-09-10')
  })

  it('guarda las dos patas sin tocar los importes si nada cambió', async () => {
    const user = userEvent.setup()
    const onSubmit = renderEditing()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

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

  it('una transferencia de la misma moneda se edita con un solo monto', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <TransferForm
        accounts={accounts}
        currencyCode="COP"
        defaultValues={{
          fromAccountId: 'acc-1',
          toAccountId: 'acc-2',
          amount: 30000,
          receivedAmount: 30000,
          transactionDate: '2026-09-10',
          description: 'Traspaso',
        }}
        lockedCurrencies={{ from: 'COP', to: 'COP' }}
        submitLabel="Guardar cambios"
        onSubmit={onSubmit}
      />,
    )

    expect(screen.queryByLabelText(/Monto recibido/)).not.toBeInTheDocument()
    expect(screen.queryByText(TRANSFER_EDIT_WARNING)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 30000, receivedAmount: 30000 }),
      expect.anything(),
    )
  })

  it('cada pata solo ofrece cuentas de su misma moneda', () => {
    renderEditing()

    const from = within(screen.getByLabelText('Desde')).getAllByRole('option')
    const to = within(screen.getByLabelText('Hacia')).getAllByRole('option')

    expect(from.map((option) => option.textContent)).toEqual([
      'Selecciona...',
      'Efectivo',
      'Ahorros',
    ])
    expect(to.map((option) => option.textContent)).toEqual(['Selecciona...', 'Cuenta USD'])
  })

  it('avisa al cambiar una cuenta, no al corregir la descripción', async () => {
    const user = userEvent.setup()
    renderEditing()

    await user.type(screen.getByLabelText('Descripción'), ' corregida')
    expect(screen.queryByText(TRANSFER_EDIT_WARNING)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Desde'), 'acc-2')
    expect(screen.getByText(TRANSFER_EDIT_WARNING)).toBeInTheDocument()
  })
})

describe('createTransferSchema — monedas bloqueadas (M8)', () => {
  const currencies = new Map([
    ['cop-1', 'COP'],
    ['cop-2', 'COP'],
    ['usd-1', 'USD'],
  ])
  const schema = createTransferSchema(currencies, { from: 'COP', to: 'USD' })
  const base = { transactionDate: '2026-09-14', description: 'Transferencia' }

  it('acepta cambiar de cuenta dentro de la misma moneda', () => {
    const result = schema.safeParse({
      ...base,
      fromAccountId: 'cop-2',
      toAccountId: 'usd-1',
      amount: 100000,
      receivedAmount: 25,
    })

    expect(result.success).toBe(true)
  })

  it('rechaza mover una pata a otra moneda y lo dice en cada selector', () => {
    const result = schema.safeParse({
      ...base,
      fromAccountId: 'usd-1',
      toAccountId: 'cop-2',
      amount: 100000,
      receivedAmount: 25,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['fromAccountId'],
        message: 'Elige una cuenta en COP: editar no cambia la moneda de la transferencia',
      }),
      expect.objectContaining({
        path: ['toAccountId'],
        message: 'Elige una cuenta en USD: editar no cambia la moneda de la transferencia',
      }),
    ])
  })
})
