import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PAGE_HELP } from '@/components/shared/page-help'
import type { Tables } from '@/types/database.types'

import { TRANSFER_EDIT_WARNING } from '@/features/transactions/components/transfer-form'

import Transactions from './Transactions'

const useTransactions = vi.fn()
const useTransferCounterparts = vi.fn()
const createTransfer = vi.fn()
const updateTransfer = vi.fn()
const usePrimaryCurrency = vi.fn()
const useAccounts = vi.fn()
const mutation = () => ({ mutateAsync: vi.fn(), isPending: false })

vi.mock('@/features/transactions/hooks', () => ({
  useTransactions: (filters: unknown) => useTransactions(filters),
  useTransferCounterparts: (transactions: unknown) => useTransferCounterparts(transactions),
  useCreateTransaction: () => mutation(),
  useUpdateTransaction: () => mutation(),
  useCreateTransfer: () => ({ mutateAsync: createTransfer, isPending: false }),
  useUpdateTransfer: () => ({ mutateAsync: updateTransfer, isPending: false }),
  useDeleteTransaction: () => mutation(),
  useDuplicateTransaction: () => mutation(),
}))

const accounts = [
  { id: 'acc-bank', name: 'Banco', currency_code: 'COP', is_archived: false },
  { id: 'acc-old', name: 'Cuenta vieja', currency_code: 'COP', is_archived: true },
  { id: 'acc-usd', name: 'Cuenta USD', currency_code: 'USD', is_archived: false },
] as Tables<'accounts'>[]

vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => useAccounts(),
}))

vi.mock('@/features/profile/hooks', () => ({
  usePrimaryCurrency: () => usePrimaryCurrency(),
}))

vi.mock('@/features/categories/hooks', () => ({
  useCategories: () => ({ data: [] }),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

let currentSearch = ''

/** Deja a la vista la URL actual para comprobar qué escribe la página. */
function LocationProbe() {
  currentSearch = useLocation().search
  return null
}

function renderTransactions(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/transactions"
          element={
            <>
              <Transactions />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function lastFilters() {
  const { calls } = useTransactions.mock
  return calls[calls.length - 1]?.[0]
}

function monthInput(): HTMLInputElement {
  return screen.getByLabelText('Mes') as HTMLInputElement
}

beforeEach(() => {
  // Hoy es 12 de septiembre de 2026: el mes actual es 2026-09. Solo se falsea la
  // fecha, no los temporizadores.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 12))
  useTransactions.mockReset()
  useTransactions.mockReturnValue({ data: [], isLoading: false })
  useTransferCounterparts.mockReset()
  useTransferCounterparts.mockReturnValue({ data: undefined })
  createTransfer.mockReset()
  createTransfer.mockResolvedValue([])
  updateTransfer.mockReset()
  updateTransfer.mockResolvedValue([])
  usePrimaryCurrency.mockReturnValue({ data: 'COP', isPending: false })
  useAccounts.mockReturnValue({ data: accounts })
  currentSearch = ''
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Transactions — mes en la URL', () => {
  it('abre el mes de ?month y lo pide así', () => {
    renderTransactions('/transactions?month=2026-08')

    expect(monthInput().value).toBe('2026-08')
    expect(lastFilters()).toMatchObject({ month: '2026-08' })
  })

  it('sin parámetro abre el mes actual y no reescribe la URL', () => {
    renderTransactions('/transactions')

    expect(monthInput().value).toBe('2026-09')
    expect(lastFilters()).toMatchObject({ month: '2026-09' })
    expect(currentSearch).toBe('')
  })

  it('con un mes inválido abre el mes actual sin reescribir la URL', () => {
    renderTransactions('/transactions?month=2026-13')

    expect(monthInput().value).toBe('2026-09')
    expect(lastFilters()).toMatchObject({ month: '2026-09' })
    expect(currentSearch).toBe('?month=2026-13')
  })

  it('con ?month= vacío muestra todos los meses', () => {
    renderTransactions('/transactions?month=')

    expect(monthInput().value).toBe('')
    expect(lastFilters()?.month).toBeUndefined()
  })

  it('cambiar el mes lo escribe en la URL', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(monthInput(), { target: { value: '2026-07' } })

    expect(currentSearch).toBe('?month=2026-07')
    expect(monthInput().value).toBe('2026-07')
    expect(lastFilters()).toMatchObject({ month: '2026-07' })
  })

  it('vaciar el mes escribe ?month= y deja de acotar por mes', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(monthInput(), { target: { value: '' } })

    expect(currentSearch).toBe('?month=')
    expect(lastFilters()?.month).toBeUndefined()
  })
})

describe('Transactions — cuenta y tipo', () => {
  it('cambiar el mes conserva la cuenta y el tipo elegidos', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(screen.getByLabelText('Cuenta'), { target: { value: 'acc-bank' } })
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'expense' } })
    fireEvent.change(monthInput(), { target: { value: '2026-07' } })

    expect(lastFilters()).toEqual({ month: '2026-07', accountId: 'acc-bank', type: 'expense' })
  })

  it('vaciar el mes también conserva la cuenta y el tipo', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'transfer' } })
    fireEvent.change(monthInput(), { target: { value: '' } })

    expect(lastFilters()).toMatchObject({ type: 'transfer' })
    expect(lastFilters()?.month).toBeUndefined()
  })

  it('cuenta y tipo no se escriben en la URL', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(screen.getByLabelText('Cuenta'), { target: { value: 'acc-old' } })
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'income' } })

    expect(currentSearch).toBe('?month=2026-08')
    expect(lastFilters()).toEqual({ month: '2026-08', accountId: 'acc-old', type: 'income' })
  })

  it('un mes sin movimientos con filtros activos muestra el vacío de siempre', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(screen.getByLabelText('Cuenta'), { target: { value: 'acc-old' } })

    expect(screen.getByText(/No hay movimientos para este período/)).toBeInTheDocument()
  })
})

