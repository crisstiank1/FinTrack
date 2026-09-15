import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { supabase } from '@/lib/supabase'

import { fetchLedgerTotals, groupLedgerTotalsByCurrency } from './api'

/**
 * Doble local del constructor de consultas de PostgREST, con el mismo diseño
 * que el de `plan/api.test.ts`: registra qué métodos se llamaron y con qué
 * argumentos, y devuelve un resultado por consulta (una por página).
 */
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

interface QueryCall {
  method: string
  args: unknown[]
}

interface QueryResult {
  data: unknown
  error: unknown
}

const CHAINABLE = ['select', 'eq', 'in', 'ilike', 'gte', 'lte', 'order', 'range'] as const

const fromMock = supabase.from as unknown as Mock

function mockQueries(...results: QueryResult[]) {
  const calls: QueryCall[][] = []
  const pending = [...results]

  fromMock.mockImplementation(() => {
    const result = pending.shift() ?? { data: [], error: null }
    const queryCalls: QueryCall[] = []
    calls.push(queryCalls)

    const chain: Record<string, unknown> = {
      then: (
        onFulfilled: (value: QueryResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
    }

    for (const method of CHAINABLE) {
      chain[method] = (...args: unknown[]) => {
        queryCalls.push({ method, args })
        return chain
      }
    }

    return chain
  })

  return calls
}

function row(type: string, accountId: string, amountMinor: number) {
  return { type, account_id: accountId, amount_minor: amountMinor }
}

beforeEach(() => {
  fromMock.mockReset()
})

describe('fetchLedgerTotals', () => {
  it('no usa funciones de agregación: pide solo las columnas que suma', async () => {
    const calls = mockQueries({ data: [], error: null })

    await fetchLedgerTotals('user-1', {})

    expect(calls[0]).toContainEqual({
      method: 'select',
      args: ['type, account_id, amount_minor'],
    })
    expect(JSON.stringify(calls)).not.toContain('sum()')
  })

  it('suma por tipo y cuenta y cuenta los movimientos', async () => {
    mockQueries({
      data: [
        row('income', 'acc-cop', 300_000),
        row('expense', 'acc-cop', 50_000),
        row('expense', 'acc-cop', 20_000),
        row('income', 'acc-usd', 1_500),
        row('transfer', 'acc-usd', 100),
      ],
      error: null,
    })

    const totals = await fetchLedgerTotals('user-1', {})

    expect(totals.count).toBe(5)
    expect(totals.byAccount).toEqual(
      expect.arrayContaining([
        { type: 'income', accountId: 'acc-cop', totalMinor: 300_000 },
        { type: 'expense', accountId: 'acc-cop', totalMinor: 70_000 },
        { type: 'income', accountId: 'acc-usd', totalMinor: 1_500 },
        { type: 'transfer', accountId: 'acc-usd', totalMinor: 100 },
      ]),
    )
    expect(totals.byAccount).toHaveLength(4)
  })

  it('aplica el usuario y los filtros del libro', async () => {
    const calls = mockQueries({ data: [], error: null })

    await fetchLedgerTotals('user-1', {
      accountId: 'acc-cop',
      type: 'expense',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    })

    expect(calls[0]).toEqual(
      expect.arrayContaining([
        { method: 'eq', args: ['user_id', 'user-1'] },
        { method: 'eq', args: ['account_id', 'acc-cop'] },
        { method: 'eq', args: ['type', 'expense'] },
        { method: 'gte', args: ['transaction_date', '2026-09-01'] },
        { method: 'lte', args: ['transaction_date', '2026-09-30'] },
      ]),
    )
  })

  it('acota a las cuentas de la moneda elegida', async () => {
    const calls = mockQueries({ data: [], error: null })

    await fetchLedgerTotals('user-1', { currencyCode: 'USD', accountIds: ['acc-usd', 'acc-usd-2'] })

    expect(calls[0]).toContainEqual({
      method: 'in',
      args: ['account_id', ['acc-usd', 'acc-usd-2']],
    })
  })

  it('no envía un filtro de cuentas vacío ni filtra sin moneda elegida', async () => {
    const calls = mockQueries({ data: [], error: null }, { data: [], error: null })

    await fetchLedgerTotals('user-1', { accountIds: [] })
    await fetchLedgerTotals('user-1', {})

    expect(calls.flat().some((call) => call.method === 'in')).toBe(false)
  })

  it('recorre todas las páginas con un orden estable', async () => {
    const fullPage = Array.from({ length: 1000 }, () => row('expense', 'acc-cop', 1))
    const calls = mockQueries(
      { data: fullPage, error: null },
      { data: [row('expense', 'acc-cop', 5)], error: null },
    )

    const totals = await fetchLedgerTotals('user-1', {})

    expect(calls).toHaveLength(2)
    expect(calls[0]).toContainEqual({ method: 'order', args: ['id', { ascending: true }] })
    expect(calls[0]).toContainEqual({ method: 'range', args: [0, 999] })
    expect(calls[1]).toContainEqual({ method: 'range', args: [1000, 1999] })
    expect(totals.count).toBe(1001)
    expect(totals.byAccount).toEqual([{ type: 'expense', accountId: 'acc-cop', totalMinor: 1_005 }])
  })

  it('propaga el error de la consulta', async () => {
    const failure = { code: 'PGRST000', message: 'fallo' }
    mockQueries({ data: null, error: failure })

    await expect(fetchLedgerTotals('user-1', {})).rejects.toBe(failure)
  })
})

describe('groupLedgerTotalsByCurrency', () => {
  const currencyByAccountId = new Map([
    ['acc-cop', 'COP'],
    ['acc-usd', 'USD'],
  ])

  it('agrupa por la moneda de cada cuenta, con la principal primero', () => {
    const grouped = groupLedgerTotalsByCurrency(
      {
        byAccount: [
          { type: 'income', accountId: 'acc-usd', totalMinor: 1_500 },
          { type: 'expense', accountId: 'acc-usd', totalMinor: 400 },
          { type: 'income', accountId: 'acc-cop', totalMinor: 300_000 },
        ],
        count: 3,
      },
      currencyByAccountId,
      'COP',
      'COP',
    )

    expect(grouped).toEqual([
      {
        currencyCode: 'COP',
        incomeMinor: 300_000,
        expenseMinor: 0,
        balanceMinor: 300_000,
        transferMinor: 0,
      },
      {
        currencyCode: 'USD',
        incomeMinor: 1_500,
        expenseMinor: 400,
        balanceMinor: 1_100,
        transferMinor: 0,
      },
    ])
  })

  it('una cuenta desconocida cae en la moneda de respaldo', () => {
    const grouped = groupLedgerTotalsByCurrency(
      { byAccount: [{ type: 'expense', accountId: 'acc-x', totalMinor: 10 }], count: 1 },
      currencyByAccountId,
      'ARS',
    )

    expect(grouped.map((entry) => entry.currencyCode)).toEqual(['ARS'])
  })
})
