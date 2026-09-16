import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

import {
  fetchTransactions,
  pairTransferLegs,
  transferEditDefaults,
  transferUpdateError,
  updateTransferPair,
  type TransferPair,
  type UpdateTransferInput,
} from './api'

/**
 * Doble local del constructor de consultas de PostgREST, con el mismo diseño
 * que el de `ledger/api.test.ts`: registra qué métodos se llamaron y con qué
 * argumentos, y devuelve un resultado por consulta.
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

const CHAINABLE = ['select', 'eq', 'in', 'gte', 'lte', 'order', 'range', 'upsert'] as const

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

function leg(overrides: Partial<Tables<'transactions'>>): Tables<'transactions'> {
  return {
    id: 't-out',
    user_id: 'user-1',
    account_id: 'acc-cop',
    category_id: null,
    type: 'transfer',
    transfer_direction: 'outgoing',
    transfer_group_id: 'g-1',
    amount_minor: 100_000,
    transaction_date: '2026-09-10',
    description: 'Paso a dólares',
    notes: null,
    is_reconciled: false,
    custom_fields: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function rowsOf(size: number, offset = 0) {
  return Array.from({ length: size }, (_, i) => ({ id: `t-${offset + i}` }))
}

/** Argumentos de un método en todas las páginas, en orden de llamada. */
function callsFor(calls: QueryCall[][], method: string) {
  return calls.flatMap((page) =>
    page.filter((call) => call.method === method).map((call) => call.args),
  )
}

const outgoing = leg({})
const incoming = leg({
  id: 't-in',
  account_id: 'acc-usd',
  transfer_direction: 'incoming',
  amount_minor: 25,
})
const pair: TransferPair = { outgoing, incoming }

const currencyByAccountId = new Map([
  ['acc-cop', 'COP'],
  ['acc-cop-2', 'COP'],
  ['acc-usd', 'USD'],
  ['acc-usd-2', 'USD'],
])

function input(overrides: Partial<UpdateTransferInput> = {}): UpdateTransferInput {
  return {
    userId: 'user-1',
    transferGroupId: 'g-1',
    fromAccountId: 'acc-cop',
    toAccountId: 'acc-usd',
    fromAmountMinor: 100_000,
    toAmountMinor: 25,
    transactionDate: '2026-09-10',
    description: 'Paso a dólares',
    currencyByAccountId,
    ...overrides,
  }
}

beforeEach(() => {
  fromMock.mockReset()
})

describe('pairTransferLegs', () => {
  it('separa la pata que sale de la que entra', () => {
    expect(pairTransferLegs([incoming, outgoing])).toEqual({ outgoing, incoming })
  })

  it('rechaza un grupo que no tenga exactamente dos patas', () => {
    expect(() => pairTransferLegs([outgoing])).toThrow(/salida y otra de entrada/)
    expect(() => pairTransferLegs([outgoing, incoming, incoming])).toThrow()
  })

  it('rechaza dos patas en la misma dirección', () => {
    expect(() => pairTransferLegs([outgoing, leg({ id: 't-2' })])).toThrow()
  })
})

describe('transferEditDefaults', () => {
  it('reconstruye la transferencia desde la pata que sale', () => {
    const defaults = transferEditDefaults(outgoing, {
      accountId: 'acc-usd',
      amountMinor: 25,
      direction: 'incoming',
    })

    expect(defaults).toEqual({
      transferGroupId: 'g-1',
      fromAccountId: 'acc-cop',
      toAccountId: 'acc-usd',
      fromAmountMinor: 100_000,
      toAmountMinor: 25,
      transactionDate: '2026-09-10',
      description: 'Paso a dólares',
    })
  })

  it('desde la pata que entra devuelve la misma transferencia, no la inversa', () => {
    const defaults = transferEditDefaults(incoming, {
      accountId: 'acc-cop',
      amountMinor: 100_000,
      direction: 'outgoing',
    })

    expect(defaults).toMatchObject({
      fromAccountId: 'acc-cop',
      toAccountId: 'acc-usd',
      fromAmountMinor: 100_000,
      toAmountMinor: 25,
    })
  })

  it('sin contraparte no se puede editar', () => {
    expect(transferEditDefaults(outgoing, undefined)).toBeNull()
  })

  it('un movimiento que no es transferencia no se edita por aquí', () => {
    const expense = leg({ type: 'expense', transfer_direction: null, transfer_group_id: null })

    expect(
      transferEditDefaults(expense, {
        accountId: 'acc-usd',
        amountMinor: 25,
        direction: 'incoming',
      }),
    ).toBeNull()
  })
})

