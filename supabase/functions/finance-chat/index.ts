/**
 * finance-chat — frontera segura de FinTrack Coach.
 *
 * Este archivo es deliberadamente corto. Todo lo que se puede probar —CORS,
 * método, autenticación, alcance, período, moneda, snapshot, validación de la
 * respuesta— vive en `src/features/coach/` y corre con la suite del proyecto.
 * Aquí queda lo único que no se puede: leer las variables de entorno del
 * runtime y construir los clientes reales.
 *
 * Garantías que dependen de esta función:
 *
 * 1. **El cliente de datos lleva el JWT del usuario.** Se construye con la clave
 *    anónima y la cabecera `Authorization` de quien pregunta, así que RLS aplica
 *    igual que en el navegador. No se usa `service_role` en ninguna parte.
 * 2. **El `user_id` sale de `auth.getUser()`**, nunca del cuerpo de la petición.
 * 3. **Sin consentimiento no sale nada hacia el proveedor.** Hasta que exista la
 *    columna de consentimiento, `consentNotYetAvailable` responde que no para
 *    todos: aunque los secretos del proveedor estén configurados, la función
 *    sigue devolviendo solo el contexto resuelto.
 * 4. **La clave del proveedor solo existe aquí**, leída de los secretos de
 *    Supabase. Ningún módulo de `src/` la conoce ni la lee del entorno.
 */

import { createClient } from '@supabase/supabase-js'

import { consentNotYetAvailable } from '@/features/coach/consent'
import { handleCoachHttpRequest, jsonResponse } from '@/features/coach/http'
import { createOpenAICompatibleProvider } from '@/features/coach/llm/openai-compatible'
import type { CoachAI } from '@/features/coach/request'
import { coachError } from '@/features/coach/responses'

/**
 * Proveedor de IA desde los secretos, o `undefined` si falta alguno.
 *
 * Los tres son obligatorios a la vez: una configuración a medias no debe
 * producir llamadas a medias. `COACH_LLM_PROVIDER` es solo un nombre para la
 * trazabilidad, no elige código: NVIDIA NIM y Groq usan el mismo adaptador.
 */
function readAI(): CoachAI | undefined {
  const baseUrl = Deno.env.get('COACH_LLM_BASE_URL')
  const model = Deno.env.get('COACH_LLM_MODEL')
  const apiKey = Deno.env.get('COACH_LLM_API_KEY')

  if (!baseUrl || !model || !apiKey) return undefined

  return {
    provider: createOpenAICompatibleProvider({
      name: Deno.env.get('COACH_LLM_PROVIDER') ?? 'openai-compatible',
      baseUrl,
      model,
      apiKey,
    }),
    hasConsent: consentNotYetAvailable,
  }
}

Deno.serve(async (request: Request): Promise<Response> => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  // Clave pública del proyecto, la misma que usa el navegador. Nunca la de
  // servicio: saltarse RLS aquí convertiría cualquier fallo de filtrado en una
  // fuga entre usuarios.
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')

  if (!supabaseUrl || !anonKey) {
    return jsonResponse(
      coachError('internal', 'El servicio no está configurado.'),
      request.headers.get('Origin'),
    )
  }

  return handleCoachHttpRequest(request, {
    createClient: (authorization) =>
      createClient(supabaseUrl, anonKey, {
        // La cabecera del usuario viaja en cada consulta: es lo que hace que
        // las políticas vean `auth.uid()` y no una conexión privilegiada.
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    ai: readAI(),
  })
})
