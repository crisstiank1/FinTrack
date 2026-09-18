import { describe, expect, it, vi } from 'vitest'

import type { CoachSupabaseClient } from './context'
import { handleCoachHttpRequest } from './http'

/**
 * Doble del cliente de Supabase.
 *
 * No imita a PostgREST entero: solo las tres lecturas que el Coach hace y
 * `auth.getUser()`. Registra cada llamada para poder afirmar **con qué usuario**
 * se consultó, que es la propiedad de seguridad que estas pruebas vigilan.
 */
interface FakeClientOptions {
  user?: { id: string } | null
  authError?: boolean
  profile?: { timezone: string; currency_code: string } | null
  profileError?: boolean
  accounts?: { currency_code: string }[]
  budgetCount?: number
}

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function fakeClient(options: FakeClientOptions = {}) {
  const {
    user = { id: 'user-jwt' },
    authError = false,
    profile = { timezone: 'America/Bogota', currency_code: 'COP' },
    profileError = false,
    accounts = [{ currency_code: 'COP' }],
    budgetCount = 0,
  } = options

  const calls: RecordedCall[] = []

  function resultFor(table: string) {
    if (table === 'profiles') {
      return profileError
        ? { data: null, error: new Error('fallo'), count: null }
        : { data: profile, error: null, count: null }
    }
    if (table === 'accounts') return { data: accounts, error: null, count: null }
    return { data: [], error: null, count: budgetCount }
  }

  function chain(table: string) {
    const result = resultFor(table)

    const node: Record<string, unknown> = {
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled, onRejected),
      maybeSingle: () => {
        calls.push({ table, method: 'maybeSingle', args: [] })
        return Promise.resolve(result)
      },
    }

    for (const method of ['select', 'eq'] as const) {
      node[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return node
      }
    }

    return node
  }

  const client = {
    auth: {
      getUser: () =>
        Promise.resolve(
          authError
            ? { data: { user: null }, error: new Error('jwt invalido') }
            : { data: { user }, error: null },
        ),
    },
    from: (table: string) => chain(table),
  }

  return { client: client as unknown as CoachSupabaseClient, calls }
}

function post(message: unknown, headers: Record<string, string> = {}) {
  return new Request('https://fintrack.win/functions/v1/finance-chat', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer token-valido',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(message),
  })
}

async function ask(message: unknown, options: FakeClientOptions = {}, now?: Date) {
  const { client, calls } = fakeClient(options)
  const response = await handleCoachHttpRequest(post(message), { createClient: () => client, now })

  return { response, body: await response.json(), calls }
}

