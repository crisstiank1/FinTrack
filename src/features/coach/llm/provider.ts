/**
 * Frontera con el proveedor de modelo.
 *
 * Todo el Coach habla con esta interfaz y ninguna otra cosa sabe qué proveedor
 * hay detrás. Cambiar de NVIDIA NIM a Groq, o a cualquier otro, es cambiar la
 * configuración de despliegue, no el código de las reglas ni del snapshot.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMRequest {
  messages: LLMMessage[]
  maxTokens: number
  temperature: number
}

export interface LLMUsage {
  promptTokens: number
  completionTokens: number
}

export interface LLMResponse {
  text: string
  /** Modelo que respondió de verdad, según el proveedor. */
  model: string
  usage?: LLMUsage
}

export interface LLMProvider {
  /** Nombre para trazabilidad, sin secretos: 'nvidia-nim', 'groq'… */
  readonly name: string
  readonly model: string
  generate(request: LLMRequest): Promise<LLMResponse>
}

export type LLMProviderErrorKind = 'timeout' | 'network' | 'http' | 'invalid_response'

/**
 * Fallo del proveedor.
 *
 * El mensaje nunca incluye el cuerpo de la respuesta del proveedor: puede
 * repetir el prompt, y el prompt lleva el snapshot del usuario.
 */
export class LLMProviderError extends Error {
  readonly kind: LLMProviderErrorKind
  readonly status?: number

  constructor(kind: LLMProviderErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'LLMProviderError'
    this.kind = kind
    this.status = status
  }
}
