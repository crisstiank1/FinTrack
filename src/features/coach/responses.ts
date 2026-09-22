/**
 * Protocolo de respuesta de `finance-chat`.
 *
 * Es el contrato entre la Edge Function y la futura interfaz, y se define ahora
 * —antes de que exista ningún modelo— para que la Fase 3 solo tenga que
 * rellenar `financial_answer` sin renegociar la forma de todo lo demás.
 *
 * La regla que ordena todo: **el backend manda datos, no frases con cifras
 * dentro**. En `financial_answer`, las plantillas citan rutas del `snapshot`
 * (`{{categories.c1.amount}}`) y la interfaz las resuelve y las formatea con
 * `formatAmount`. Así, el día que un modelo redacte esas plantillas, no podrá
 * inventarse un importe: solo podrá señalar uno que ya existe.
 */

import type { CoachContextSnapshot } from './contracts'
import type { CoachIntent, OutOfScopeReason, UnsupportedFeature } from './scope'

/** Conjuntos de datos que el Coach puede resolver para un usuario y período. */
export type CoachDataset =
  'period_summary' | 'spending_by_category' | 'category_delta' | 'budget_status' | 'cashflow_status'

export interface CoachPeriodRange {
  /** 'YYYY-MM'. */
  monthKey: string
  /** Primer día del período, 'YYYY-MM-DD'. */
  start: string
  /**
   * Último día del período, 'YYYY-MM-DD'. En el mes en curso es **hoy en la
   * zona del usuario**, no el último día del mes: prometer un período que
   * todavía no ha terminado haría que "en septiembre gastaste…" se leyera como
   * un mes completo.
   */
  end: string
  /** 'septiembre 2026', ya formateado para que nadie construya fechas por su cuenta. */
  label: string
}

/**
 * Contexto resuelto y listo para que la Fase 3 pida una redacción.
 *
 * No lleva ni un importe: dice qué se puede calcular, para qué período y en qué
 * moneda. Los datos llegan cuando exista el serializador del snapshot.
 */
export interface CoachContextReady {
  type: 'coach_context_ready'
  intent: CoachIntent
  currency: string
  period: CoachPeriodRange
  comparedTo: CoachPeriodRange
  availableData: CoachDataset[]
}

/** Por qué no se puede responder todavía sin preguntar algo primero. */
export type ClarificationReason = 'currency_required' | 'currency_not_available' | 'no_accounts'

export interface CoachClarification {
  type: 'clarification'
  reason: ClarificationReason
  message: string
  /** Monedas entre las que elegir, cuando la duda es de moneda. */
  options?: string[]
}

export interface CoachOutOfScope {
  type: 'out_of_scope'
  reason: OutOfScopeReason
  message: string
}

export interface CoachUnsupportedFeature {
  type: 'unsupported_financial_feature'
  feature: UnsupportedFeature
  message: string
}

/**
 * Respuesta redactada. **Todavía no se emite**: la produce la Fase 3.
 *
 * `content` no contiene cifras, solo plantillas con referencias al `snapshot`.
 * `factReferences` son las rutas que la interfaz debe mostrar como datos
 * destacados. Una referencia que no exista en el snapshot invalida la respuesta
 * entera: es preferible un error visible a un número inventado.
 */
export interface CoachFinancialAnswer {
  type: 'financial_answer'
  intent: CoachIntent
  currency: string
  period: CoachPeriodRange
  snapshot: CoachContextSnapshot
  content: CoachAnswerContent
  /** Trazabilidad: qué prompt y qué modelo produjeron la redacción. */
  meta: { promptVersion: string; model: string }
}

/**
 * Contenido redactado, ya validado.
 *
 * Todo texto es una plantilla: puede citar `{{rutas}}` del `snapshot` y no
 * puede contener cifras propias. `factReferences` lo calcula el backend —las
 * rutas realmente citadas, sin repetir—, no el modelo.
 *
 * Los tres últimos campos se añadieron en la Fase 3. `financial_answer` no se
 * había emitido nunca, así que no rompen a ningún cliente.
 */
export interface CoachAnswerContent {
  titleTemplate: string
  summaryTemplate: string
  factReferences: string[]
  factTemplates: string[]
  recommendationTemplates: string[]
  assumptionTemplates: string[]
}

