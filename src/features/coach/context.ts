import type { SupabaseClient } from '@supabase/supabase-js'

import { sortCurrencyCodes } from '@/lib/currency'
import {
  formatMonthLabel,
  isoDateInTimeZone,
  monthKeyInTimeZone,
  monthRange,
  previousMonthKey,
} from '@/lib/dates'
import type { Database } from '@/types/database.types'

import {
  coachError,
  type CoachDataset,
  type CoachPeriodRange,
  type CoachResponse,
} from './responses'
import type { CoachIntent } from './scope'

/**
 * Cliente autenticado con el JWT del usuario.
 *
 * No es el cliente del navegador ni uno con `service_role`: lo construye la
 * Edge Function con la clave anónima y la cabecera `Authorization` de quien
 * pregunta. Todo lo que se lea aquí pasa por RLS exactamente igual que si lo
 * pidiera la aplicación, así que el aislamiento entre usuarios no depende de
 * que este archivo filtre bien.
 */
export type CoachSupabaseClient = SupabaseClient<Database>

export interface ResolveCoachContextInput {
  client: CoachSupabaseClient
  /** Siempre el del JWT validado. Nunca uno recibido en el cuerpo de la petición. */
  userId: string
  intent: CoachIntent
  /** Moneda nombrada en la pregunta, si la nombró. */
  currencyHint?: string | null
  /** Inyectable para que las pruebas no dependan del reloj. */
  now?: Date
}

const DATASETS_WITHOUT_BUDGETS: CoachDataset[] = [
  'period_summary',
  'spending_by_category',
  'category_delta',
  'cashflow_status',
]

/**
 * Resuelve período, moneda y datos disponibles para una pregunta ya admitida.
 *
 * Devuelve directamente la respuesta que corresponde: el contexto si todo está
 * claro, o una aclaración si falta decidir algo. Esa es la forma de que la
 * ambigüedad de moneda se resuelva **antes** de calcular nada, y no con un
 * total que mezcle divisas.
 *
 * Lee tres cosas y ninguna más: el perfil, las cuentas —sin su nombre— y
 * cuántos presupuestos hay. Ni una descripción de movimiento, ni un importe.
 */
export async function resolveCoachContext({
  client,
  userId,
  intent,
  currencyHint,
  now = new Date(),
}: ResolveCoachContextInput): Promise<CoachResponse> {
  const profile = await client
    .from('profiles')
    .select('timezone, currency_code')
    .eq('id', userId)
    .maybeSingle()

  if (profile.error) {
    return coachError('internal', 'No se pudo leer tu perfil para resolver el período.')
  }
  if (!profile.data) {
    return coachError('internal', 'Tu perfil todavía no está disponible.')
  }

  const timeZone = profile.data.timezone
  let monthKey: string
  let today: string

  try {
    monthKey = monthKeyInTimeZone(timeZone, now)
    today = isoDateInTimeZone(timeZone, now)
  } catch {
    // No se cae en UTC a propósito. Con una zona horaria corrupta no se sabe
    // qué significa "este mes", y contestar con el mes equivocado es peor que
    // no contestar: el usuario no tendría forma de notar el error.
    return coachError(
      'invalid_profile_timezone',
      'La zona horaria de tu perfil no es válida, así que no puedo saber a qué mes te refieres.',
    )
  }

  const accounts = await client.from('accounts').select('currency_code').eq('user_id', userId)

  if (accounts.error) {
    return coachError('internal', 'No se pudieron leer tus cuentas.')
  }

  const available = sortCurrencyCodes(
    accounts.data.map((account) => account.currency_code),
    profile.data.currency_code,
  )

  const currency = resolveCurrency(available, currencyHint ?? null)
  if (typeof currency !== 'string') return currency

  const period = buildPeriod(monthKey, today)
  const comparedTo = buildPeriod(previousMonthKey(monthKey), today)

  return {
    type: 'coach_context_ready',
    intent,
    currency,
    period,
    comparedTo,
    availableData: await resolveAvailableDatasets(client, userId),
  }
}

/**
 * Elige la moneda del análisis, o pide que la elijan.
 *
 * FinTrack no convierte divisas, así que una respuesta solo puede hablar de una
 * moneda. Cuando hay varias y la pregunta no nombra ninguna, **no se asume la
 * principal del perfil**: el usuario podría estar preguntando justo por la
 * otra, y una cifra que no sabe de qué moneda es resulta peor que una pregunta.
 */
function resolveCurrency(
  available: string[],
  hint: string | null,
):
  | string
  | {
      type: 'clarification'
      reason: 'currency_required' | 'currency_not_available' | 'no_accounts'
      message: string
      options?: string[]
    } {
  if (available.length === 0) {
    return {
      type: 'clarification',
      reason: 'no_accounts',
      message:
        'Todavía no tienes cuentas registradas en FinTrack, así que no hay movimientos que analizar. ' +
        '¿Quieres crear una cuenta para empezar?',
    }
  }

  if (hint !== null) {
    if (available.includes(hint)) return hint

    return {
      type: 'clarification',
      reason: 'currency_not_available',
      message: `No tienes cuentas en ${hint}. ¿Quieres revisar alguna de estas monedas?`,
      options: available,
    }
  }

  if (available.length === 1) return available[0]

  return {
    type: 'clarification',
    reason: 'currency_required',
    message: `Para no mezclar monedas analizo una a la vez. ¿Quieres revisar ${available.join(', ')}?`,
    options: available,
  }
}

function buildPeriod(monthKey: string, today: string): CoachPeriodRange {
  const { start, end } = monthRange(monthKey)

  return {
    monthKey,
    start,
    // Un mes en curso termina hoy, no el día 30. Las claves 'YYYY-MM-DD' se
    // comparan como texto: su orden lexicográfico coincide con el cronológico.
    end: today < end ? today : end,
    label: formatMonthLabel(monthKey),
  }
}

/**
 * Qué se puede calcular para este usuario.
 *
 * El estado de presupuestos solo aparece si hay alguno: ofrecerlo a quien nunca
 * ha creado uno llevaría a una respuesta sobre un vacío. Se pide con `head` y
 * `count`, así que vuelve un número y ni una fila.
 */
async function resolveAvailableDatasets(
  client: CoachSupabaseClient,
  userId: string,
): Promise<CoachDataset[]> {
  const budgets = await client
    .from('budgets')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (budgets.error || (budgets.count ?? 0) === 0) return DATASETS_WITHOUT_BUDGETS

  return [...DATASETS_WITHOUT_BUDGETS, 'budget_status']
}
