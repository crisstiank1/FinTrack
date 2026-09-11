import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { monthRange } from '@/lib/dates'
import { supabase } from '@/lib/supabase'

import {
  fetchCategoryClassifications,
  fetchPlanAllocations,
  fetchPlanIncomeSourceCategories,
  fetchPlanIncomeSources,
  fetchPlanLines,
  fetchPlanMonth,
  fetchTransactionsByAccounts,
} from './api'
import { transactionsByAccountsQueryKey } from './hooks'

/**
 * Doble local del constructor de consultas de PostgREST.
 *
 * `test/setup.ts` mockea `@/lib/supabase` como `{}` para toda la suite; este
 * archivo lo reemplaza solo para sí mismo, igual que hacen las pruebas de los
 * formularios de autenticación. El doble no implementa `SupabaseClient`: solo
 * la parte encadenable que usa esta capa.
 *
 * Registra qué métodos se llamaron y con qué argumentos, para poder comprobar
 * el **contrato de la consulta** —filtros, orden, paginación— sin acoplarse al
 * número exacto de llamadas ni al orden en que se encadenan.
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

const CHAINABLE = ['select', 'eq', 'in', 'order', 'range'] as const

const fromMock = supabase.from as unknown as Mock

/**
 * Encola un resultado por cada `from(...)`. Una lectura paginada llama a
 * `from` una vez por página, así que la cola es también lo que define cuántas
 * páginas devuelve el servidor simulado.
 */
function mockQueries(...results: QueryResult[]) {
  const calls: QueryCall[] = []
  const tables: string[] = []
  const pending = [...results]

  fromMock.mockImplementation((table: string) => {
    tables.push(table)
    const result = pending.shift() ?? { data: [], error: null }

    const chain: Record<string, unknown> = {
      maybeSingle: () => {
        calls.push({ method: 'maybeSingle', args: [] })
        return Promise.resolve(result)
      },
      single: () => {
        calls.push({ method: 'single', args: [] })
        return Promise.resolve(result)
      },
      // La consulta se resuelve al await, sin método terminal, como en
      // PostgREST.
      then: (
        onFulfilled: (value: QueryResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(onFulfilled, onRejected),
    }

    for (const method of CHAINABLE) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return chain
      }
    }

    return chain
  })

  return { calls, tables }
}

function rows(calls: QueryCall[], method: string): unknown[][] {
  return calls.filter((call) => call.method === method).map((call) => call.args)
}

function orderedColumns(calls: QueryCall[]): unknown[] {
  return rows(calls, 'order').map((args) => args[0])
}

function selectedColumns(calls: QueryCall[]): unknown[] {
  return rows(calls, 'select').map((args) => args[0])
}

const USER_ID = 'user-1'
const PLAN_MONTH_ID = 'plan-month-1'
const MONTH_KEY = '2026-04'
const FIRST_DAY = monthRange(MONTH_KEY).start

beforeEach(() => {
  fromMock.mockReset()
})

describe('fetchPlanMonth', () => {
  it('filtra por usuario y por el primer día del mes derivado de monthRange', async () => {
    const { calls, tables } = mockQueries({ data: { id: PLAN_MONTH_ID }, error: null })

    await fetchPlanMonth(USER_ID, MONTH_KEY)

    expect(tables).toEqual(['plan_months'])
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(calls).toContainEqual({ method: 'eq', args: ['period_month', FIRST_DAY] })
    expect(FIRST_DAY).toBe('2026-04-01')
  })

  it('usa maybeSingle y nunca single: un mes sin plan no es un error', async () => {
    const { calls } = mockQueries({ data: null, error: null })

    await fetchPlanMonth(USER_ID, MONTH_KEY)

    expect(calls.some((call) => call.method === 'maybeSingle')).toBe(true)
    expect(calls.some((call) => call.method === 'single')).toBe(false)
  })

  it('devuelve null cuando el mes no tiene plan, sin lanzar', async () => {
    mockQueries({ data: null, error: null })

    await expect(fetchPlanMonth(USER_ID, MONTH_KEY)).resolves.toBeNull()
  })

  it('devuelve la cabecera cuando el mes tiene plan', async () => {
    mockQueries({ data: { id: PLAN_MONTH_ID, period_month: FIRST_DAY }, error: null })

    await expect(fetchPlanMonth(USER_ID, MONTH_KEY)).resolves.toEqual({
      id: PLAN_MONTH_ID,
      period_month: FIRST_DAY,
    })
  })

  it('propaga el error crudo de Supabase, sin traducirlo', async () => {
    const error = { code: '42501', message: 'permission denied' }
    mockQueries({ data: null, error })

    await expect(fetchPlanMonth(USER_ID, MONTH_KEY)).rejects.toBe(error)
  })
})

