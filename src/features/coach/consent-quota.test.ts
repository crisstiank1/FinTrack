import { describe, expect, it } from 'vitest'

import { hasExplicitConsent, readAIConsent } from './consent'
import type { CoachSupabaseClient } from './context'
import { handleCoachHttpRequest } from './http'
import { LLMProviderError, type LLMProvider } from './llm/provider'
import {
  COACH_HOURLY_LIMIT,
  consumeAIQuota,
  createQuotaConsumer,
  secondsUntilNextWindow,
} from './quota'
import { handleCoachRequest, type CoachAI } from './request'

/**
 * Consentimiento y cuota (Fase 4).
 *
 * Aquí se usan el lector de consentimiento y el consumidor de cuota **reales**
 * —los mismos que monta la Edge Function—, y lo único falso es la base de
 * datos. El doble de `consume_ai_quota` reproduce la semántica de la función
 * SQL: comprueba e incrementa en un solo paso síncrono, igual que el `insert …
 * on conflict do update … where` decide bajo el bloqueo de la fila.
 *
 * Cada acción queda en `log` en orden, para poder afirmar no solo *qué* pasó
 * sino *antes de qué*.
 */

const NOW = new Date('2026-09-21T15:20:00Z')
const USER = 'user-jwt'

const CONSENTED = { ai_consent_at: '2026-09-20T10:00:00Z', ai_consent_version: 'v1' }

type ProfileMode =
  | { kind: 'row'; consent: Record<string, unknown> }
  | { kind: 'missing' }
  | { kind: 'error' }
  | { kind: 'throws' }

interface FakeOptions {
  profile?: ProfileMode
  accounts?: { id: string; type: string; currency_code: string; initial_balance_minor: number }[]
  /** Consumo ya registrado en la ventana actual. */
  used?: number
  rpcError?: boolean
}

function fakeDatabase(options: FakeOptions = {}) {
  const log: string[] = []
  const profile = options.profile ?? { kind: 'row', consent: CONSENTED }
  const counter = { value: options.used ?? 0 }

  const rows: Record<string, unknown[]> = {
    accounts: options.accounts ?? [
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
        description: 'Compra en Tienda Secreta',
      },
    ],
  }

  function profileResult() {
    if (profile.kind === 'error') return { data: null, error: { message: 'boom' } }
    if (profile.kind !== 'row') return { data: null, error: null }
    return {
      data: { timezone: 'America/Bogota', currency_code: 'COP', ...profile.consent },
      error: null,
    }
  }

  function chain(table: string) {
    let columns = ''
    const result = () =>
      table === 'profiles'
        ? { ...profileResult(), count: null }
        : { data: rows[table] ?? [], error: null, count: (rows[table] ?? []).length }

    const node: Record<string, unknown> = {
      then: (ok: (value: unknown) => unknown, ko?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(ok, ko),
      maybeSingle: () => {
        if (table === 'profiles' && profile.kind === 'throws') throw new Error('red caída')
        return Promise.resolve(result())
      },
    }
    node.select = (selected: string) => {
      columns = selected
      log.push(`read:${table}:${columns}`)
      return node
    }
    for (const method of ['eq', 'gte', 'lte', 'order', 'range']) node[method] = () => node

    return node
  }

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
    from: (table: string) => chain(table),
    async rpc(name: string, args: { p_limit: number }) {
      // Cede el turno antes de decidir, para que las peticiones concurrentes se
      // intercalen de verdad; la decisión en sí es un único paso síncrono.
      await Promise.resolve()
      log.push(`rpc:${name}`)
      if (options.rpcError) return { data: null, error: { message: 'rpc caída' } }
      if (counter.value >= args.p_limit) return { data: null, error: null }
      counter.value += 1
      return { data: counter.value, error: null }
    },
  }

  return { client: client as unknown as CoachSupabaseClient, log, counter }
}