describe('transferUpdateError', () => {
  it('acepta una edición coherente entre monedas distintas', () => {
    expect(transferUpdateError(pair, input({ toAmountMinor: 30 }))).toBeNull()
  })

  it('acepta cambiar de cuenta dentro de la misma moneda', () => {
    expect(transferUpdateError(pair, input({ fromAccountId: 'acc-cop-2' }))).toBeNull()
  })

  it('rechaza mover una pata a otra moneda', () => {
    expect(transferUpdateError(pair, input({ fromAccountId: 'acc-usd-2' }))).toMatch(
      /no cambia su moneda/,
    )
    expect(transferUpdateError(pair, input({ toAccountId: 'acc-cop-2' }))).toMatch(
      /no cambia su moneda/,
    )
  })

  it('con la misma moneda exige el mismo importe en las dos patas', () => {
    const samePair: TransferPair = {
      outgoing,
      incoming: leg({ id: 't-in', account_id: 'acc-cop-2', transfer_direction: 'incoming' }),
    }
    const sameCurrency = input({ toAccountId: 'acc-cop-2', toAmountMinor: 100_000 })

    expect(transferUpdateError(samePair, sameCurrency)).toBeNull()
    expect(transferUpdateError(samePair, { ...sameCurrency, toAmountMinor: 90_000 })).toMatch(
      /los dos importes deben ser iguales/,
    )
  })

  it('rechaza importes que no sean enteros mayores que 0', () => {
    expect(transferUpdateError(pair, input({ toAmountMinor: 0 }))).toMatch(/mayores que 0/)
    expect(transferUpdateError(pair, input({ fromAmountMinor: -1 }))).toMatch(/mayores que 0/)
    expect(transferUpdateError(pair, input({ toAmountMinor: 2.5 }))).toMatch(/mayores que 0/)
  })

  it('rechaza la misma cuenta en las dos patas', () => {
    expect(transferUpdateError(pair, input({ toAccountId: 'acc-cop' }))).toMatch(
      /dos cuentas distintas/,
    )
  })

  it('rechaza la edición si no conoce la moneda de alguna cuenta', () => {
    expect(
      transferUpdateError(pair, input({ currencyByAccountId: new Map([['acc-cop', 'COP']]) })),
    ).toMatch(/No se pudo comprobar la moneda/)
  })

  it('rechaza patas de otro grupo', () => {
    const otherGroup: TransferPair = { outgoing, incoming: leg({ transfer_group_id: 'g-2' }) }

    expect(transferUpdateError(otherGroup, input())).toMatch(/vuelve a abrirla/i)
  })
})

