/**
 * Supabase Auth responde en inglés («Invalid login credentials»). La interfaz
 * es en español, así que se traduce por código de error; lo desconocido cae en
 * un mensaje genérico en vez de mostrar el texto crudo del servidor.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'El correo o la contraseña no son correctos.',
  email_not_confirmed:
    'Confirma tu correo desde el enlace que te enviamos antes de iniciar sesión.',
  user_already_exists:
    'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.',
  email_exists: 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.',
  weak_password: 'La contraseña es demasiado débil. Usa una más larga y difícil de adivinar.',
  same_password: 'La nueva contraseña debe ser distinta de la actual.',
  email_address_invalid: 'Revisa el correo: no parece una dirección válida.',
  signup_disabled: 'El registro de cuentas nuevas no está disponible en este momento.',
  over_request_rate_limit:
    'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.',
  over_email_send_rate_limit:
    'Ya enviamos varios correos. Espera unos minutos antes de pedir otro.',
}

const FALLBACK = 'Inténtalo de nuevo en unos minutos. Si el problema sigue, revisa tu conexión.'

export function authErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : ''
  return MESSAGES[code] ?? FALLBACK
}
