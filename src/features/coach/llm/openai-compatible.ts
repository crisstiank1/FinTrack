import { LLMProviderError, type LLMProvider, type LLMRequest, type LLMResponse } from './provider'

/**
 * Proveedor para cualquier API compatible con `/chat/completions` de OpenAI.
 *
 * NVIDIA NIM y Groq exponen ese mismo formato, así que un solo adaptador sirve
 * para evaluar los dos. Lo único que cambia entre ellos es la configuración:
 * URL base, modelo y clave.
 *
 * Ninguno de esos tres valores está escrito en el código. Los pone la Edge
 * Function desde sus secretos, y en las pruebas los pone la prueba.
 */
export interface OpenAICompatibleConfig {
  /** Nombre para trazabilidad: 'nvidia-nim', 'groq'… */
  name: string
  /** URL base sin la barra final, p. ej. la de la API del proveedor hasta `/v1`. */
  baseUrl: string
  apiKey: string
  model: string
  /** Por defecto 20 s. Una Edge Function no puede esperar indefinidamente. */
  timeoutMs?: number
  /**
   * Pide `response_format: json_object`. Casi todos los modelos lo aceptan; si
   * alguno lo rechaza, se desactiva aquí y el validador sigue exigiendo JSON.
   */
  jsonMode?: boolean
  /** Inyectable para las pruebas. */
  fetch?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 20_000

interface ChatCompletionBody {
  model?: unknown
  choices?: { message?: { content?: unknown } }[]
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): LLMProvider {
  const doFetch = config.fetch ?? fetch
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`

  return {
    name: config.name,
    model: config.model,

    async generate(request: LLMRequest): Promise<LLMResponse> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_TIMEOUT_MS)

      let response: Response
      try {
        response = await doFetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            messages: request.messages,
            max_tokens: request.maxTokens,
            temperature: request.temperature,
            ...(config.jsonMode === false ? {} : { response_format: { type: 'json_object' } }),
          }),
          signal: controller.signal,
        })
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError'
        throw new LLMProviderError(
          aborted ? 'timeout' : 'network',
          aborted ? 'El proveedor no respondió a tiempo.' : 'No se pudo contactar al proveedor.',
        )
      } finally {
        clearTimeout(timer)
      }

      if (!response.ok) {
        // Solo el código: el cuerpo de un error puede repetir el prompt.
        throw new LLMProviderError(
          'http',
          `El proveedor respondió ${response.status}.`,
          response.status,
        )
      }

      let body: ChatCompletionBody
      try {
        body = (await response.json()) as ChatCompletionBody
      } catch {
        throw new LLMProviderError('invalid_response', 'La respuesta del proveedor no era JSON.')
      }

      const text = body.choices?.[0]?.message?.content
      if (typeof text !== 'string') {
        throw new LLMProviderError('invalid_response', 'La respuesta del proveedor no traía texto.')
      }

      const promptTokens = body.usage?.prompt_tokens
      const completionTokens = body.usage?.completion_tokens

      return {
        text,
        model: typeof body.model === 'string' ? body.model : config.model,
        usage:
          typeof promptTokens === 'number' && typeof completionTokens === 'number'
            ? { promptTokens, completionTokens }
            : undefined,
      }
    },
  }
}