export type CoachErrorCode =
  | 'invalid_request'
  | 'unauthorized'
  | 'method_not_allowed'
  | 'rate_limited'
  | 'invalid_profile_timezone'
  /** El proveedor de IA no respondió, o respondió con un error. */
  | 'provider_error'
  /** El modelo respondió, pero su redacción no pasó la validación ni al reintentar. */
  | 'answer_rejected'
  | 'internal'

export interface CoachError {
  type: 'error'
  code: CoachErrorCode
  message: string
}

export type CoachResponse =
  | CoachContextReady
  | CoachClarification
  | CoachOutOfScope
  | CoachUnsupportedFeature
  | CoachFinancialAnswer
  | CoachError

/* -------------------------------------------------------------------------- */
/* Textos                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Un solo texto para todo lo que queda fuera del producto.
 *
 * Deliberadamente no explica **por qué** cada tema está bloqueado: detallar que
 * se reconoció un intento de inyección, por ejemplo, solo sirve para afinar el
 * siguiente. El motivo viaja en `reason`, que es para la aplicación.
 */
const OUT_OF_SCOPE_MESSAGE =
  'Puedo ayudarte con tus ingresos, gastos, presupuestos y flujo de caja registrados en FinTrack. ' +
  'No puedo responder sobre ese tema ni dar recomendaciones de inversión.'

/**
 * Textos de lo que FinTrack todavía no guarda.
 *
 * Son preguntas legítimas, así que la respuesta dice qué falta en vez de tratar
 * al usuario como si hubiera preguntado por el clima. Cada texto nombra el dato
 * ausente concreto, que es lo que convierte un "no puedo" en información útil.
 */
const UNSUPPORTED_MESSAGES: Record<UnsupportedFeature, string> = {
  debt_management:
    'Puedo analizar tus gastos, presupuestos e ingresos registrados. FinTrack todavía no registra ' +
    'saldo, tasa ni cuota mínima de deudas, así que no puedo calcular una prioridad de pago fiable.',
  savings_goals:
    'FinTrack registra aportes de ahorro planificados, pero todavía no tiene metas con monto ' +
    'objetivo y fecha. Por eso no puedo calcular cuánto necesitarías aportar cada mes.',
  emergency_fund:
    'Todavía no tengo una confirmación fiable de cuáles de tus gastos son esenciales. Puedo ' +
    'mostrarte tus categorías y presupuestos actuales, pero no calcular un fondo de emergencia ' +
    'personalizado.',
  currency_conversion:
    'FinTrack no convierte entre monedas ni usa tipos de cambio: cada cuenta mantiene la suya y ' +
    'los totales nunca se mezclan. Puedo analizar una moneda a la vez.',
}

export function outOfScope(reason: OutOfScopeReason): CoachOutOfScope {
  return { type: 'out_of_scope', reason, message: OUT_OF_SCOPE_MESSAGE }
}

export function unsupportedFeature(feature: UnsupportedFeature): CoachUnsupportedFeature {
  return {
    type: 'unsupported_financial_feature',
    feature,
    message: UNSUPPORTED_MESSAGES[feature],
  }
}

export function coachError(code: CoachErrorCode, message: string): CoachError {
  return { type: 'error', code, message }
}

/**
 * Código HTTP de cada respuesta.
 *
 * Todo lo que el backend respondió a conciencia —un rechazo de alcance, una
 * aclaración— vale 200: la petición se procesó correctamente y la respuesta es
 * la que es. Solo los errores llevan código de error, para que la interfaz no
 * tenga que distinguir "falló" de "contestó que no".
 */
export function httpStatusFor(response: CoachResponse): number {
  if (response.type !== 'error') return 200

  switch (response.code) {
    case 'unauthorized':
      return 401
    case 'invalid_request':
      return 400
    case 'method_not_allowed':
      return 405
    case 'rate_limited':
      return 429
    // Fallos de un servicio del que dependemos, no del nuestro ni de quien
    // pregunta: 502, para que la interfaz pueda ofrecer reintentar.
    case 'provider_error':
    case 'answer_rejected':
      return 502
    default:
      return 500
  }
}
