import { resolveCoachContext, type CoachSupabaseClient } from './context'
import { coachError, outOfScope, unsupportedFeature, type CoachResponse } from './responses'
import { classifyMessage } from './scope'

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

  return resolveCoachContext({
    client,
    userId,
    intent: decision.intent,
    currencyHint: decision.currencyHint,
    now,
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
