import { describe, expect, it } from 'vitest'

import type { CoachSupabaseClient } from './context'
import { handleCoachHttpRequest } from './http'
import { LLMProviderError, type LLMProvider, type LLMRequest } from './llm/provider'
import { handleCoachRequest, type CoachAI } from './request'

/**
 * Ruta completa de la Fase 3: alcance → contexto → consentimiento → snapshot →
 * proveedor → validación. El proveedor y la base de datos son dobles; lo que se
 * prueba es el orden y las barreras entre ellos.
 */

const NOW = new Date('2026-09-21T15:00:00Z')

interface FakeData {
  accounts?: { id: string; type: string; currency_code: string; initial_balance_minor: number }[]
}

function fakeClient({ accounts }: FakeData = {}) {
  const reads: { table: string; columns: string }[] = []

  const rows: Record<string, unknown[]> = {
    accounts: accounts ?? [
      { id: 'acc-cop', type: 'cash', currency_code: 'COP', initial_balance_minor: 0 },
    ],
    categories: [
      {
        id: 'cat-food',
        name: 'Mercado',
        type: 'expense',
        color: null,
        icon: null,
        is_archived: false,
      },
    ],
    budgets: [],
    transactions: [
      {
        id: 'tx-1',
        type: 'expense',
        transfer_direction: null,
        account_id: 'acc-cop',
        category_id: 'cat-food',
        amount_minor: 450_000,
        transaction_date: '2026-09-05',
      },
    ],
  }

  function chain(table: string) {
    const result =
      table === 'profiles'
        ? { data: { timezone: 'America/Bogota', currency_code: 'COP' }, error: null, count: null }
        : { data: rows[table] ?? [], error: null, count: (rows[table] ?? []).length }

    const node: Record<string, unknown> = {
      then: (ok: (value: unknown) => unknown, ko?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(ok, ko),
      maybeSingle: () => Promise.resolve(result),
    }
    node.select = (columns: string) => {
      reads.push({ table, columns })
      return node
    }
    for (const method of ['eq', 'gte', 'lte', 'order', 'range']) node[method] = () => node

    return node
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-jwt' } }, error: null }) },
    from: (table: string) => chain(table),
  }

  return { client: client as unknown as CoachSupabaseClient, reads }
}

/** Proveedor falso: devuelve en orden las respuestas preparadas y registra las peticiones. */
function fakeProvider(outputs: (string | Error)[]) {
  const requests: LLMRequest[] = []
  const pending = [...outputs]

  const provider: LLMProvider = {
    name: 'falso',
    model: 'modelo-falso',
    async generate(request) {
      requests.push(structuredClone(request))
      const next = pending.shift()
      if (next === undefined) throw new Error('sin más respuestas preparadas')
      if (next instanceof Error) throw next
      return { text: next, model: 'modelo-falso' }
    },
  }

  return { provider, requests }
}

const VALID = JSON.stringify({
  title: 'Tu gasto de {{period.label}}',
  summary: 'Gastaste {{summary.expense.currentMinor}}, sobre todo en {{categories.c1.name}}.',
  facts: [],
  recommendations: ['Define un tope semanal para {{categories.c1.name}}.'],
  assumptions: [],
})

const INVENTED = JSON.stringify({
  title: 'Tu gasto',
  summary: 'Gastaste COP 450.000 este mes.',
})

function ai(provider: LLMProvider, consent: boolean): CoachAI {
  return { provider, hasConsent: async () => consent }
}

async function ask(message: string, aiDeps: CoachAI, data?: FakeData) {
  const { client, reads } = fakeClient(data)
  const response = await handleCoachRequest({
    body: { message },
    userId: 'user-jwt',
    client,
    now: NOW,
    ai: aiDeps,
  })
  return { response, reads }
}

describe('consentimiento', () => {
  it('sin consentimiento no llama al proveedor ni lee movimientos', async () => {
    const { provider, requests } = fakeProvider([VALID])

    const { response, reads } = await ask('¿En qué gasté más este mes?', ai(provider, false))

    expect(response.type).toBe('coach_context_ready')
    expect(requests).toHaveLength(0)
    expect(reads.some((read) => read.table === 'transactions')).toBe(false)
  })

  it('sin proveedor configurado responde el contexto, como en la Fase 2', async () => {
    const { client } = fakeClient()

    const response = await handleCoachRequest({
      body: { message: '¿En qué gasté más este mes?' },
      userId: 'user-jwt',
      client,
      now: NOW,
    })

    expect(response.type).toBe('coach_context_ready')
  })
})

describe('respuesta financiera', () => {
  it('con consentimiento y una redacción válida devuelve financial_answer', async () => {
    const { provider } = fakeProvider([VALID])

    const { response } = await ask('¿En qué gasté más este mes?', ai(provider, true))

    expect(response).toMatchObject({
      type: 'financial_answer',
      intent: 'spending_by_category',
      currency: 'COP',
      meta: { promptVersion: 'fintrack-coach-v2', model: 'modelo-falso' },
      content: {
        factReferences: ['period.label', 'summary.expense.currentMinor', 'categories.c1.name'],
      },
    })
  })

  it('el snapshot de la respuesta trae las cifras calculadas por el dominio', async () => {
    const { provider } = fakeProvider([VALID])

    const { response } = await ask('¿En qué gasté más este mes?', ai(provider, true))

    expect(
      response.type === 'financial_answer' && response.snapshot.summary?.expense.currentMinor,
    ).toBe(450_000)
  })

  it('no lee description ni notes de los movimientos', async () => {
    const { provider } = fakeProvider([VALID])

    const { reads } = await ask('¿En qué gasté más este mes?', ai(provider, true))
    const transactionColumns = reads.find((read) => read.table === 'transactions')?.columns ?? ''

    expect(transactionColumns).not.toBe('*')
    expect(transactionColumns).not.toMatch(/description|notes/)
  })

  it('lo que se envía al proveedor no contiene identificadores', async () => {
    const { provider, requests } = fakeProvider([VALID])

    await ask('¿En qué gasté más este mes?', ai(provider, true))
    const sent = JSON.stringify(requests[0].messages)

    expect(sent).not.toMatch(/acc-cop|cat-food|tx-1|user-jwt/)
  })
})

describe('validación y reintento', () => {
  it('una cifra inventada provoca un reintento que nombra el problema', async () => {
    const { provider, requests } = fakeProvider([INVENTED, VALID])

    const { response } = await ask('¿En qué gasté más este mes?', ai(provider, true))

    expect(response.type).toBe('financial_answer')
    expect(requests).toHaveLength(2)

    const retry = requests[1].messages[requests[1].messages.length - 1]
    expect(retry?.role).toBe('user')
    expect(retry?.content).toContain('summary')
    expect(retry?.content).toContain('cifra con dígitos')
  })

  it('dos redacciones inválidas terminan en error, nunca en la cifra inventada', async () => {
    const { provider } = fakeProvider([INVENTED, INVENTED])

    const { response } = await ask('¿En qué gasté más este mes?', ai(provider, true))

    expect(response).toMatchObject({ type: 'error', code: 'answer_rejected' })
    expect(JSON.stringify(response)).not.toContain('450.000')
  })

  it('un texto que no es JSON también se reintenta', async () => {
    const { provider, requests } = fakeProvider(['Claro, aquí va tu resumen.', VALID])

    const { response } = await ask('¿En qué gasté más este mes?', ai(provider, true))

    expect(response.type).toBe('financial_answer')
    expect(requests).toHaveLength(2)
  })
})

describe('fallos del proveedor', () => {
  it('un tiempo de espera se devuelve como provider_error sin reintentar', async () => {
    const { provider, requests } = fakeProvider([new LLMProviderError('timeout', 'tarde'), VALID])

    const { response } = await ask('¿En qué gasté más este mes?', ai(provider, true))

    expect(response).toMatchObject({ type: 'error', code: 'provider_error' })
    expect(requests).toHaveLength(1)
  })

  it('por HTTP, un fallo del proveedor responde 502', async () => {
    const { client } = fakeClient()
    const { provider } = fakeProvider([new LLMProviderError('http', 'caído', 503)])

    const response = await handleCoachHttpRequest(
      new Request('https://fintrack.win/', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '¿En qué gasté más este mes?' }),
      }),
      { createClient: () => client, now: NOW, ai: ai(provider, true) },
    )

    expect(response.status).toBe(502)
  })
})

