import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Tables } from '@/types/database.types'

import Transactions from './Transactions'

const useTransactions = vi.fn()
const usePrimaryCurrency = vi.fn()
const useAccounts = vi.fn()
const mutation = () => ({ mutateAsync: vi.fn(), isPending: false })

vi.mock('@/features/transactions/hooks', () => ({
  useTransactions: (filters: unknown) => useTransactions(filters),
  useCreateTransaction: () => mutation(),
  useUpdateTransaction: () => mutation(),
  useCreateTransfer: () => mutation(),
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
    expect(dialog.getByText('Equivale a USD 0')).toBeInTheDocument()

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
    expect(screen.getByText(/USD 40/)).toBeInTheDocument()
  })
})