const VALID = JSON.stringify({
  title: 'Tu gasto de {{period.label}}',
  summary: 'Gastaste {{summary.expense.currentMinor}}, sobre todo en {{categories.c1.name}}.',
})

function fakeProvider(outputs: (string | Error)[], log?: string[]) {
  const sent: string[] = []
  const pending = [...outputs]

  const provider: LLMProvider = {
    name: 'falso',
    model: 'modelo-falso',
    async generate(request) {
      log?.push('provider')
      sent.push(JSON.stringify(request.messages))
      const next = pending.shift() ?? VALID
      if (next instanceof Error) throw next
      return { text: next, model: 'modelo-falso' }
    },
  }

  return { provider, sent }
}

/** Las dependencias que monta la Edge Function, con un proveedor falso. */
function realAI(provider: LLMProvider): CoachAI {
  return { provider, hasConsent: readAIConsent, consumeQuota: consumeAIQuota }
}

async function ask(message: string, db: ReturnType<typeof fakeDatabase>, provider?: LLMProvider) {
  const { provider: fallback } = fakeProvider([VALID], db.log)
  return handleCoachRequest({
    body: { message },
    userId: USER,
    client: db.client,
    now: NOW,
    ai: realAI(provider ?? fallback),
  })
}

const snapshotReads = (log: string[]) =>
  log.filter((entry) => /^read:(transactions|categories|budgets:id,|accounts:id)/.test(entry))

/* -------------------------------------------------------------------------- */

describe('hasExplicitConsent', () => {
  it('solo acepta fecha y versión presentes y no vacías', () => {
    expect(hasExplicitConsent(CONSENTED)).toBe(true)

    expect(hasExplicitConsent(null)).toBe(false)
    expect(hasExplicitConsent(undefined)).toBe(false)
    expect(hasExplicitConsent({})).toBe(false)
    expect(hasExplicitConsent({ ai_consent_at: null, ai_consent_version: null })).toBe(false)
    expect(hasExplicitConsent({ ai_consent_at: CONSENTED.ai_consent_at })).toBe(false)
    expect(hasExplicitConsent({ ai_consent_version: 'v1' })).toBe(false)
    expect(hasExplicitConsent({ ai_consent_at: '', ai_consent_version: 'v1' })).toBe(false)
    expect(
      hasExplicitConsent({ ai_consent_at: CONSENTED.ai_consent_at, ai_consent_version: ' ' }),
    ).toBe(false)
    expect(
      hasExplicitConsent({ ai_consent_at: true, ai_consent_version: true } as unknown as never),
    ).toBe(false)
  })
})

describe('readAIConsent', () => {
  it('lee solo las columnas de consentimiento del perfil', async () => {
    const db = fakeDatabase()

    expect(await readAIConsent(db.client, USER)).toBe(true)
    expect(db.log).toEqual(['read:profiles:ai_consent_at, ai_consent_version'])
  })

  it.each([
    [
      'consentimiento revocado (null)',
      { kind: 'row', consent: { ai_consent_at: null, ai_consent_version: null } },
    ],
    ['columnas ausentes (undefined)', { kind: 'row', consent: {} }],
    ['valor false', { kind: 'row', consent: { ai_consent_at: false, ai_consent_version: false } }],
    ['perfil inexistente', { kind: 'missing' }],
    ['error al leer el perfil', { kind: 'error' }],
    ['excepción del cliente', { kind: 'throws' }],
  ] as [string, ProfileMode][])('%s → false', async (_label, profile) => {
    expect(await readAIConsent(fakeDatabase({ profile }).client, USER)).toBe(false)
  })
})

