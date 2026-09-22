import { describe, expect, it, vi } from 'vitest'

import { createOpenAICompatibleProvider } from './openai-compatible'
import { LLMProviderError } from './provider'

const request = {
  messages: [
    { role: 'system' as const, content: 'sistema' },
    { role: 'user' as const, content: 'pregunta' },
  ],
  maxTokens: 700,
  temperature: 0.2,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function provider(fetchImpl: typeof fetch, overrides = {}) {
  return createOpenAICompatibleProvider({
    name: 'prueba',
    baseUrl: 'https://proveedor.example/v1/',
    apiKey: 'clave-de-prueba',
    model: 'modelo-x',
    fetch: fetchImpl,
    ...overrides,
  })
}

const okBody = {
  model: 'modelo-x-2026',
  choices: [{ message: { content: '{"title":"t","summary":"s"}' } }],
  usage: { prompt_tokens: 120, completion_tokens: 40 },
}

describe('createOpenAICompatibleProvider', () => {
  it('llama a /chat/completions con la clave, el modelo y modo JSON', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okBody))

    await provider(fetchImpl as unknown as typeof fetch).generate(request)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string)

    expect(url).toBe('https://proveedor.example/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer clave-de-prueba')
    expect(body).toMatchObject({
      model: 'modelo-x',
      max_tokens: 700,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    })
    expect(body.messages).toEqual(request.messages)
  })

  it('omite response_format cuando el modelo no lo admite', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okBody))

    await provider(fetchImpl as unknown as typeof fetch, { jsonMode: false }).generate(request)

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('response_format')
  })

  it('devuelve el texto, el modelo real y el uso de tokens', async () => {
    const result = await provider((async () => jsonResponse(okBody)) as typeof fetch).generate(
      request,
    )

    expect(result).toEqual({
      text: '{"title":"t","summary":"s"}',
      model: 'modelo-x-2026',
      usage: { promptTokens: 120, completionTokens: 40 },
    })
  })

  it('un error HTTP lanza con el código y sin el cuerpo, que puede repetir el prompt', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ error: 'eco del prompt con datos del usuario' }, 429)) as typeof fetch

    const error = await provider(fetchImpl)
      .generate(request)
      .catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(LLMProviderError)
    expect(error).toMatchObject({ kind: 'http', status: 429 })
    expect((error as Error).message).not.toContain('eco del prompt')
  })

  it('una respuesta sin texto lanza invalid_response', async () => {
    const fetchImpl = (async () => jsonResponse({ choices: [] })) as typeof fetch

    await expect(provider(fetchImpl).generate(request)).rejects.toMatchObject({
      kind: 'invalid_response',
    })
  })

  it('un fallo de red lanza network', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch

    await expect(provider(fetchImpl).generate(request)).rejects.toMatchObject({ kind: 'network' })
  })

  it('corta la espera al superar el tiempo máximo', async () => {
    const fetchImpl = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          const abort = new Error('aborted')
          abort.name = 'AbortError'
          reject(abort)
        })
      })) as unknown as typeof fetch

    await expect(provider(fetchImpl, { timeoutMs: 10 }).generate(request)).rejects.toMatchObject({
      kind: 'timeout',
    })
  })
})
