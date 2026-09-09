import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Ledger from './Ledger'
import type { Tables } from '@/types/database.types'

const useLedgerPage = vi.fn()
const useLedgerTotals = vi.fn()
const fetchLedgerForExport = vi.fn()
const downloadCsv = vi.fn()

vi.mock('@/features/ledger/hooks', () => ({
  useLedgerPage: (...args: unknown[]) => useLedgerPage(...args),
  useLedgerTotals: (...args: unknown[]) => useLedgerTotals(...args),
}))

vi.mock('@/features/ledger/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/ledger/api')>(
    '@/features/ledger/api',
  )
  return { ...actual, fetchLedgerForExport: (...args: unknown[]) => fetchLedgerForExport(...args) }
})

vi.mock('@/lib/csv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/csv')>('@/lib/csv')
  return { ...actual, downloadCsv: (...args: unknown[]) => downloadCsv(...args) }
})

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

const accounts = [
  { id: 'acc-1', name: 'Bancolombia', currency_code: 'COP', is_archived: false },
  { id: 'acc-2', name: 'Ahorros', currency_code: 'COP', is_archived: false },
] as Tables<'accounts'>[]

const categories = [
  { id: 'cat-1', name: 'Alimentación', type: 'expense', is_archived: false },
  { id: 'cat-2', name: 'Salario', type: 'income', is_archived: false },
] as Tables<'categories'>[]

vi.mock('@/features/accounts/hooks', () => ({ useAccounts: () => ({ data: accounts }) }))
vi.mock('@/features/categories/hooks', () => ({ useCategories: () => ({ data: categories }) }))
vi.mock('@/features/dashboard/hooks', () => ({ useAllTransactions: () => ({ data: [] }) }))
vi.mock('@/features/transactions/hooks', () => ({
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function tx(overrides: Partial<Tables<'transactions'>>): Tables<'transactions'> {
  return {
    id: 't1',
    user_id: 'user-1',
    account_id: 'acc-1',
    category_id: 'cat-1',
    type: 'expense',
    transfer_direction: null,
    transfer_group_id: null,
    amount_minor: 50_000,
    transaction_date: '2026-09-10',
    description: 'Mercado del mes',
    notes: null,
    is_reconciled: false,
    custom_fields: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const rows = [
  tx({}),
  tx({ id: 't2', type: 'income', category_id: 'cat-2', amount_minor: 300_000, description: 'Salario' }),
]

/** Argumentos con los que la página pidió la última página de datos. */
function lastPageCall() {
  const calls = useLedgerPage.mock.calls
  return calls[calls.length - 1]
}

function renderLedger() {
  return render(<Ledger />)
}

beforeEach(() => {
  vi.clearAllMocks()
  useLedgerPage.mockReturnValue({
    data: { rows, totalCount: 120 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  useLedgerTotals.mockReturnValue({
    data: {
      incomeMinor: 300_000,
      expenseMinor: 50_000,
      balanceMinor: 250_000,
      transferMinor: 0,
      count: 120,
    },
    isError: false,
  })
})

describe('Ledger', () => {
  it('muestra los movimientos de la página', () => {
    renderLedger()

    expect(screen.getAllByText('Mercado del mes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Salario').length).toBeGreaterThan(0)
  })

  it('muestra el resumen del conjunto filtrado, no solo de la página', () => {
    renderLedger()

    // La página trae 2 filas, pero el resumen refleje las 120 que cumplen los filtros.
    expect(screen.getByText('COP 300.000')).toBeInTheDocument()
    expect(screen.getByText('COP 250.000')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
  })

  it('pide al servidor los filtros de cuenta, tipo y fechas', async () => {
    const user = userEvent.setup()
    renderLedger()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cuenta' }), 'acc-1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'expense')

    await waitFor(() => {
      expect(lastPageCall()[0]).toMatchObject({ accountId: 'acc-1', type: 'expense' })
    })
  })

  it('envía la búsqueda al servidor solo tras dejar de escribir', async () => {
    const user = userEvent.setup()
    renderLedger()

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por descripción' }), 'mercado')

    await waitFor(() => {
      expect(lastPageCall()[0]).toMatchObject({ search: 'mercado' })
    })
  })

  it('solo ofrece categorías del tipo seleccionado', async () => {
    const user = userEvent.setup()
    renderLedger()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'income')

    const categorySelect = screen.getByRole('combobox', { name: 'Categoría' })
    expect(within(categorySelect).getByRole('option', { name: 'Salario' })).toBeInTheDocument()
    expect(
      within(categorySelect).queryByRole('option', { name: 'Alimentación' }),
    ).not.toBeInTheDocument()
  })

  it('limpia todos los filtros', async () => {
    const user = userEvent.setup()
    renderLedger()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cuenta' }), 'acc-1')
    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }))

    await waitFor(() => {
      expect(lastPageCall()[0]).toEqual({ search: undefined })
    })
  })

  it('ordena por la columna elegida en el servidor', async () => {
    const user = userEvent.setup()
    renderLedger()

    expect(lastPageCall()[1]).toEqual({ field: 'transaction_date', direction: 'desc' })

    await user.click(screen.getByRole('button', { name: /monto/i }))

    await waitFor(() => {
      expect(lastPageCall()[1].field).toBe('amount_minor')
    })
  })

  it('pagina en el servidor y vuelve a la primera página al filtrar', async () => {
    const user = userEvent.setup()
    renderLedger()

    expect(screen.getByText('1–50 de 120')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(lastPageCall()[2]).toBe(1))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cuenta' }), 'acc-2')
    await waitFor(() => expect(lastPageCall()[2]).toBe(0))
  })

  it('oculta el saldo acumulado hasta que se activa la columna', async () => {
    const user = userEvent.setup()
    renderLedger()

    expect(screen.queryByRole('columnheader', { name: /saldo acumulado/i })).not.toBeInTheDocument()

    await user.click(screen.getByText('Columnas'))
    await user.click(screen.getByRole('checkbox', { name: 'Saldo acumulado' }))

    expect(screen.getByRole('columnheader', { name: /saldo acumulado/i })).toBeInTheDocument()
  })

  it('exporta a CSV respetando los filtros activos', async () => {
    fetchLedgerForExport.mockResolvedValue(rows)
    const user = userEvent.setup()
    renderLedger()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'expense')
    await user.click(screen.getByRole('button', { name: /exportar csv/i }))

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledOnce())

    expect(fetchLedgerForExport).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ type: 'expense' }),
      expect.objectContaining({ field: 'transaction_date' }),
    )

    const [filename, csv] = downloadCsv.mock.calls[0]
    expect(filename).toMatch(/^fintrack-libro-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csv).toContain('Mercado del mes')
  })

  it('avisa cuando ningún movimiento coincide con los filtros', () => {
    useLedgerPage.mockReturnValue({
      data: { rows: [], totalCount: 0 },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderLedger()

    expect(screen.getByText('Ningún movimiento coincide con estos filtros.')).toBeInTheDocument()
    expect(screen.getByText('Sin movimientos')).toBeInTheDocument()
  })

  it('ofrece reintentar cuando la consulta falla', async () => {
    const refetch = vi.fn()
    useLedgerPage.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    })

    const user = userEvent.setup()
    renderLedger()

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los movimientos')

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