describe('alcance antes que el modelo', () => {
  it('una pregunta fuera de alcance nunca llega al proveedor, aunque haya consentimiento', async () => {
    const { provider, requests } = fakeProvider([VALID])

    const { response, reads } = await ask('¿Qué acción compro hoy?', ai(provider, true))

    expect(response.type).toBe('out_of_scope')
    expect(requests).toHaveLength(0)
    expect(reads).toHaveLength(0)
  })

  it('una pregunta no soportada tampoco llega al proveedor', async () => {
    const { provider, requests } = fakeProvider([VALID])

    await ask('¿Qué deuda debería pagar primero?', ai(provider, true))

    expect(requests).toHaveLength(0)
  })
})

describe('preguntas sin datos', () => {
  const multiCurrency: FakeData = {
    accounts: [
      { id: 'acc-cop', type: 'cash', currency_code: 'COP', initial_balance_minor: 0 },
      { id: 'acc-usd', type: 'cash', currency_code: 'USD', initial_balance_minor: 0 },
    ],
  }

  it('una pregunta de concepto no pide moneda aunque haya varias', async () => {
    const { response } = await ask(
      '¿Qué es la tasa de ahorro?',
      ai(fakeProvider([]).provider, false),
      multiCurrency,
    )

    expect(response).toMatchObject({ type: 'coach_context_ready', intent: 'financial_concept' })
  })

  it('una pregunta de concepto no lee cuentas ni movimientos', async () => {
    const concept = JSON.stringify({
      title: 'La tasa de ahorro',
      summary: 'Es la parte de tus ingresos que no gastaste en el período.',
    })
    const { provider } = fakeProvider([concept])

    const { response, reads } = await ask('¿Qué es la tasa de ahorro?', ai(provider, true))

    expect(response.type).toBe('financial_answer')
    expect(reads.map((read) => read.table)).toEqual(['profiles'])
  })
})
