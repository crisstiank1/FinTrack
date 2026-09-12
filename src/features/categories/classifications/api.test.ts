import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { supabase } from '@/lib/supabase'

import {
  createCategoryClassification,
  deleteCategoryClassification,
  fetchCategoryClassifications,
  updateCategoryClassification,
} from './api'
import { ClassificationError } from './errors'

/**
 * Doble local del constructor de consultas de PostgREST, con el mismo diseño
 * que el de `plan/api.test.ts`: registra qué métodos se llamaron y con qué
 * argumentos, para comprobar el **contrato de la sentencia** sin acoplarse al
 * orden en que se encadenan.
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

const CHAINABLE = ['select', 'insert', 'update', 'delete', 'eq', 'order'] as const

const fromMock = supabase.from as unknown as Mock

function mockQueries(...results: QueryResult[]) {
  const calls: QueryCall[] = []
  const tables: string[] = []
  const pending = [...results]

  fromMock.mockImplementation((table: string) => {
    tables.push(table)
    const result = pending.shift() ?? { data: [], error: null }

    const chain: Record<string, unknown> = {
      single: () => {
        calls.push({ method: 'single', args: [] })
        return Promise.resolve(result)
      },
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

function argsOf(calls: QueryCall[], method: string): unknown[][] {
  return calls.filter((call) => call.method === method).map((call) => call.args)
}

const USER_ID = 'user-1'
const CATEGORY_ID = 'cat-vivienda'
const CLASSIFICATION_ID = 'cls-1'

beforeEach(() => {
  fromMock.mockReset()
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

  it('propaga el error crudo: las lecturas no se traducen', async () => {
    const error = { code: '42P01', message: 'relation does not exist' }
    mockQueries({ data: null, error })

    await expect(fetchCategoryClassifications(USER_ID)).rejects.toBe(error)
  })
})

describe('createCategoryClassification', () => {
  const row = { user_id: USER_ID, category_id: CATEGORY_ID, budget_group: 'needs' }

  it('inserta exactamente las tres columnas sin valor por defecto', async () => {
    const { calls, tables } = mockQueries({ data: { id: CLASSIFICATION_ID }, error: null })

    await createCategoryClassification(row)

    expect(tables).toEqual(['category_classifications'])
    expect(argsOf(calls, 'insert')).toEqual([[row]])
  })

  it('no usa upsert: pisar el grupo de otra sesión no es resolver un conflicto', async () => {
    const { calls } = mockQueries({ data: { id: CLASSIFICATION_ID }, error: null })

    await createCategoryClassification(row)

    expect(calls.some((call) => call.method === 'upsert')).toBe(false)
  })

  it('traduce el conflicto en vez de dejar escapar el SQLSTATE', async () => {
    // Un resultado por llamada: la cola del doble se consume en cada `from`.
    const conflict = { data: null, error: { code: '23505', message: 'duplicate key' } }
    mockQueries(conflict, conflict)

    await expect(createCategoryClassification(row)).rejects.toBeInstanceOf(ClassificationError)
    await expect(createCategoryClassification(row)).rejects.toMatchObject({
      code: 'already_classified',
    })
  })
})

describe('updateCategoryClassification', () => {
  it('envía solo budget_group', async () => {
    const { calls } = mockQueries({ data: { id: CLASSIFICATION_ID }, error: null })

    await updateCategoryClassification(CLASSIFICATION_ID, { budget_group: 'wants' })

    expect(argsOf(calls, 'update')).toEqual([[{ budget_group: 'wants' }]])
  })

  it('nunca reenvía category_id ni user_id: eso sería estrenar la referencia', async () => {
    const { calls } = mockQueries({ data: { id: CLASSIFICATION_ID }, error: null })

    await updateCategoryClassification(CLASSIFICATION_ID, { budget_group: 'debt' })

    const [[patch]] = argsOf(calls, 'update') as [Record<string, unknown>][]

    expect(Object.keys(patch)).toEqual(['budget_group'])
    expect(patch).not.toHaveProperty('category_id')
    expect(patch).not.toHaveProperty('user_id')
  })

  it('localiza la fila por su identificador', async () => {
    const { calls } = mockQueries({ data: { id: CLASSIFICATION_ID }, error: null })

    await updateCategoryClassification(CLASSIFICATION_ID, { budget_group: 'needs' })

    expect(calls).toContainEqual({ method: 'eq', args: ['id', CLASSIFICATION_ID] })
  })

  it('una fila que ya no está llega como error de dominio', async () => {
    mockQueries({ data: null, error: { code: 'PGRST116', message: 'no rows' } })

    await expect(
      updateCategoryClassification(CLASSIFICATION_ID, { budget_group: 'needs' }),
    ).rejects.toMatchObject({ code: 'row_missing' })
  })
})

describe('deleteCategoryClassification', () => {
  it('borra por identificador y no toca la categoría', async () => {
    const { calls, tables } = mockQueries({ data: null, error: null })

    await deleteCategoryClassification(CLASSIFICATION_ID)

    expect(tables).toEqual(['category_classifications'])
    expect(calls.some((call) => call.method === 'delete')).toBe(true)
    expect(calls).toContainEqual({ method: 'eq', args: ['id', CLASSIFICATION_ID] })
  })

  it('traduce el fallo a un error de dominio', async () => {
    mockQueries({ data: null, error: { code: '42501', message: 'permission denied' } })

    await expect(deleteCategoryClassification(CLASSIFICATION_ID)).rejects.toMatchObject({
      code: 'forbidden',
    })
  })
})
