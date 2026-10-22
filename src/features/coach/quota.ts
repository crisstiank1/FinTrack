import type { CoachSupabaseClient } from './context'

/**
 * Cuota persistente de FinTrack Coach.
 *
 * El contador vive en `public.ai_usage_counters` y **solo** se escribe con
 * `public.consume_ai_quota`, una función `security definer` que incrementa y
 * decide en una sola sentencia (`insert … on conflict do update … where
 * message_count < p_limit`). Este módulo no lee el contador ni intenta decidir
 * nada por su cuenta: leer y luego escribir en dos pasos es justo la carrera
 * que la función evita, porque dos peticiones simultáneas leerían el mismo
 * valor y pasarían las dos.
 */

/**
 * Consultas al proveedor por usuario y hora.
 *
 * El valor acordado en `docs/14-coach-fase-2.md`. La ventana es fija por hora
 * (`date_trunc('hour', now())` en la migración), así que en el cambio de hora
 * caben hasta el doble en ráfaga: es un límite de coste, no de abuso fino.
 */
export const COACH_HOURLY_LIMIT = 15

/** Duración de la ventana de la migración, en segundos. */
const WINDOW_SECONDS = 3600

export type QuotaDecision =
  | { kind: 'allowed'; used: number }
  | { kind: 'limited'; retryAfterSeconds: number }
  /** No se pudo consultar la cuota. Se trata como denegada: sin cuota comprobada no hay llamada. */
  | { kind: 'unavailable' }

export type QuotaConsumer = (client: CoachSupabaseClient, now: Date) => Promise<QuotaDecision>

/**
 * Segundos hasta que empiece la siguiente ventana.
 *
 * La base de datos no devuelve cuándo se renueva la cuota, pero la ventana está
 * definida en la migración y no depende del usuario: empieza en cada hora en
 * punto. En Supabase la sesión de PostgreSQL está en UTC y todas las horas en
 * punto UTC lo son también en la zona del servidor, así que el cálculo es el
 * mismo que haría la base de datos. Nunca devuelve 0: un "reintenta en 0 s"
 * invitaría a un bucle.
 */
export function secondsUntilNextWindow(now: Date): number {
  const elapsed = Math.floor(now.getTime() / 1000) % WINDOW_SECONDS
  return Math.max(1, WINDOW_SECONDS - elapsed)
}

/**
 * Consume una unidad de la cuota del usuario del JWT.
 *
 * El usuario no se pasa: la función SQL lo toma de `auth.uid()`, es decir, del
 * mismo JWT con el que se construyó el cliente. No hay parámetro por el que un
 * cliente pudiera gastar, o ahorrarse, la cuota de otro.
 *
 * - Un número: la unidad se consumió; es el total de la ventana.
 * - `null`: la ventana ya estaba en el límite y no se consumió nada.
 * - Error o excepción: `unavailable`. **Cierra**: sin una respuesta clara de la
 *   base de datos no se llama al proveedor.
 */
export function createQuotaConsumer(limit: number = COACH_HOURLY_LIMIT): QuotaConsumer {
  return async (client, now) => {
    try {
      const { data, error } = await client.rpc('consume_ai_quota', { p_limit: limit })

      if (error) return { kind: 'unavailable' }
      if (data === null) return { kind: 'limited', retryAfterSeconds: secondsUntilNextWindow(now) }
      if (typeof data === 'number' && Number.isInteger(data) && data > 0) {
        return { kind: 'allowed', used: data }
      }

      return { kind: 'unavailable' }
    } catch {
      return { kind: 'unavailable' }
    }
  }
}

export const consumeAIQuota: QuotaConsumer = createQuotaConsumer()
