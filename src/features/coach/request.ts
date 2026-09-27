import { generateFinancialAnswer } from './answer'
import type { ConsentCheck } from './consent'
import { resolveCoachContext, type CoachSupabaseClient } from './context'
import type { LLMProvider } from './llm/provider'
import type { QuotaConsumer } from './quota'
import {
  coachError,
  consentRequired,
  outOfScope,
  rateLimited,
  unsupportedFeature,
  type CoachResponse,
} from './responses'
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
   * en la Fase 2, y no se lee consentimiento ni se toca la cuota: no va a salir
   * nada hacia un tercero. Con esto, hace falta además que `hasConsent` diga
   * exactamente `true` y que `consumeQuota` conceda una unidad.
   */
  ai?: CoachAI
}

export interface CoachAI {
  provider: LLMProvider
  hasConsent: ConsentCheck
  consumeQuota: QuotaConsumer
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
 * Valida el mensaje, decide el alcance, comprueba consentimiento y cuota, y
 * resuelve el contexto.
 *
 * Vive en `src/` y no dentro de `supabase/functions/` para que sea comprobable
 * con la misma suite que el resto del dominio: la Edge Function es solo la
 * capa HTTP que lo envuelve (método, CORS, `Authorization` y JWT ya vienen
 * validados de `http.ts`).
 *
 * El orden es el contrato:
 *
 * 1. Mensaje y longitud.
 * 2. Filtro de alcance. Fuera de alcance o no soportada responde aquí, sin
 *    tocar la base de datos, sin leer consentimiento y sin consumir cuota.
 * 3. Sin proveedor configurado: el contexto, como en la Fase 2. No se envía
 *    nada, así que no se pide consentimiento ni se gasta cuota.
 * 4. **Consentimiento**, solo `=== true`. Sin él: `consent_required`, sin leer
 *    ni un dato financiero y sin tocar la cuota.
 * 5. Contexto: zona horaria, moneda y qué datos hay. Solo metadatos —ni un
 *    importe—, y puede terminar en una aclaración. Va **antes** de la cuota
 *    para que una aclaración de moneda, que no llama al proveedor, no la gaste.
 * 6. **Cuota**, atómica en la base de datos. Agotada: `rate_limited` sin
 *    snapshot ni proveedor. Desde aquí la unidad está gastada aunque el
 *    proveedor falle: la llamada ya se decidió.
 * 7. Snapshot agregado, proveedor y validación de la respuesta.
 */
export async function handleCoachRequest({
  body,
  userId,
  client,
  now = new Date(),
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

  // El filtro de alcance decide antes que nada más, y el modelo no lo sustituye
  // (docs/12, principio 8).
  const decision = classifyMessage(message)

  if (decision.kind === 'out_of_scope') return outOfScope(decision.reason)
  if (decision.kind === 'unsupported') return unsupportedFeature(decision.feature)

  const resolveContext = () =>
    resolveCoachContext({
      client,
      userId,
      intent: decision.intent,
      currencyHint: decision.currencyHint,
      now,
    })

  if (!ai) return resolveContext()

  // `=== true` y no una comprobación de verdad: cualquier otro valor bloquea.
  // Una excepción del lector también, por si alguien lo sustituye por uno que
  // no cierre por sí mismo.
  const consent = await ai.hasConsent(client, userId).catch(() => false)
  if (consent !== true) return consentRequired()

  const context = await resolveContext()
  if (context.type !== 'coach_context_ready') return context

  const quota = await ai.consumeQuota(client, now)

  if (quota.kind === 'limited') return rateLimited(quota.retryAfterSeconds)
  if (quota.kind !== 'allowed') {
    return coachError('internal', 'No pude comprobar tu límite de consultas. Inténtalo de nuevo.')
  }

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