describe('fetchPlanAllocations', () => {
  it('filtra por usuario y por plan mensual', async () => {
    const { calls, tables } = mockQueries({ data: [], error: null })

    await fetchPlanAllocations(USER_ID, PLAN_MONTH_ID)

    expect(tables).toEqual(['plan_allocations'])
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(calls).toContainEqual({ method: 'eq', args: ['plan_month_id', PLAN_MONTH_ID] })
  })

  it('propaga el error crudo', async () => {
    const error = { code: 'PGRST301', message: 'jwt expired' }
    mockQueries({ data: null, error })

    await expect(fetchPlanAllocations(USER_ID, PLAN_MONTH_ID)).rejects.toBe(error)
  })
})

describe('fetchPlanIncomeSources', () => {
  it('filtra por usuario y por plan mensual, y ordena por position', async () => {
    const { calls, tables } = mockQueries({ data: [], error: null })

    await fetchPlanIncomeSources(USER_ID, PLAN_MONTH_ID)

    expect(tables).toEqual(['plan_income_sources'])
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(calls).toContainEqual({ method: 'eq', args: ['plan_month_id', PLAN_MONTH_ID] })
    expect(orderedColumns(calls)).toContain('position')
  })
})

describe('fetchPlanIncomeSourceCategories', () => {
  it('consulta el puente por plan_month_id, sin pasar por las fuentes', async () => {
    const { calls, tables } = mockQueries({ data: [], error: null })

    await fetchPlanIncomeSourceCategories(USER_ID, PLAN_MONTH_ID)

    expect(tables).toEqual(['plan_income_source_categories'])
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(calls).toContainEqual({ method: 'eq', args: ['plan_month_id', PLAN_MONTH_ID] })
  })

  it('no embebe recursos: selecciona columnas planas', async () => {
    const { calls } = mockQueries({ data: [], error: null })

    await fetchPlanIncomeSourceCategories(USER_ID, PLAN_MONTH_ID)

    expect(selectedColumns(calls)).toEqual(['*'])
  })
})

describe('fetchPlanLines', () => {
  it('filtra por usuario y por period_month, y ordena por position', async () => {
    const { calls, tables } = mockQueries({ data: [], error: null })

    await fetchPlanLines(USER_ID, MONTH_KEY)

    expect(tables).toEqual(['plan_lines'])
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(calls).toContainEqual({ method: 'eq', args: ['period_month', FIRST_DAY] })
    expect(orderedColumns(calls)).toContain('position')
  })

  it('no hace un viaje adicional a plan_months para resolver el mes', async () => {
    const { tables } = mockQueries({ data: [], error: null })

    await fetchPlanLines(USER_ID, MONTH_KEY)

    expect(tables).not.toContain('plan_months')
  })
})

describe('fetchCategoryClassifications', () => {
  it('filtra por usuario y no por mes', async () => {
    const { calls, tables } = mockQueries({ data: [], error: null })

    await fetchCategoryClassifications(USER_ID)

    expect(tables).toEqual(['category_classifications'])
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(calls.some((call) => call.method === 'eq' && call.args[0] === 'period_month')).toBe(
      false,
    )
  })

  it('propaga el error crudo', async () => {
    const error = { code: '42P01', message: 'relation does not exist' }
    mockQueries({ data: null, error })

    await expect(fetchCategoryClassifications(USER_ID)).rejects.toBe(error)
  })
})