describe('sin consentimiento', () => {
  it.each([
    ['null', { kind: 'row', consent: { ai_consent_at: null, ai_consent_version: null } }],
    ['undefined', { kind: 'row', consent: {} }],
    ['false', { kind: 'row', consent: { ai_consent_at: false, ai_consent_version: false } }],
    ['perfil inexistente', { kind: 'missing' }],
    ['error de perfil', { kind: 'error' }],
    ['excepción', { kind: 'throws' }],
  ] as [string, ProfileMode][])(
    '%s: consent_required, sin snapshot, sin proveedor y sin cuota',
    async (_label, profile) => {
      const db = fakeDatabase({ profile })
      const { provider, sent } = fakeProvider([VALID], db.log)

      const response = await ask('¿En qué gasté más este mes?', db, provider)

      expect(response.type).toBe('consent_required')
      expect(response).toMatchObject({ message: expect.stringContaining('autorizar') })
      expect(sent).toHaveLength(0)
      expect(snapshotReads(db.log)).toEqual([])
      expect(db.log.some((entry) => entry.startsWith('rpc:'))).toBe(false)
      expect(db.counter.value).toBe(0)
    },
  )

  it('un comprobador que devuelve algo distinto de true bloquea', async () => {
    for (const value of [1, 'true', {}, null, undefined]) {
      const db = fakeDatabase()
      const { provider, sent } = fakeProvider([VALID])

      const response = await handleCoachRequest({
        body: { message: '¿En qué gasté más este mes?' },
        userId: USER,
        client: db.client,
        now: NOW,
        ai: {
          provider,
          hasConsent: (async () => value) as unknown as CoachAI['hasConsent'],
          consumeQuota: consumeAIQuota,
        },
      })

      expect(response.type).toBe('consent_required')
      expect(sent).toHaveLength(0)
      expect(db.counter.value).toBe(0)
    }
  })

  it('un comprobador que lanza bloquea en vez de romper la petición', async () => {
    const db = fakeDatabase()
    const { provider, sent } = fakeProvider([VALID])

    const response = await handleCoachRequest({
      body: { message: '¿En qué gasté más este mes?' },
      userId: USER,
      client: db.client,
      now: NOW,
      ai: {
        provider,
        hasConsent: async () => {
          throw new Error('fallo')
        },
        consumeQuota: consumeAIQuota,
      },
    })

    expect(response.type).toBe('consent_required')
    expect(sent).toHaveLength(0)
  })

  it('responde 200 por HTTP: es una decisión pendiente del usuario, no un fallo', async () => {
    const db = fakeDatabase({ profile: { kind: 'missing' } })
    const { provider } = fakeProvider([VALID])

    const response = await handleCoachHttpRequest(
      new Request('https://fintrack.win/', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '¿En qué gasté más este mes?' }),
      }),
      { createClient: () => db.client, now: NOW, ai: realAI(provider) },
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ type: 'consent_required' })
  })
})

describe('con consentimiento explícito', () => {
  it('continúa: consentimiento → contexto → cuota → snapshot → proveedor, en ese orden', async () => {
    const db = fakeDatabase()

    const response = await ask('¿En qué gasté más este mes?', db)

    expect(response.type).toBe('financial_answer')

    const consent = db.log.indexOf('read:profiles:ai_consent_at, ai_consent_version')
    const context = db.log.indexOf('read:profiles:timezone, currency_code')
    const quota = db.log.indexOf('rpc:consume_ai_quota')
    const snapshot = db.log.findIndex((entry) => entry.startsWith('read:transactions'))
    const provider = db.log.indexOf('provider')

    expect(consent).toBe(0)
    expect(consent).toBeLessThan(context)
    expect(context).toBeLessThan(quota)
    expect(quota).toBeLessThan(snapshot)
    expect(snapshot).toBeLessThan(provider)
  })

  it('una consulta válida consume exactamente una unidad', async () => {
    const db = fakeDatabase()

    await ask('¿En qué gasté más este mes?', db)

    expect(db.counter.value).toBe(1)
    expect(db.log.filter((entry) => entry === 'rpc:consume_ai_quota')).toHaveLength(1)
  })

  it('un reintento por validación no consume una segunda unidad', async () => {
    const db = fakeDatabase()
    const invented = JSON.stringify({ title: 't', summary: 'Gastaste COP 450.000.' })
    const { provider } = fakeProvider([invented, VALID], db.log)

    const response = await ask('¿En qué gasté más este mes?', db, provider)

    expect(response.type).toBe('financial_answer')
    expect(db.log.filter((entry) => entry === 'provider')).toHaveLength(2)
    expect(db.counter.value).toBe(1)
  })
})

