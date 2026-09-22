import { generateFinancialAnswer } from './answer'
import type { ConsentCheck } from './consent'
import { resolveCoachContext, type CoachSupabaseClient } from './context'
import type { LLMProvider } from './llm/provider'
import { coachError, outOfScope, unsupportedFeature, type CoachResponse } from './responses'
import { classifyMessage } from './scope'
import {
  buildCoachSnapshot,
  intentNeedsData,
  loadSnapshotData,
  type SnapshotData,
} from './snapshot'

/**
 * Longitud máxima del mensaje.
 *
 * Existe antes que el proveedor de IA porque el límite protege dos cosas
 * distintas: el coste futuro de los tokens y, ya hoy, el trabajo que un cliente
 * puede hacerle gastar al backend con una sola petición.
 */
export const MAX_MESSAGE_LENGTH = 1000

export interface CoachRequestInput {
  /** Cuerpo de la petición ya parseado. Se valida aquí, no antes. */
  body: unknown
  /**
   * Usuario del JWT validado.
   *
   * Es un parámetro, y no algo que este módulo lea del cuerpo, justamente para
   * que no exista ninguna ruta por la que un cliente pueda nombrar a otro
   * usuario. Todo lo que llegue en `body` aparte de `message` se ignora.
   */
  userId: string
  client: CoachSupabaseClient
  /** Inyectable para que las pruebas no dependan del reloj. */
  now?: Date
  /**
   * Redacción por IA. Sin esto, la respuesta es el contexto resuelto, igual que
   * en la Fase 2. Con esto, además hace falta que `hasConsent` diga que sí.
   */
  ai?: CoachAI
}

export interface CoachAI {
  provider: LLMProvider
  hasConsent: ConsentCheck
}

/** Snapshot de una pregunta que no usa datos: período y moneda, y nada más. */
const NO_DATA: SnapshotData = {
  primaryCurrency: null,
  accounts: [],
  transactions: [],
  categories: [],
  budgets: [],
}

/**
 * Valida el mensaje, decide el alcance y resuelve el contexto.
 *
 * Vive en `src/` y no dentro de `supabase/functions/` para que sea comprobable
 * con la misma suite que el resto del dominio: la Edge Function es solo la
 * capa HTTP que lo envuelve.
 *
 * El orden importa. Una pregunta fuera de alcance se rechaza **antes** de
 * cualquier consulta, así que preguntar por bitcoin no llega a tocar la base de
 * datos ni a revelar, por el tiempo de respuesta, si el usuario tiene datos.
 */
export async function handleCoachRequest({
  body,
  userId,
  client,
  now,
  ai,
}: CoachRequestInput): Promise<CoachResponse> {
  const message = readMessage(body)

  if (message === null) {
    return coachError('invalid_request', 'Envía una pregunta en el campo "message".')
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return coachError(
      'invalid_request',
      `Tu pregunta supera los ${MAX_MESSAGE_LENGTH} caracteres. ¿Puedes acortarla?`,
    )
  }

  const decision = classifyMessage(message)

  if (decision.kind === 'out_of_scope') return outOfScope(decision.reason)
  if (decision.kind === 'unsupported') return unsupportedFeature(decision.feature)

  const context = await resolveCoachContext({
    client,
    userId,
    intent: decision.intent,
    currencyHint: decision.currencyHint,
    now,
  })

  // El filtro de alcance ya decidió antes de llegar aquí, y el modelo no lo
  // sustituye (docs/12, principio 8). Lo que queda son dos condiciones más para
  // enviar algo a un tercero: que haya proveedor y que el usuario lo autorizara.
  if (context.type !== 'coach_context_ready' || !ai) return context
  if (!(await ai.hasConsent(client, userId))) return context

  // Las preguntas de concepto y de ayuda no leen ni una fila del usuario.
  const data = intentNeedsData(context.intent)
    ? await loadSnapshotData(client, userId, context)
    : NO_DATA

  return generateFinancialAnswer({
    provider: ai.provider,
    context,
    snapshot: buildCoachSnapshot({ context, data }),
    question: message,
  })
}

/** Mensaje utilizable, o `null` si el cuerpo no trae uno. */
function readMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null

  const value = (body as Record<string, unknown>).message
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}
