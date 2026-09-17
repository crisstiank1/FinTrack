import { describe, expect, it } from 'vitest'

import { fetchAllTransactions, type TransactionsClient } from './api'

/**
 * Doble del constructor de consultas de PostgREST. A diferencia del de
 * `ledger/api.test.ts`, este no necesita `vi.mock('@/lib/supabase')`: la función
 * recibe el cliente como parámetro, así que basta con pasarle uno de mentira.
 * Que esta prueba no tenga que interceptar un módulo es justamente la señal de
 * que la dependencia quedó inyectada.
 */
interface QueryCall {
  method: string
  args: unknown[]
}

interface PageResult {
  data: unknown[] | null
  error: unknown
}

const CHAINABLE = ['select', 'eq', 'order', 'range'] as const

function mockClient(pages: PageResult[]) {
  const calls: QueryCall[][] = []
  const pending = [...pages]

  const client = {
    from: () => {
      const result = pending.shift() ?? { data: [], error: null }
      const queryCalls: QueryCall[] = []
      calls.push(queryCalls)

      const chain: Record<string, unknown> = {
        then: (
          onFulfilled: (value: PageResult) => unknown,
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
    },
  }

  return { client: client as unknown as TransactionsClient, calls }
}

/** Una página completa: el tamaño que dispara la petición de la siguiente. */
function fullPage() {
  return { data: new Array(1000).fill({ id: 'tx' }), error: null }
}

function partialPage(size: number) {
  return { data: new Array(size).fill({ id: 'tx' }), error: null }
}

function argsOf(queryCalls: QueryCall[], method: string) {
  return queryCalls.filter((call) => call.method === method).map((call) => call.args)
}

describe('fetchAllTransactions', () => {
  it('devuelve las filas de una única página incompleta sin pedir más', async () => {
    const { client, calls } = mockClient([partialPage(3)])

    const result = await fetchAllTransactions(client, 'user-1')

    expect(result).toHaveLength(3)
    expect(calls).toHaveLength(1)
  })

  it('pagina hasta agotar el historial y concatena todas las páginas', async () => {
    const { client, calls } = mockClient([fullPage(), fullPage(), partialPage(500)])

    const result = await fetchAllTransactions(client, 'user-1')

    expect(result).toHaveLength(2500)
    expect(calls).toHaveLength(3)
  })

  it('pide la siguiente página solo mientras la anterior llegue completa', async () => {
    const { client, calls } = mockClient([fullPage(), partialPage(999), fullPage()])

    await fetchAllTransactions(client, 'user-1')

    // La segunda página vino incompleta: la tercera no llega a pedirse.
    expect(calls).toHaveLength(2)
  })

  it('una página exactamente llena seguida de una vacía termina sin perder filas', async () => {
    const { client, calls } = mockClient([fullPage(), partialPage(0)])

    const result = await fetchAllTransactions(client, 'user-1')

    expect(result).toHaveLength(1000)
    expect(calls).toHaveLength(2)
  })

  it('se detiene en el tope de 50 páginas aunque sigan llegando completas', async () => {
    const { client, calls } = mockClient(new Array(60).fill(null).map(() => fullPage()))

    const result = await fetchAllTransactions(client, 'user-1')

    expect(calls).toHaveLength(50)
    expect(result).toHaveLength(50_000)
  })

  it('usa ventanas de 1000 filas consecutivas', async () => {
    const { client, calls } = mockClient([fullPage(), fullPage(), partialPage(1)])

    await fetchAllTransactions(client, 'user-1')

    expect(argsOf(calls[0], 'range')).toEqual([[0, 999]])
    expect(argsOf(calls[1], 'range')).toEqual([[1000, 1999]])
    expect(argsOf(calls[2], 'range')).toEqual([[2000, 2999]])
  })

  it('ordena por fecha y desempata por id, para que ninguna fila se repita ni se pierda', async () => {
    const { client, calls } = mockClient([partialPage(1)])

    await fetchAllTransactions(client, 'user-1')

    expect(argsOf(calls[0], 'order')).toEqual([
      ['transaction_date', { ascending: false }],
      ['id', { ascending: false }],
    ])
  })

  it('filtra por el usuario indicado', async () => {
    const { client, calls } = mockClient([partialPage(1)])

    await fetchAllTransactions(client, 'user-42')

    expect(argsOf(calls[0], 'eq')).toEqual([['user_id', 'user-42']])
  })

  it('propaga el error de una página y deja de paginar', async () => {
    const { client, calls } = mockClient([
      fullPage(),
      { data: null, error: new Error('fallo de red') },
      fullPage(),
    ])

    await expect(fetchAllTransactions(client, 'user-1')).rejects.toThrow('fallo de red')
    expect(calls).toHaveLength(2)
  })
})
