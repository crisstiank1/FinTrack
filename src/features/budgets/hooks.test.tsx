import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { supabase } from '@/lib/supabase'

import { useBudgetProgress } from './hooks'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

/**
 * Ejercita `useBudgetProgress` con supabase real mocked y de verdad el flujo de
 * `fetchTransactions` paginado (M11): a diferencia del dashboard, los
 * presupuestos no descargan el historial completo, pero un mes con más de 1000
 * gastos debe llegar entero al progreso, sin truncarse en la página 1. La
 * resolución y la clasificación ya están probadas en `budgets/`; aquí se
 * comprueba que reciben todos los movimientos del conjunto.
 */

interface QueryResult {
  data: unknown[] | null
  error: unknown
}

type TableData = unknown[]
type TableProvider = (call: number) => QueryResult

const CHAINABLE = ['select', 'eq', 'gte', 'lte', 'in', 'order', 'range'] as const

interface QueryCall {
  table: string
  method: string
  args: unknown[]
}

const fromMock = supabase.from as unknown as Mock

function createChain(call: { result: QueryResult; table: string; calls: QueryCall[] }) {
  const chain: Record<string, unknown> = {
    then: (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(call.result).then(onFulfilled, onRejected),
  }

  for (const method of CHAINABLE) {
    chain[method] = (...args: unknown[]) => {
      call.calls.push({ table: call.table, method, args })
      return chain
    }
  }

  return chain
}

/**
 * Configura la respuesta por tabla. Las tablas que no aparecen devuelven una
 * lista vacía; `transactions` suele ser una función, porque cada página es una
 * consulta y el conjunto llega en varias llamadas.
 */
function mockTables(providers: Partial<Record<string, TableData | TableProvider>>) {
  const calls: QueryCall[] = []
  const tables: string[] = []
  const counts: Record<string, number> = {}

  fromMock.mockImplementation((table: string) => {
    tables.push(table)
    const call = counts[table] ?? 0
    counts[table] = call + 1

    const provider = providers[table]
    const result: QueryResult =
      typeof provider === 'function'
        ? (provider as TableProvider)(call)
        : { data: provider ?? [], error: null }

    return createChain({ result, table, calls })
  })

  return { tables, calls }
}

function expense(id: string) {
  return {
    id,
    user_id: 'user-1',
    account_id: 'acc-cop',
    category_id: 'cat-1',
    type: 'expense',
    transfer_direction: null,
    transfer_group_id: null,
    amount_minor: 100,
    transaction_date: '2026-09-10',
    created_at: '2026-09-10T00:00:00.000Z',
    updated_at: '2026-09-10T00:00:00.000Z',
  }
}

function expensePage(size: number, offset: number) {
  return Array.from({ length: size }, (_, i) => expense(`t-${offset + i}`))
}

const account = { id: 'acc-cop', currency_code: 'COP' }

const budget = {
  id: 'b-1',
  category_id: 'cat-1',
  period_month: null,
  effective_from: '2026-01-01',
  amount_minor: 200_000,
}

function renderBudgetProgress(providers: Partial<Record<string, TableData | TableProvider>>) {
  const { tables, calls } = mockTables(providers)
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const rendered = renderHook(
    () => useBudgetProgress({ monthKey: '2026-09', categoryIds: ['cat-1'], currencyCode: 'COP' }),
    { wrapper },
  )

  return { ...rendered, tables, calls }
}

beforeEach(() => {
  fromMock.mockReset()
})

describe('useBudgetProgress', () => {
  it('un mes con más de 1000 gastos llega entero al progreso (M11)', async () => {
    const expensePages = [
      { data: expensePage(1000, 0), error: null },
      { data: expensePage(200, 1000), error: null },
    ]
    const { result, calls } = renderBudgetProgress({
      transactions: () => expensePages.shift() ?? { data: [], error: null },
      budgets: [budget],
      accounts: [account],
    })

    await waitFor(() => expect(result.current.data).toBeDefined())

    expect(result.current.data).toEqual([
      {
        categoryId: 'cat-1',
        budgetMinor: 200_000,
        spentMinor: 120_000,
        remainingMinor: 80_000,
        ratio: 0.6,
        status: 'ok',
        source: 'template',
      },
    ])
    expect(result.current.exclusions).toEqual({ count: 0, currencyCodes: [] })
    expect(result.current.isPending).toBe(false)
    expect(result.current.isError).toBe(false)

    const transactionRanges = calls
      .filter((call) => call.table === 'transactions')
      .filter((call) => call.method === 'range')
      .map((call) => call.args)
    expect(transactionRanges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('si una página de gastos falla, el progreso entra en error y no muestra parcial (M11)', async () => {
    const boom = new Error('boom')
    const { result } = renderBudgetProgress({
      transactions: (call) =>
        call === 0 ? { data: expensePage(1000, 0), error: null } : { data: null, error: boom },
      budgets: [budget],
      accounts: [account],
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBe(boom)
  })
})
