import type { CoachSupabaseClient } from './context'
import { handleCoachRequest } from './request'
import { coachError, httpStatusFor, type CoachResponse } from './responses'

/**
 * Capa HTTP de `finance-chat`: CORS, método, autenticación y serialización.
 *
 * Vive en `src/` y no dentro de `supabase/functions/` por una razón concreta:
 * que "sin cabecera `Authorization` responde 401" sea una prueba que corre con
 * el resto de la suite, y no una promesa del comentario de un archivo que solo
 * se ejecuta en producción. La Edge Function se queda con lo único que no se
 * puede probar aquí: leer variables de entorno y construir el cliente real.
 */

/**
 * Orígenes admitidos: el dominio de FinTrack y el servidor de desarrollo.
 *
 * Lista cerrada. Un `*` permitiría que cualquier página abierta en el navegador
 * del usuario gastara su cuota y leyera sus respuestas.
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  'https://fintrack.win',
  'https://www.fintrack.win',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

export interface CoachHttpDeps {
  /**
   * Construye el cliente de datos a partir de la cabecera `Authorization`.
   *
   * Es una dependencia y no un `import` para que la Edge Function decida cómo
   * se construye —clave anónima más la cabecera del usuario— y las pruebas
   * puedan pasar un doble sin levantar nada.
   */
  createClient: (authorization: string) => CoachSupabaseClient
  /** Inyectable para que las pruebas no dependan del reloj. */
  now?: Date
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age': '86400',
    // El origen concedido depende de quién pregunta, así que esta respuesta no
    // se puede cachear compartida entre orígenes distintos.
    Vary: 'Origin',
  }

  if (origin !== null && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

export function jsonResponse(response: CoachResponse, origin: string | null): Response {
  return new Response(JSON.stringify(response), {
    status: httpStatusFor(response),
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/**
 * Atiende una petición al Coach.
 *
 * El orden de las comprobaciones es el contrato de seguridad:
 *
 * 1. Método.
 * 2. Cabecera `Authorization` presente y con forma de `Bearer`.
 * 3. **Usuario válido según `auth.getUser()`**, que es la única fuente del
 *    `user_id`. Lo que venga en el cuerpo no se mira.
 * 4. Cuerpo JSON.
 * 5. Alcance y contexto, ya en `handleCoachRequest`.
 *
 * Sin sesión válida no se lee ni una fila, así que una petición anónima no
 * revela siquiera si un correo tiene datos.
 */
export async function handleCoachHttpRequest(
  request: Request,
  deps: CoachHttpDeps,
): Promise<Response> {
  const origin = request.headers.get('Origin')

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (request.method !== 'POST') {
    return jsonResponse(
      coachError('method_not_allowed', 'Usa POST para hablar con FinTrack Coach.'),
      origin,
    )
  }

  const authorization = request.headers.get('Authorization')

  if (authorization === null || !authorization.startsWith('Bearer ')) {
    return jsonResponse(
      coachError('unauthorized', 'Inicia sesión para usar FinTrack Coach.'),
      origin,
    )
  }

  const client = deps.createClient(authorization)
  const { data, error } = await client.auth.getUser()

  if (error || !data?.user) {
    return jsonResponse(coachError('unauthorized', 'Tu sesión no es válida o expiró.'), origin)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse(coachError('invalid_request', 'El cuerpo debe ser JSON válido.'), origin)
  }

  try {
    const response = await handleCoachRequest({
      body,
      // Del JWT validado, nunca del cuerpo.
      userId: data.user.id,
      client,
      now: deps.now,
    })

    return jsonResponse(response, origin)
  } catch {
    // Nunca se devuelve el detalle: un error de PostgREST puede nombrar tablas
    // y columnas. El diagnóstico va a los logs, no al cliente.
    return jsonResponse(coachError('internal', 'No pude procesar tu pregunta.'), origin)
  }
}