describe('fetchTransactionsByAccounts', () => {
  const PAGE_SIZE = 1000

  function page(size: number, offset = 0) {
    return Array.from({ length: size }, (_, index) => ({
      account_id: 'acc-savings',
      amount_minor: offset + index,
      type: 'income',
      transfer_direction: null,
    }))
  }

  it('sin cuentas relevantes devuelve la colección vacía y no consulta', async () => {
    const { tables } = mockQueries()

    await expect(fetchTransactionsByAccounts(USER_ID, [])).resolves.toEqual([])
    expect(tables).toEqual([])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('filtra por usuario y por las cuentas pedidas', async () => {
    const { calls, tables } = mockQueries({ data: [], error: null })

    await fetchTransactionsByAccounts(USER_ID, ['acc-a', 'acc-b'])

    expect(tables).toEqual(['transactions'])
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] })
    expect(calls).toContainEqual({ method: 'in', args: ['account_id', ['acc-a', 'acc-b']] })
  })

  it('selecciona solo las columnas del saldo, no la fila entera', async () => {
    const { calls } = mockQueries({ data: [], error: null })

    await fetchTransactionsByAccounts(USER_ID, ['acc-a'])

    const selected = String(selectedColumns(calls)[0])
    expect(selected).not.toBe('*')
    for (const column of ['account_id', 'amount_minor', 'type', 'transfer_direction']) {
      expect(selected).toContain(column)
    }
  })

  it('pagina con ventanas acotadas, nunca con un rango ilimitado', async () => {
    const { calls } = mockQueries({ data: page(10), error: null })

    await fetchTransactionsByAccounts(USER_ID, ['acc-a'])

    expect(rows(calls, 'range')).toEqual([[0, PAGE_SIZE - 1]])
  })

  it('pide la página siguiente cuando la anterior viene llena, y acumula todo', async () => {
    const { calls, tables } = mockQueries(
      { data: page(PAGE_SIZE), error: null },
      { data: page(3, PAGE_SIZE), error: null },
    )

    const result = await fetchTransactionsByAccounts(USER_ID, ['acc-a'])

    expect(tables).toEqual(['transactions', 'transactions'])
    expect(rows(calls, 'range')).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
    ])
    expect(result).toHaveLength(PAGE_SIZE + 3)
  })

  it('se detiene en cuanto una página llega incompleta', async () => {
    const { tables } = mockQueries(
      { data: page(PAGE_SIZE), error: null },
      { data: page(0), error: null },
    )

    await fetchTransactionsByAccounts(USER_ID, ['acc-a'])

    expect(tables).toHaveLength(2)
  })

  it('respeta el tope de páginas en vez de girar sin fin', async () => {
    const full = page(PAGE_SIZE)
    const { tables } = mockQueries(
      ...Array.from({ length: 60 }, () => ({ data: full, error: null })),
    )

    await fetchTransactionsByAccounts(USER_ID, ['acc-a'])

    expect(tables).toHaveLength(50)
  })

  it('ordena por una columna única para que ninguna fila se pierda entre páginas', async () => {
    const { calls } = mockQueries({ data: [], error: null })

    await fetchTransactionsByAccounts(USER_ID, ['acc-a'])

    expect(orderedColumns(calls)).toEqual(['id'])
  })

  it('propaga el error crudo de una página', async () => {
    const error = { code: 'PGRST103', message: 'requested range not satisfiable' }
    mockQueries({ data: null, error })

    await expect(fetchTransactionsByAccounts(USER_ID, ['acc-a'])).rejects.toBe(error)
  })
})

describe('transactionsByAccountsQueryKey', () => {
  it('ordena los identificadores para que el mismo conjunto comparta caché', () => {
    expect(transactionsByAccountsQueryKey(USER_ID, ['acc-b', 'acc-a'])).toEqual(
      transactionsByAccountsQueryKey(USER_ID, ['acc-a', 'acc-b']),
    )
  })

  it('no reordena el array de quien llama', () => {
    const accountIds = ['acc-b', 'acc-a']

    transactionsByAccountsQueryKey(USER_ID, accountIds)

    expect(accountIds).toEqual(['acc-b', 'acc-a'])
  })

  it('conserva el alcance por usuario en la clave', () => {
    expect(transactionsByAccountsQueryKey(USER_ID, ['acc-a'])).toEqual([
      'transactions',
      USER_ID,
      'by-accounts',
      ['acc-a'],
    ])
  })
})
