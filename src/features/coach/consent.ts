import type { CoachSupabaseClient } from './context'

/**
 * ¿Autorizó este usuario que sus datos agregados se envíen a un proveedor de IA?
 *
 * Es una dependencia y no una consulta escrita aquí porque la columna todavía
 * no existe: el consentimiento va en `profiles` y llega con su propia migración,
 * junto a la cuota persistente y el historial (`docs/14-coach-fase-2.md`).
 */
export type ConsentCheck = (client: CoachSupabaseClient, userId: string) => Promise<boolean>

/**
 * Consentimiento mientras no exista la columna: **nadie lo ha dado**.
 *
 * Es lo que usa la Edge Function hoy, y es lo que hace que la ruta de IA sea
 * inalcanzable en producción aunque el proveedor esté configurado. No es un
 * `true` provisional para probar: probar la ruta es trabajo de las pruebas, con
 * un proveedor falso, y de la evaluación, con datos sintéticos. Un usuario real
 * no envía nada a un tercero hasta que pueda decir que sí.
 */
export const consentNotYetAvailable: ConsentCheck = async () => false
