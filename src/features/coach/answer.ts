import type { CoachContextSnapshot } from './contracts'
import { LLMProviderError, type LLMMessage, type LLMProvider } from './llm/provider'
import { buildRetryPrompt, buildSystemPrompt, buildUserPrompt, PROMPT_VERSION } from './prompt'
import {
  coachError,
  type CoachContextReady,
  type CoachError,
  type CoachFinancialAnswer,
} from './responses'
import { parseModelContent, validateModelContent, type Violation } from './validation'

/**
 * Redacción de una respuesta financiera.
 *
 * Una sola regla ordena este archivo: **lo que devuelve el modelo no se muestra
 * hasta que el validador lo aprueba**. Si falla, se le da una oportunidad de
 * corregirse con la lista de lo que hizo mal. Si falla dos veces, la respuesta
 * es un error, no la mejor de las dos: una cifra dudosa en pantalla es peor que
 * "no pude responder, inténtalo de nuevo".
 */

/** Un reintento. Más, y el coste y la latencia crecen sin mejorar la tasa de acierto. */
const MAX_ATTEMPTS = 2

/** Suficiente para un título, un resumen y siete frases breves. */
const MAX_TOKENS = 700

/**
 * Baja: la tarea es redactar datos dados, no crear. Una temperatura alta solo
 * aumenta la probabilidad de que invente una cifra y gaste el reintento.
 */
const TEMPERATURE = 0.2

export interface GenerateAnswerInput {
  provider: LLMProvider
  context: CoachContextReady
  snapshot: CoachContextSnapshot
  question: string
}

export async function generateFinancialAnswer({
  provider,
  context,
  snapshot,
  question,
}: GenerateAnswerInput): Promise<CoachFinancialAnswer | CoachError> {
  const messages: LLMMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt({ intent: context.intent, question, snapshot }) },
  ]

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let text: string
    let model: string

    try {
      const response = await provider.generate({
        messages,
        maxTokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      })
      text = response.text
      model = response.model
    } catch (error) {
      // Un fallo del proveedor no se reintenta aquí: si fue un tiempo de
      // espera, reintentar duplica la espera de quien pregunta.
      return coachError(
        'provider_error',
        error instanceof LLMProviderError && error.kind === 'timeout'
          ? 'El asistente tardó demasiado en responder. Inténtalo de nuevo.'
          : 'El asistente no está disponible en este momento. Inténtalo de nuevo.',
      )
    }

    const violations = check(text, snapshot)

    if (violations.ok) {
      return {
        type: 'financial_answer',
        intent: context.intent,
        currency: context.currency,
        period: context.period,
        snapshot,
        content: violations.content,
        meta: { promptVersion: PROMPT_VERSION, model },
      }
    }

    messages.push(
      { role: 'assistant', content: text },
      { role: 'user', content: buildRetryPrompt(violations.violations) },
    )
  }

  return coachError(
    'answer_rejected',
    'No pude redactar una respuesta fiable con tus datos. Inténtalo de nuevo con otra pregunta.',
  )
}

function check(text: string, snapshot: CoachContextSnapshot) {
  const parsed = parseModelContent(text)

  if ('code' in parsed) return { ok: false as const, violations: [parsed as Violation] }
  return validateModelContent(parsed, snapshot)
}
