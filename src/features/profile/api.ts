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