describe('updateTransferPair', () => {
  it('escribe las dos patas en una sola petición, cada una con su importe', async () => {
    const calls = mockQueries(
      { data: [outgoing, incoming], error: null },
      { data: [], error: null },
    )

    await updateTransferPair(
      input({ fromAmountMinor: 120_000, toAmountMinor: 30, transactionDate: '2026-09-11' }),
    )

    // Una sola escritura: o se guardan las dos patas o no se guarda ninguna.
    expect(calls).toHaveLength(2)
    const upsert = calls[1].find((call) => call.method === 'upsert')
    expect(upsert?.args[0]).toEqual([
      expect.objectContaining({
        id: 't-out',
        transfer_direction: 'outgoing',
        transfer_group_id: 'g-1',
        account_id: 'acc-cop',
        amount_minor: 120_000,
        transaction_date: '2026-09-11',
      }),
      expect.objectContaining({
        id: 't-in',
        transfer_direction: 'incoming',
        transfer_group_id: 'g-1',
        account_id: 'acc-usd',
        amount_minor: 30,
        transaction_date: '2026-09-11',
      }),
    ])
  })

  it('no escribe nada si la edición cambiaría la moneda de una pata', async () => {
    const calls = mockQueries({ data: [outgoing, incoming], error: null })

    await expect(updateTransferPair(input({ fromAccountId: 'acc-usd-2' }))).rejects.toThrow(
      /no cambia su moneda/,
    )
    expect(calls).toHaveLength(1)
  })

  it('no escribe nada si el grupo no tiene dos patas opuestas', async () => {
    const calls = mockQueries({ data: [outgoing], error: null })

    await expect(updateTransferPair(input())).rejects.toThrow(/salida y otra de entrada/)
    expect(calls).toHaveLength(1)
  })
})

describe('fetchTransactions', () => {
  it('aplica los mismos filtros en cada página', async () => {
    const calls = mockQueries({ data: rowsOf(1000), error: null }, { data: rowsOf(1), error: null })

    await fetchTransactions('user-1', {
      month: '2026-09',
      accountIds: ['acc-cop'],
      type: 'expense',
    })

    expect(calls).toHaveLength(2)
    expect(callsFor(calls, 'eq')).toEqual([
      ['user_id', 'user-1'],
      ['type', 'expense'],
      ['user_id', 'user-1'],
      ['type', 'expense'],
    ])
    expect(callsFor(calls, 'gte')).toEqual([
      ['transaction_date', expect.any(String)],
      ['transaction_date', expect.any(String)],
    ])
    expect(callsFor(calls, 'lte')).toEqual([
      ['transaction_date', expect.any(String)],
      ['transaction_date', expect.any(String)],
    ])
    expect(callsFor(calls, 'in')).toEqual([
      ['account_id', ['acc-cop']],
      ['account_id', ['acc-cop']],
    ])
  })

  it('acumula las páginas hasta devolver el conjunto completo', async () => {
    const calls = mockQueries({ data: rowsOf(1000), error: null }, { data: rowsOf(3), error: null })

    const result = await fetchTransactions('user-1', {})

    expect(result).toHaveLength(1003)
    expect(callsFor(calls, 'range')).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })

  it('se detiene en la primera página que llega incompleta', async () => {
    const calls = mockQueries({ data: rowsOf(1000), error: null }, { data: [], error: null })

    const result = await fetchTransactions('user-1', {})

    expect(result).toHaveLength(1000)
    expect(calls).toHaveLength(2)
  })

  it('una página corta en la primera vuelta no pide más', async () => {
    const calls = mockQueries({ data: rowsOf(1), error: null })

    const result = await fetchTransactions('user-1', {})

    expect(result).toHaveLength(1)
    expect(calls).toHaveLength(1)
  })

  it('respeta el tope de páginas en vez de leer sin fin', async () => {
    const fullPages = Array.from({ length: 60 }, () => ({ data: rowsOf(1000), error: null }))
    const calls = mockQueries(...fullPages)

    const result = await fetchTransactions('user-1', {})

    expect(result).toHaveLength(50 * 1000)
    expect(calls).toHaveLength(50)
  })

  it('aborta y propaga el error crudo si una página falla, sin devolver parcial', async () => {
    const error = new Error('boom')
    mockQueries({ data: rowsOf(1000), error: null }, { data: null, error })

    await expect(fetchTransactions('user-1', {})).rejects.toBe(error)
  })

  it('ordena con un desempate estable por id tras fecha y creación', async () => {
    const calls = mockQueries({ data: rowsOf(1), error: null })

    await fetchTransactions('user-1', {})

    const ordered = callsFor(calls, 'order').map(([column]) => column)
    expect(ordered).toEqual(['transaction_date', 'created_at', 'id'])
  })
})
