/**
 * finance-chat — frontera segura de FinTrack Coach.
 *
 * Este archivo es deliberadamente corto. Todo lo que se puede probar —CORS,
 * método, autenticación, alcance, período, moneda— vive en
 * `src/features/coach/` y corre con la suite del proyecto. Aquí queda lo único
 * que no se puede: leer las variables de entorno del runtime y construir el
 * cliente de datos real.
 *
 * Tres garantías que dependen de esta función:
 *
 * 1. **El cliente lleva el JWT del usuario.** Se construye con la clave anónima
 *    y la cabecera `Authorization` de quien pregunta, así que RLS aplica igual
 *    que en el navegador. No se usa `service_role` en ninguna parte.
 * 2. **El `user_id` sale de `auth.getUser()`**, nunca del cuerpo de la petición.
 * 3. **No hay proveedor de IA.** La Fase 2 no llama a ningún modelo ni guarda
 *    ninguna clave: si una cifra sale mal, el fallo está en los datos o en la
 *    lógica, no escondido detrás de un modelo.
 */

import { createClient } from '@supabase/supabase-js'

import { handleCoachHttpRequest, jsonResponse } from '@/features/coach/http'
import { coachError } from '@/features/coach/responses'

Deno.serve(async (request: Request): Promise<Response> => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  // Clave pública del proyecto, la misma que usa el navegador. Nunca
  // SUPABASE_SERVICE_ROLE_KEY: saltarse RLS aquí convertiría cualquier fallo de
  // filtrado en una fuga entre usuarios.
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
  })
})
