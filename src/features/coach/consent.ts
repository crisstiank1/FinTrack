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
 * Versión vigente del texto de consentimiento del Coach.
 *
 * Es la fecha de la política de privacidad que el usuario acepta (`/privacy`).
 * Cambiar el texto obliga a cambiar este valor, y un consentimiento guardado
 * con una versión anterior deja de valer: el usuario tiene que volver a
 * aceptarlo, porque aceptó algo distinto de lo que hoy se hace con sus datos.
 */
export const CURRENT_AI_CONSENT_VERSION = '2026-09-27'

/**
 * ¿La fila del perfil registra un consentimiento explícito y vigente?
 *
 * El esquema guarda el consentimiento como fecha y versión del texto aceptado,
 * no como un booleano. Solo cuenta si:
 *
 * - `ai_consent_at` es una fecha no vacía, y
 * - `ai_consent_version` coincide **exactamente** con la versión vigente.
 *
 * Revocar es poner las dos columnas a `null` (no hay columna de revocación
 * aparte), así que una revocación cae en el primer punto. Todo lo demás —fila
 * ausente, `null`, cadena vacía, una versión antigua, un tipo inesperado— es
 * **no**.
 */
export function hasExplicitConsent(
  row: Partial<ConsentColumns> | null | undefined,
  currentVersion: string = CURRENT_AI_CONSENT_VERSION,
): boolean {
  if (!row) return false

  const at = row.ai_consent_at
  const version = row.ai_consent_version

  return (
    typeof at === 'string' &&
    at.trim() !== '' &&
    !Number.isNaN(Date.parse(at)) &&
    typeof version === 'string' &&
    version === currentVersion
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