describe('lo que no consume cuota', () => {
  it('una pregunta fuera de alcance no consume ni lee nada', async () => {
    const db = fakeDatabase()
    const { provider, sent } = fakeProvider([VALID])

    const response = await ask('¿Qué acción compro hoy?', db, provider)

    expect(response.type).toBe('out_of_scope')
    expect(db.log).toEqual([])
    expect(sent).toHaveLength(0)
    expect(db.counter.value).toBe(0)
  })

  it.each([
    '¿Qué deuda debería pagar primero?',
    '¿Cuánto debo ahorrar para mi meta?',
    '¿Cuánto debería tener en el fondo de emergencia?',
    '¿A cuánto está el dólar?',
  ])('una función no soportada (%s) no consume ni lee nada', async (message) => {
    const db = fakeDatabase()
    const { provider, sent } = fakeProvider([VALID])

    const response = await ask(message, db, provider)

    expect(response.type).toBe('unsupported_financial_feature')
    expect(db.log).toEqual([])
    expect(sent).toHaveLength(0)
    expect(db.counter.value).toBe(0)
  })

  it('un cuerpo inválido o un mensaje demasiado largo no consumen', async () => {
    for (const body of [{}, { message: '' }, { message: 42 }, { message: 'a'.repeat(1001) }]) {
      const db = fakeDatabase()
      const { provider, sent } = fakeProvider([VALID])

      const response = await handleCoachRequest({
        body,
        userId: USER,
        client: db.client,
        now: NOW,
        ai: realAI(provider),
      })

      expect(response).toMatchObject({ type: 'error', code: 'invalid_request' })
      expect(db.log).toEqual([])
      expect(sent).toHaveLength(0)
    }
  })

  it('sin JWT o con un JWT inválido no se construye siquiera el flujo', async () => {
    const db = fakeDatabase()
    const { provider, sent } = fakeProvider([VALID])
    const invalid = {
      ...db.client,
      auth: { getUser: async () => ({ data: { user: null }, error: { message: 'jwt' } }) },
    } as unknown as CoachSupabaseClient

    const request = (authorization?: string) =>
      new Request('https://fintrack.win/', {
        method: 'POST',
        headers: {
          ...(authorization ? { Authorization: authorization } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: '¿En qué gasté más este mes?' }),
      })

    const missing = await handleCoachHttpRequest(request(), {
      createClient: () => db.client,
      now: NOW,
      ai: realAI(provider),
    })
    const rejected = await handleCoachHttpRequest(request('Bearer malo'), {
      createClient: () => invalid,
      now: NOW,
      ai: realAI(provider),
    })

    expect(missing.status).toBe(401)
    expect(rejected.status).toBe(401)
    expect(db.log).toEqual([])
    expect(sent).toHaveLength(0)
    expect(db.counter.value).toBe(0)
  })

  it('una aclaración de moneda no llega al proveedor ni consume', async () => {
    const db = fakeDatabase({
      accounts: [
        { id: 'acc-cop', type: 'cash', currency_code: 'COP', initial_balance_minor: 0 },
        { id: 'acc-usd', type: 'cash', currency_code: 'USD', initial_balance_minor: 0 },
      ],
    })
    const { provider, sent } = fakeProvider([VALID])

    const response = await ask('¿En qué gasté más este mes?', db, provider)

    expect(response).toMatchObject({ type: 'clarification', reason: 'currency_required' })
    expect(sent).toHaveLength(0)
    expect(db.counter.value).toBe(0)
    expect(snapshotReads(db.log)).toEqual([])
  })

  it('sin proveedor configurado no lee consentimiento ni consume: la ruta sigue inerte', async () => {
    const db = fakeDatabase()

    const response = await handleCoachRequest({
      body: { message: '¿En qué gasté más este mes?' },
      userId: USER,
      client: db.client,
      now: NOW,
    })

    expect(response.type).toBe('coach_context_ready')
    expect(db.log.some((entry) => entry.includes('ai_consent'))).toBe(false)
    expect(db.log.some((entry) => entry.startsWith('rpc:'))).toBe(false)
  })
})