describe('Transactions — moneda', () => {
  function optionLabels(select: HTMLElement): string[] {
    return within(select)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '')
  }

  it('con una sola moneda no muestra el selector', () => {
    useAccounts.mockReturnValue({
      data: accounts.filter((account) => account.currency_code === 'COP'),
    })
    renderTransactions('/transactions?month=2026-08')

    expect(screen.queryByLabelText('Moneda')).not.toBeInTheDocument()
  })

  it('ofrece solo las monedas de las cuentas, con la principal primero', () => {
    usePrimaryCurrency.mockReturnValue({ data: 'USD', isPending: false })
    renderTransactions('/transactions?month=2026-08')

    expect(optionLabels(screen.getByLabelText('Moneda'))).toEqual([
      'Todas las monedas',
      'USD',
      'COP',
    ])
  })

  it('elegir una moneda pide solo sus cuentas y acota el selector de cuenta', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'COP' } })

    expect(lastFilters()).toMatchObject({
      currencyCode: 'COP',
      accountIds: ['acc-bank', 'acc-old'],
    })
    expect(optionLabels(screen.getByLabelText('Cuenta'))).toEqual([
      'Todas las cuentas',
      'Banco',
      'Cuenta vieja',
    ])
  })

  it('elegir otra moneda limpia una cuenta que no es de esa moneda', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(screen.getByLabelText('Cuenta'), { target: { value: 'acc-usd' } })
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'COP' } })

    expect(lastFilters()?.accountId).toBeUndefined()
    expect(screen.getByLabelText('Cuenta')).toHaveValue('')
  })

  it('elegir la moneda de la cuenta seleccionada la conserva', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(screen.getByLabelText('Cuenta'), { target: { value: 'acc-usd' } })
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'USD' } })

    expect(lastFilters()).toMatchObject({ accountId: 'acc-usd', accountIds: ['acc-usd'] })
  })

  it('volver a «Todas las monedas» deja de acotar por cuentas', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'USD' } })
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: '' } })

    expect(lastFilters()?.currencyCode).toBeUndefined()
    expect(lastFilters()?.accountIds).toBeUndefined()
  })

  it('la moneda no se escribe en la URL y cambiar el mes la conserva', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'USD' } })
    fireEvent.change(monthInput(), { target: { value: '2026-07' } })

    expect(currentSearch).toBe('?month=2026-07')
    expect(lastFilters()).toMatchObject({ month: '2026-07', currencyCode: 'USD' })
  })
})

