import {
  CURRENT_AI_CONSENT_VERSION,
  hasExplicitConsent,
  type ConsentColumns,
} from '@/features/coach/consent'
import { supabase } from '@/lib/supabase'

export type CoachConsentState =
  | { status: 'granted'; at: string; version: string }
  /** Aceptó una versión anterior de la política: hay que volver a pedirlo. */
  | { status: 'outdated'; at: string; version: string }
  | { status: 'none' }

/** Misma regla que valida `finance-chat`: `hasExplicitConsent`. */
export function consentState(row: Partial<ConsentColumns> | null): CoachConsentState {
  if (hasExplicitConsent(row)) {
    return { status: 'granted', at: row!.ai_consent_at!, version: row!.ai_consent_version! }
  }
  if (row?.ai_consent_at && row.ai_consent_version) {
    return { status: 'outdated', at: row.ai_consent_at, version: row.ai_consent_version }
  }
  return { status: 'none' }
}

export async function fetchCoachConsent(userId: string): Promise<CoachConsentState> {
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_consent_at, ai_consent_version')
    .eq('id', userId)
    .single()
  if (error) throw error
  return consentState(data)
}

/**
 * Registra el consentimiento con la versión vigente de la política. Fecha y
 * versión van juntas: la restricción `profiles_ai_consent_pair_check` no admite
 * una sin la otra.
 */
export async function grantCoachConsent(userId: string, now: Date = new Date()): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ai_consent_at: now.toISOString(), ai_consent_version: CURRENT_AI_CONSENT_VERSION })
    .eq('id', userId)
  if (error) throw error
}

/** Revocar es poner las dos columnas a `null`; desde ese momento la ruta de IA queda cerrada. */
export async function revokeCoachConsent(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ai_consent_at: null, ai_consent_version: null })
    .eq('id', userId)
  if (error) throw error
}
