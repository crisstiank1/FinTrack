import { describe, expect, it, vi, type Mock } from 'vitest'

import { supabase } from '@/lib/supabase'

import { fetchPrimaryCurrency, updatePrimaryCurrency } from './api'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

const fromMock = supabase.from as unknown as Mock

interface QueryCall {
  method: string
  args: unknown[]
}

function makeChain(calls: QueryCall[], result: { data?: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }

  chain.update = (...args: unknown[]) => {
    calls.push({ method: 'update', args })
    return chain
  }
  chain.eq = (...args: unknown[]) => {
    calls.push({ method: 'eq', args })
    return chain
  }
  chain.select = (...args: unknown[]) => {
    calls.push({ method: 'select', args })
    return chain
  }
  chain.single = (...args: unknown[]) => {
    calls.push({ method: 'single', args })
    return chain
  }

  return chain
}

describe('fetchPrimaryCurrency', () => {
  it('lee la moneda principal del perfil', async () => {
    const calls: QueryCall[] = []
    fromMock.mockReturnValue(makeChain(calls, { data: { currency_code: 'USD' }, error: null }))

    const currency = await fetchPrimaryCurrency('user-1')

    expect(currency).toBe('USD')
    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(calls).toEqual([
      { method: 'select', args: ['currency_code'] },
      { method: 'eq', args: ['id', 'user-1'] },
      { method: 'single', args: [] },
    ])
  })

  it('propaga el error crudo de la lectura', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(makeChain([], { data: null, error }))

    await expect(fetchPrimaryCurrency('user-1')).rejects.toBe(error)
  })
})

describe('updatePrimaryCurrency', () => {
  it('escribe solo la moneda principal del perfil', async () => {
    const calls: QueryCall[] = []
    fromMock.mockReturnValue(makeChain(calls, { error: null }))

    await updatePrimaryCurrency('user-1', 'USD')

    expect(fromMock).toHaveBeenCalledWith('profiles')
    expect(calls).toEqual([
      { method: 'update', args: [{ currency_code: 'USD' }] },
      { method: 'eq', args: ['id', 'user-1'] },
    ])
  })

  it('propaga el error crudo de la escritura', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(makeChain([], { error }))

    await expect(updatePrimaryCurrency('user-1', 'USD')).rejects.toBe(error)
  })
})
