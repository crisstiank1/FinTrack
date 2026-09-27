/**
 * Qué identificadores de modelo puede usar el Coach en producción.
 *
 * Es una lista de exclusión sobre el nombre, comprobada al arrancar la Edge
 * Function: si el secreto `COACH_LLM_MODEL` nombra un modelo no admitido, no se
 * construye proveedor y la ruta queda inerte, igual que sin secretos. Así un
 * error de configuración no acaba enviando datos a un modelo experimental.
 *
 * - `preview`, `exp` y `experimental`: sin garantías de estabilidad ni de
 *   condiciones de uso de datos.
 * - `latest`: un alias que cambia de modelo sin aviso; lo evaluado dejaría de
 *   ser lo desplegado.
 * - Imagen, audio, TTS y Live: no producen el JSON de texto que valida el
 *   Coach.
 */
const DISALLOWED_PATTERNS: readonly RegExp[] = [
  /preview/i,
  /(^|[-_.])exp(erimental)?($|[-_.\d])/i,
  /latest/i,
  /image/i,
  /imagen/i,
  /audio/i,
  /tts/i,
  /(^|[-_.])live($|[-_.])/i,
  /native-audio/i,
]

export function isAllowedCoachModel(model: string): boolean {
  const trimmed = model.trim()
  if (trimmed === '' || trimmed !== model) return false
  return !DISALLOWED_PATTERNS.some((pattern) => pattern.test(trimmed))
}