describe('Transactions — formularios', () => {
  it('abrir «Nuevo movimiento» sigue funcionando con el mes en la URL', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo movimiento' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Nuevo movimiento' })).toBeInTheDocument()
    expect(currentSearch).toBe('?month=2026-08')
  })

  it('el formulario usa la moneda principal hasta que se elige cuenta', () => {
    usePrimaryCurrency.mockReturnValue({ data: 'USD', isPending: false })
    renderTransactions('/transactions?month=2026-08')

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo movimiento' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Equivale a USD 0,00')).toBeInTheDocument()

    fireEvent.change(dialog.getByLabelText('Cuenta'), { target: { value: 'acc-bank' } })
    expect(dialog.getByText('Equivale a COP 0')).toBeInTheDocument()
  })
})

function row(overrides: Partial<Tables<'transactions'>>): Tables<'transactions'> {
  return {
    id: 't1',
    user_id: 'user-1',
    account_id: 'acc-bank',
    category_id: null,
    type: 'income',
    transfer_direction: null,
    transfer_group_id: null,
    amount_minor: 0,
    transaction_date: '2026-08-10',
    description: 'Movimiento',
    notes: null,
    is_reconciled: false,
    custom_fields: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('Transactions — moneda de cada fila', () => {
  it('muestra cada movimiento en la moneda de su cuenta', () => {
    useTransactions.mockReturnValue({
      data: [
        row({ id: 't-cop', amount_minor: 250_000, description: 'Salario' }),
        row({
          id: 't-usd',
          account_id: 'acc-usd',
          type: 'expense',
          amount_minor: 40,
          description: 'Suscripción',
        }),
      ],
      isLoading: false,
    })

    renderTransactions('/transactions?month=2026-08')

    expect(screen.getByText(/COP 250\.000/)).toBeInTheDocument()
    expect(screen.getByText(/USD 0,40/)).toBeInTheDocument()
  })
})

describe('Transactions — transferencias entre monedas', () => {
  const transferRows = [
    row({
      id: 't-out',
      account_id: 'acc-bank',
      type: 'transfer',
      transfer_direction: 'outgoing',
      transfer_group_id: 'g-1',
      amount_minor: 100_000,
      description: 'Paso a dólares',
    }),
    row({
      id: 't-in',
      account_id: 'acc-usd',
      type: 'transfer',
      transfer_direction: 'incoming',
      transfer_group_id: 'g-1',
      amount_minor: 25,
      description: 'Paso a dólares',
    }),
  ]

  it('muestra las dos patas, cada una en su moneda y con su contraparte', () => {
    useTransactions.mockReturnValue({ data: transferRows, isLoading: false })
    useTransferCounterparts.mockReturnValue({
      data: new Map([
        ['t-out', { accountId: 'acc-usd', amountMinor: 25, direction: 'incoming' }],
        ['t-in', { accountId: 'acc-bank', amountMinor: 100_000, direction: 'outgoing' }],
      ]),
    })

    renderTransactions('/transactions?month=2026-08')

    expect(screen.getAllByText('Paso a dólares')).toHaveLength(2)
    expect(screen.getByText('− COP 100.000')).toBeInTheDocument()
    expect(screen.getByText('+ USD 0,25')).toBeInTheDocument()
    expect(screen.getByText('→ Cuenta USD · + USD 0,25')).toBeInTheDocument()
    expect(screen.getByText('← Banco · − COP 100.000')).toBeInTheDocument()
  })

  it('filtrando USD, la pata visible sigue indicando la cuenta COP de origen', () => {
    useTransactions.mockReturnValue({ data: [transferRows[1]], isLoading: false })
    useTransferCounterparts.mockReturnValue({
      data: new Map([
        ['t-in', { accountId: 'acc-bank', amountMinor: 100_000, direction: 'outgoing' }],
      ]),
    })

    renderTransactions('/transactions?month=2026-08')
    fireEvent.change(screen.getByLabelText('Moneda'), { target: { value: 'USD' } })

    expect(lastFilters()).toMatchObject({ currencyCode: 'USD', accountIds: ['acc-usd'] })
    expect(screen.getAllByText('Paso a dólares')).toHaveLength(1)
    expect(screen.getByText('← Banco · − COP 100.000')).toBeInTheDocument()
  })

  it('registra cada pata con su propio importe', async () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Desde'), { target: { value: 'acc-bank' } })
    fireEvent.change(dialog.getByLabelText('Hacia'), { target: { value: 'acc-usd' } })
    fireEvent.change(dialog.getByLabelText('Monto enviado (COP)'), {
      target: { value: '100000' },
    })
    fireEvent.change(dialog.getByLabelText('Monto recibido (USD)'), { target: { value: '25' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Transferir' }))

    await vi.waitFor(() => expect(createTransfer).toHaveBeenCalledOnce())
    expect(createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        fromAccountId: 'acc-bank',
        toAccountId: 'acc-usd',
        fromAmountMinor: 100_000,
        toAmountMinor: 2500,
      }),
    )
  })
})

describe('Transactions — editar transferencias (M8)', () => {
  const transferRows = [
    row({
      id: 't-out',
      account_id: 'acc-bank',
      type: 'transfer',
      transfer_direction: 'outgoing',
      transfer_group_id: 'g-1',
      amount_minor: 100_000,
      description: 'Paso a dólares',
    }),
    row({
      id: 't-in',
      account_id: 'acc-usd',
      type: 'transfer',
      transfer_direction: 'incoming',
      transfer_group_id: 'g-1',
      amount_minor: 25,
      description: 'Paso a dólares',
    }),
  ]

  const counterparts = new Map([
    ['t-out', { accountId: 'acc-usd', amountMinor: 25, direction: 'incoming' }],
    ['t-in', { accountId: 'acc-bank', amountMinor: 100_000, direction: 'outgoing' }],
  ])

  beforeEach(() => {
    useTransactions.mockReturnValue({ data: transferRows, isLoading: false })
    useTransferCounterparts.mockReturnValue({ data: counterparts })
  })

  it('sin la otra pata cargada no ofrece editar', () => {
    useTransferCounterparts.mockReturnValue({ data: undefined })

    renderTransactions('/transactions?month=2026-08')

    expect(screen.queryByRole('button', { name: 'Editar transferencia' })).not.toBeInTheDocument()
    // Duplicar y eliminar siguen disponibles: no dependen de la otra pata.
    expect(screen.getAllByRole('button', { name: 'Duplicar movimiento' })).toHaveLength(2)
  })

  it('abre la transferencia completa desde la pata que entra, en su sentido original', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar transferencia' })[1])

    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Editar transferencia')).toBeInTheDocument()
    expect((dialog.getByLabelText('Desde') as HTMLSelectElement).value).toBe('acc-bank')
    expect((dialog.getByLabelText('Hacia') as HTMLSelectElement).value).toBe('acc-usd')
    expect((dialog.getByLabelText('Monto enviado (COP)') as HTMLInputElement).value).toBe('100.000')
    expect((dialog.getByLabelText('Monto recibido (USD)') as HTMLInputElement).value).toBe('0,25')
  })

  it('guarda las dos patas con su grupo y cada importe en su moneda', async () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar transferencia' })[0])
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText('Monto recibido (USD)'), { target: { value: '30' } })

    expect(dialog.getByText(TRANSFER_EDIT_WARNING)).toBeInTheDocument()

    fireEvent.click(dialog.getByRole('button', { name: 'Guardar cambios' }))

    await vi.waitFor(() => expect(updateTransfer).toHaveBeenCalledOnce())
    expect(updateTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        transferGroupId: 'g-1',
        fromAccountId: 'acc-bank',
        toAccountId: 'acc-usd',
        fromAmountMinor: 100_000,
        toAmountMinor: 3000,
        transactionDate: '2026-08-10',
      }),
    )
    // Editar una transferencia no crea otra.
    expect(createTransfer).not.toHaveBeenCalled()
  })

  it('«Transferir» abre el formulario vacío aunque se acabe de editar una', () => {
    renderTransactions('/transactions?month=2026-08')

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar transferencia' })[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /cerrar/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Transferir' }))

    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Transferir entre cuentas')).toBeInTheDocument()
    expect((dialog.getByLabelText('Desde') as HTMLSelectElement).value).toBe('')
    expect(dialog.getByRole('button', { name: 'Transferir' })).toBeInTheDocument()
  })
})

describe('Transactions — ayuda de la pantalla (M18)', () => {
  it('el «?» junto al título explica la pantalla', async () => {
    renderTransactions('/transactions')

    fireEvent.click(await screen.findByRole('button', { name: 'Ayuda: Movimientos' }))

    expect(screen.getByRole('region', { name: 'Movimientos' })).toHaveTextContent(
      PAGE_HELP.transactions,
    )
  })
})
