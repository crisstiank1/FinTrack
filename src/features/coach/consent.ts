import type { CoachSupabaseClient } from './context'

/**
 * ¿Autorizó este usuario que sus datos agregados se envíen a un proveedor de IA?
 *
 * Es una dependencia y no una consulta escrita en `request.ts` para que las
 * pruebas puedan sustituirla y comprobar el orden de las barreras sin montar
 * una base de datos.
 *
 * El contrato es estricto: **solo `true` abre la ruta**. `request.ts` compara con
 * `=== true`, así que un valor que no sea exactamente ese —`undefined`, un
 * objeto, una promesa rechazada— bloquea igual que un `false`.
 */
export type ConsentCheck = (client: CoachSupabaseClient, userId: string) => Promise<boolean>

/** Columnas del consentimiento en `profiles` (migración `20260923120000`). */
export interface ConsentColumns {
  ai_consent_at: string | null
  ai_consent_version: string | null
}

/**
 * ¿La fila del perfil registra un consentimiento explícito?
 *
 * El esquema guarda el consentimiento como fecha y versión del texto aceptado,
 * no como un booleano: sin versión no se sabría qué aceptó el usuario. Por eso
 * "consentimiento explícito" es que **las dos** estén presentes y no vacías. La
 * restricción `profiles_ai_consent_pair_check` ya impide que vaya una sin la
 * otra; aquí se comprueban las dos igualmente, para que la decisión no dependa
 * de que esa restricción siga existiendo.
 *
 * Todo lo demás —fila ausente, `null`, cadena vacía, un tipo inesperado— es
 * **no**.
 */
export function hasExplicitConsent(row: Partial<ConsentColumns> | null | undefined): boolean {
  if (!row) return false

  const at = row.ai_consent_at
  const version = row.ai_consent_version

  return (
    typeof at === 'string' &&
    at.trim() !== '' &&
    typeof version === 'string' &&
    version.trim() !== ''
  )
}

/**
 * Consentimiento real, leído de `profiles` con el cliente del usuario.
 *
 * Lee dos columnas y ninguna más, filtrando por el `userId` del JWT; RLS limita
 * además la consulta a la propia fila. **Cualquier fallo cierra**: un error de
 * PostgREST, un perfil que no existe o una excepción del cliente responden
 * `false`. Ante la duda no se envía nada a un tercero.
 */
export const readAIConsent: ConsentCheck = async (client, userId) => {
  try {
    const { data, error } = await client
      .from('profiles')
      .select('ai_consent_at, ai_consent_version')
      .eq('id', userId)
      .maybeSingle()

    if (error) return false
    return hasExplicitConsent(data)
  } catch {
    return false
  }
}