describe('límite alcanzado', () => {
  it('responde rate_limited sin construir snapshot ni llamar al proveedor', async () => {
    const db = fakeDatabase({ used: COACH_HOURLY_LIMIT })
    const { provider, sent } = fakeProvider([VALID], db.log)

    const response = await ask('¿En qué gasté más este mes?', db, provider)

    expect(response).toEqual({
      type: 'error',
      code: 'rate_limited',
      message:
        'Alcanzaste el límite temporal de consultas de FinTrack Coach. Inténtalo de nuevo más tarde.',
      // 15:20:00 UTC → la ventana se renueva a las 16:00:00.
      retryAfterSeconds: 40 * 60,
    })
    expect(sent).toHaveLength(0)
    expect(snapshotReads(db.log)).toEqual([])
    expect(db.counter.value).toBe(COACH_HOURLY_LIMIT)
  })

  it('por HTTP responde 429 con Retry-After igual al del cuerpo', async () => {
    const db = fakeDatabase({ used: COACH_HOURLY_LIMIT })
    const { provider } = fakeProvider([VALID])

    const response = await handleCoachHttpRequest(
      new Request('https://fintrack.win/', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '¿En qué gasté más este mes?' }),
      }),
      { createClient: () => db.client, now: NOW, ai: realAI(provider) },
    )
    const body = (await response.json()) as { retryAfterSeconds: number }

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe(String(body.retryAfterSeconds))
  })

  it('si la cuota no se puede comprobar, cierra: ni snapshot ni proveedor', async () => {
    const db = fakeDatabase({ rpcError: true })
    const { provider, sent } = fakeProvider([VALID])

    const response = await ask('¿En qué gasté más este mes?', db, provider)

    expect(response).toMatchObject({ type: 'error', code: 'internal' })
    expect(JSON.stringify(response)).not.toContain('rpc caída')
    expect(sent).toHaveLength(0)
    expect(snapshotReads(db.log)).toEqual([])
  })

  it('solicitudes concurrentes no superan el límite', async () => {
    const db = fakeDatabase()
    const { provider, sent } = fakeProvider(Array(40).fill(VALID))

    const responses = await Promise.all(
      Array.from({ length: 40 }, () => ask('¿En qué gasté más este mes?', db, provider)),
    )

    const answered = responses.filter((response) => response.type === 'financial_answer')
    const limited = responses.filter(
      (response) => response.type === 'error' && response.code === 'rate_limited',
    )

    expect(answered).toHaveLength(COACH_HOURLY_LIMIT)
    expect(limited).toHaveLength(40 - COACH_HOURLY_LIMIT)
    expect(sent).toHaveLength(COACH_HOURLY_LIMIT)
    expect(db.counter.value).toBe(COACH_HOURLY_LIMIT)
  })
})

