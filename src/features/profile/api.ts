import { supabase } from '@/lib/supabase'

/**
 * Moneda principal del perfil (`profiles.currency_code`), elegida en el
 * onboarding. Es la moneda en la que se presentan los totales cuando el
 * usuario tiene cuentas en varias monedas.
 */
export async function fetchPrimaryCurrency(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('currency_code')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data.currency_code
}

/**
 * Cambia la moneda principal del perfil desde Ajustes (M12).
 *
 * Solo toca `profiles.currency_code`: las cuentas conservan su moneda, por
 * diseño —FinTrack no convierte divisas—. Qué entra en el total de cada
 * pantalla lo decide entonces `resolvePresentationCurrency`, y qué opciones
 * son válidas ya lo limita `primaryCurrencySchema`.
 */
export async function updatePrimaryCurrency(userId: string, currencyCode: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ currency_code: currencyCode })
    .eq('id', userId)

  if (error) throw error
}
