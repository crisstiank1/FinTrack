import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import type { Tables } from '@/types/database.types'

import Accounts from './Accounts'

const useAccounts = vi.fn()
const useAllTransactions = vi.fn()
const createAccountMutate = vi.fn()
const updateAccountMutate = vi.fn()
const archiveAccountMutate = vi.fn()

vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => useAccounts(),
  useCreateAccount: () => ({ mutateAsync: createAccountMutate, isPending: false }),
  useUpdateAccount: () => ({ mutateAsync: updateAccountMutate, isPending: false }),
  useArchiveAccount: () => ({ mutateAsync: archiveAccountMutate }),
}))

vi.mock('@/features/dashboard/hooks', () => ({
  useAllTransactions: () => useAllTransactions(),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const accounts = [
  {
    id: 'acc-con-movimientos',
    user_id: 'user-1',
    name: 'Banco',
    type: 'checking',
    initial_balance_minor: 100_000,
    currency_code: 'USD',
    icon: 'landmark',
    color: '#E83E8C',
    is_archived: false,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'acc-sin-movimientos',
    user_id: 'user-1',
    name: 'Efectivo',
    type: 'cash',
    initial_balance_minor: 0,
    currency_code: 'COP',
    icon: 'wallet',
    color: '#E83E8C',
    is_archived: false,
    created_at: '',
    updated_at: '',
  },
] as Tables<'accounts'>[]

const transactions = [
  {
    id: 'tx-1',
    user_id: 'user-1',
    account_id: 'acc-con-movimientos',
    category_id: null,
    type: 'income',
    transfer_direction: null,
    amount_minor: 50_000,
    transaction_date: '2026-09-01',
    description: 'Ingreso',
    notes: null,
    is_reconciled: false,
    transfer_group_id: null,
    created_at: '',
    updated_at: '',
  },
] as Tables<'transactions'>[]

function renderAccounts() {
  return render(
    <MemoryRouter>
      <Accounts />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useAccounts.mockReset()
  useAllTransactions.mockReset()
  useAccounts.mockReturnValue({ data: accounts, isLoading: false })
  useAllTransactions.mockReturnValue({ data: transactions })
})

describe('Accounts — formulario de creación', () => {
  it('ofrece COP, USD y ARS con etiquetas al crear', async () => {
    const user = userEvent.setup()
    renderAccounts()

    await user.click(screen.getByRole('button', { name: /nueva cuenta/i }))

    expect(await screen.findByRole('option', { name: 'Peso colombiano (COP)' })).toHaveValue('COP')
    expect(screen.getByRole('option', { name: 'Dólar estadounidense (USD)' })).toHaveValue('USD')
    expect(screen.getByRole('option', { name: 'Peso argentino (ARS)' })).toHaveValue('ARS')
    expect(screen.queryByRole('option', { name: 'Euro (EUR)' })).not.toBeInTheDocument()
  })
})

describe('Accounts — bloqueo de moneda', () => {
  it('bloquea la moneda y lo explica al editar una cuenta con movimientos', async () => {
    const user = userEvent.setup()
    renderAccounts()

    await user.click(screen.getAllByRole('button', { name: /editar/i })[0])

    expect(await screen.findByLabelText('Moneda')).toBeDisabled()
    expect(
      screen.getByText('La moneda no se puede cambiar porque la cuenta ya tiene movimientos'),
    ).toBeInTheDocument()
  })

  it('permite cambiar la moneda al editar una cuenta sin movimientos', async () => {
    const user = userEvent.setup()
    renderAccounts()

    await user.click(screen.getAllByRole('button', { name: /editar/i })[1])

    const currencySelect = await screen.findByLabelText('Moneda')
    expect(currencySelect).toBeEnabled()
    expect(
      screen.queryByText('La moneda no se puede cambiar porque la cuenta ya tiene movimientos'),
    ).not.toBeInTheDocument()

    await user.selectOptions(currencySelect, 'ARS')
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(updateAccountMutate).toHaveBeenCalledWith({
      id: 'acc-sin-movimientos',
      input: expect.objectContaining({ currency_code: 'ARS' }),
    })
  })
})