describe('fallos del proveedor', () => {
  it.each([
    ['429', new LLMProviderError('http', 'El proveedor respondió 429.', 429)],
    ['503', new LLMProviderError('http', 'El proveedor respondió 503.', 503)],
    ['timeout', new LLMProviderError('timeout', 'El proveedor no respondió a tiempo.')],
    ['red', new LLMProviderError('network', 'No se pudo contactar al proveedor.')],
    ['error inesperado', new Error('COACH_LLM_API_KEY=clave-secreta en el prompt')],
  ])('%s: consume la unidad, no reintenta y no filtra nada', async (_label, failure) => {
    const db = fakeDatabase()
    const { provider, sent } = fakeProvider([failure, VALID])

    const response = await ask('¿En qué gasté más este mes?', db, provider)
    const serialized = JSON.stringify(response)

    expect(response).toMatchObject({ type: 'error', code: 'provider_error' })
    expect(sent).toHaveLength(1)
    expect(db.counter.value).toBe(1)

    // Ni la clave, ni el prompt, ni el snapshot, ni el detalle del proveedor.
    expect(serialized).not.toMatch(/clave|COACH_LLM|prompt|snapshot|450000|450\.000|Mercado/)
    expect(serialized).not.toMatch(/429|503|respondió/)
    expect(Object.keys(response).sort()).toEqual(['code', 'message', 'type'])
  })

  it('por HTTP un 503 del proveedor responde 502 y sin Retry-After', async () => {
    const db = fakeDatabase()
    const { provider } = fakeProvider([new LLMProviderError('http', 'caído', 503)])

    const response = await handleCoachHttpRequest(
      new Request('https://fintrack.win/', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '¿En qué gasté más este mes?' }),
      }),
      { createClient: () => db.client, now: NOW, ai: realAI(provider) },
    )

    expect(response.status).toBe(502)
    expect(response.headers.get('Retry-After')).toBeNull()
  })

  it('lo enviado al proveedor no lleva descripciones de movimientos', async () => {
    const db = fakeDatabase()
    const { provider, sent } = fakeProvider([VALID])

    await ask('¿En qué gasté más este mes?', db, provider)

    expect(sent.join('')).not.toMatch(/Tienda Secreta|acc-cop|cat-food|tx-1|user-jwt/)
  })
})

describe('consumidor de cuota', () => {
  it('hace una sola llamada RPC con el límite y sin leer el contador', async () => {
    const calls: unknown[][] = []
    const client = {
      from: () => {
        throw new Error('no debe leer tablas')
      },
      rpc: async (...args: unknown[]) => {
        calls.push(args)
        return { data: 3, error: null }
      },
    } as unknown as CoachSupabaseClient

    expect(await createQuotaConsumer(7)(client, NOW)).toEqual({ kind: 'allowed', used: 3 })
    expect(calls).toEqual([['consume_ai_quota', { p_limit: 7 }]])
  })

  it('no envía ningún identificador de usuario: la función usa auth.uid()', async () => {
    const calls: unknown[][] = []
    const client = {
      rpc: async (...args: unknown[]) => {
        calls.push(args)
        return { data: 1, error: null }
      },
    } as unknown as CoachSupabaseClient

    await consumeAIQuota(client, NOW)

    expect(JSON.stringify(calls)).not.toMatch(/user/)
    expect(calls[0]?.[1]).toEqual({ p_limit: COACH_HOURLY_LIMIT })
  })

  it.each([
    ['error de RPC', async () => ({ data: null, error: { message: 'x' } })],
    ['excepción', async () => Promise.reject(new Error('x'))],
    ['valor inesperado', async () => ({ data: 'quince', error: null })],
    ['cero', async () => ({ data: 0, error: null })],
  ])('%s → unavailable', async (_label, rpc) => {
    const client = { rpc } as unknown as CoachSupabaseClient
    expect(await consumeAIQuota(client, NOW)).toEqual({ kind: 'unavailable' })
  })

  it('secondsUntilNextWindow cuenta hasta la siguiente hora en punto, nunca 0', () => {
    expect(secondsUntilNextWindow(new Date('2026-09-21T15:00:00Z'))).toBe(3600)
    expect(secondsUntilNextWindow(new Date('2026-09-21T15:59:59Z'))).toBe(1)
    expect(secondsUntilNextWindow(new Date('2026-09-21T15:59:59.900Z'))).toBe(1)
    expect(secondsUntilNextWindow(new Date('2026-09-21T15:20:00Z'))).toBe(2400)
  })
})