describe('autenticación', () => {
  it('sin cabecera Authorization responde 401 y no construye cliente', async () => {
    const createClient = vi.fn()
    const request = new Request('https://fintrack.win/', {
      method: 'POST',
      body: JSON.stringify({ message: '¿cuánto gasté?' }),
    })

    const response = await handleCoachHttpRequest(request, { createClient })

    expect(response.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('una cabecera que no es Bearer responde 401', async () => {
    const { client } = fakeClient()
    const request = post({ message: '¿cuánto gasté?' }, { Authorization: 'Basic abc' })

    const response = await handleCoachHttpRequest(request, { createClient: () => client })

    expect(response.status).toBe(401)
  })

  it('un JWT que la sesión rechaza responde 401 sin leer datos', async () => {
    const { response, body, calls } = await ask({ message: '¿cuánto gasté?' }, { authError: true })

    expect(response.status).toBe(401)
    expect(body).toMatchObject({ type: 'error', code: 'unauthorized' })
    expect(calls).toHaveLength(0)
  })

  it('pasa la cabecera recibida al constructor del cliente', async () => {
    const { client } = fakeClient()
    const createClient = vi.fn(() => client)

    await handleCoachHttpRequest(post({ message: '¿cuánto gasté?' }), { createClient })

    expect(createClient).toHaveBeenCalledWith('Bearer token-valido')
  })

  it('consulta siempre con el usuario del JWT, aunque el cuerpo nombre a otro', async () => {
    const { calls } = await ask({ message: '¿cuánto gasté?', userId: 'user-atacante' })

    const userFilters = calls.filter((call) => call.method === 'eq')

    expect(userFilters.length).toBeGreaterThan(0)
    for (const call of userFilters) {
      expect(call.args[1]).toBe('user-jwt')
      expect(call.args[1]).not.toBe('user-atacante')
    }
  })
})

describe('método y cuerpo', () => {
  it('GET responde 405', async () => {
    const { client } = fakeClient()
    const request = new Request('https://fintrack.win/', { method: 'GET' })

    const response = await handleCoachHttpRequest(request, { createClient: () => client })

    expect(response.status).toBe(405)
  })

  it('OPTIONS responde 204 con las cabeceras de CORS del origen permitido', async () => {
    const { client } = fakeClient()
    const request = new Request('https://fintrack.win/', {
      method: 'OPTIONS',
      headers: { Origin: 'https://fintrack.win' },
    })

    const response = await handleCoachHttpRequest(request, { createClient: () => client })

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://fintrack.win')
  })

  it('un origen no permitido no recibe permiso de CORS', async () => {
    const { client } = fakeClient()
    const request = new Request('https://fintrack.win/', {
      method: 'OPTIONS',
      headers: { Origin: 'https://sitio-ajeno.example' },
    })

    const response = await handleCoachHttpRequest(request, { createClient: () => client })

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('un mensaje vacío responde 400', async () => {
    const { response, body } = await ask({ message: '   ' })

    expect(response.status).toBe(400)
    expect(body).toMatchObject({ type: 'error', code: 'invalid_request' })
  })

  it('un mensaje demasiado largo responde 400 sin leer datos', async () => {
    const { response, calls } = await ask({ message: 'a'.repeat(1001) })

    expect(response.status).toBe(400)
    expect(calls).toHaveLength(0)
  })
})

describe('filtro de alcance', () => {
  it('una pregunta de inversión sale de alcance sin tocar la base de datos', async () => {
    const { response, body, calls } = await ask({ message: '¿Qué acción compro hoy?' })

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ type: 'out_of_scope', reason: 'investment_advice' })
    expect(calls).toHaveLength(0)
  })

  it('una pregunta ajena sale de alcance', async () => {
    const { body } = await ask({ message: 'Cuéntame un chiste' })

    expect(body).toMatchObject({ type: 'out_of_scope', reason: 'off_topic' })
  })

  it('una pregunta de deuda responde que falta el dato, no que sea ajena', async () => {
    const { body, calls } = await ask({ message: '¿Qué deuda debería pagar primero?' })

    expect(body).toMatchObject({
      type: 'unsupported_financial_feature',
      feature: 'debt_management',
    })
    expect(body.message).toContain('saldo')
    expect(calls).toHaveLength(0)
  })

  it('una pregunta de meta de ahorro responde que falta el dato', async () => {
    const { body } = await ask({ message: '¿Cuánto debo ahorrar para mi meta?' })

    expect(body).toMatchObject({
      type: 'unsupported_financial_feature',
      feature: 'savings_goals',
    })
  })

  it('una pregunta de fondo de emergencia responde que falta el dato', async () => {
    const { body } = await ask({ message: '¿Cuánto debería tener en el fondo de emergencia?' })

    expect(body).toMatchObject({
      type: 'unsupported_financial_feature',
      feature: 'emergency_fund',
    })
  })

  it('una pregunta de gasto por categoría llega al contexto', async () => {
    const { body } = await ask({ message: '¿En qué gasté más este mes?' })

    expect(body).toMatchObject({
      type: 'coach_context_ready',
      intent: 'spending_by_category',
      currency: 'COP',
    })
  })
})

describe('período y zona horaria', () => {
  it('a las 20:00 del 30 de septiembre en Bogotá el período sigue siendo septiembre', async () => {
    const { body } = await ask(
      { message: '¿En qué gasté más este mes?' },
      { profile: { timezone: 'America/Bogota', currency_code: 'COP' } },
      new Date('2026-10-01T01:00:00Z'),
    )

    expect(body.period).toMatchObject({ monthKey: '2026-09', start: '2026-09-01' })
    expect(body.comparedTo.monthKey).toBe('2026-08')
  })

  it('el mismo instante en UTC cae en octubre: la zona del perfil es la que manda', async () => {
    const { body } = await ask(
      { message: '¿En qué gasté más este mes?' },
      { profile: { timezone: 'UTC', currency_code: 'COP' } },
      new Date('2026-10-01T01:00:00Z'),
    )

    expect(body.period.monthKey).toBe('2026-10')
  })

  it('el mes en curso termina hoy, no el día 30', async () => {
    const { body } = await ask(
      { message: '¿En qué gasté más este mes?' },
      {},
      new Date('2026-09-17T15:00:00Z'),
    )

    expect(body.period).toMatchObject({ start: '2026-09-01', end: '2026-09-17' })
  })

  it('una zona horaria corrupta da error en vez de contestar el mes de UTC', async () => {
    const { response, body } = await ask(
      { message: '¿En qué gasté más este mes?' },
      { profile: { timezone: 'No/Existe', currency_code: 'COP' } },
    )

    expect(response.status).toBe(500)
    expect(body).toMatchObject({ type: 'error', code: 'invalid_profile_timezone' })
  })
})

describe('resolución de moneda', () => {
  it('con varias monedas y sin mención, pregunta en vez de elegir', async () => {
    const { body } = await ask(
      { message: '¿En qué gasté más este mes?' },
      { accounts: [{ currency_code: 'COP' }, { currency_code: 'USD' }] },
    )

    expect(body).toMatchObject({ type: 'clarification', reason: 'currency_required' })
    expect(body.options).toEqual(['COP', 'USD'])
  })

  it('con varias monedas y una nombrada, usa la nombrada', async () => {
    const { body } = await ask(
      { message: '¿En qué gasté más este mes en USD?' },
      { accounts: [{ currency_code: 'COP' }, { currency_code: 'USD' }] },
    )

    expect(body).toMatchObject({ type: 'coach_context_ready', currency: 'USD' })
  })

  it('con una sola moneda no pregunta nada', async () => {
    const { body } = await ask({ message: '¿En qué gasté más este mes?' })

    expect(body).toMatchObject({ type: 'coach_context_ready', currency: 'COP' })
  })

  it('una moneda en la que no hay cuentas ofrece las que sí existen', async () => {
    const { body } = await ask(
      { message: '¿Cuánto gasté en ARS?' },
      { accounts: [{ currency_code: 'COP' }] },
    )

    expect(body).toMatchObject({ type: 'clarification', reason: 'currency_not_available' })
    expect(body.options).toEqual(['COP'])
  })

  it('sin cuentas lo dice en vez de inventar una moneda', async () => {
    const { body } = await ask({ message: '¿Cuánto gasté este mes?' }, { accounts: [] })

    expect(body).toMatchObject({ type: 'clarification', reason: 'no_accounts' })
  })
})

describe('datos disponibles', () => {
  it('sin presupuestos no ofrece el estado de presupuestos', async () => {
    const { body } = await ask({ message: '¿En qué gasté más este mes?' }, { budgetCount: 0 })

    expect(body.availableData).toEqual([
      'period_summary',
      'spending_by_category',
      'category_delta',
      'cashflow_status',
    ])
  })

  it('con presupuestos lo añade', async () => {
    const { body } = await ask({ message: '¿Voy bien con el presupuesto?' }, { budgetCount: 3 })

    expect(body.availableData).toContain('budget_status')
  })

  it('no devuelve ningún importe todavía', async () => {
    const { body } = await ask({ message: '¿En qué gasté más este mes?' })

    expect(JSON.stringify(body)).not.toMatch(/amount|Minor|saldo/i)
  })
})

describe('errores', () => {
  it('un fallo al leer el perfil no filtra el detalle del error', async () => {
    const { response, body } = await ask({ message: '¿Cuánto gasté?' }, { profileError: true })

    expect(response.status).toBe(500)
    expect(body).toMatchObject({ type: 'error', code: 'internal' })
    expect(JSON.stringify(body)).not.toContain('fallo')
  })

  it('un cuerpo que no es JSON responde 400', async () => {
    const { client } = fakeClient()
    const request = new Request('https://fintrack.win/', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-valido' },
      body: 'esto no es json',
    })

    const response = await handleCoachHttpRequest(request, { createClient: () => client })

    expect(response.status).toBe(400)
  })
})
