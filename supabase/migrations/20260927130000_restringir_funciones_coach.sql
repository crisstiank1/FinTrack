-- FinTrack Coach — Cierra EXECUTE en las funciones `security definer` del Coach
--
-- Defecto encontrado en 20260923120000: `purge_ai_data` y `consume_ai_quota`
-- solo hacían `revoke … from public`. En Supabase, los privilegios por defecto
-- del esquema public conceden EXECUTE **explícitamente** a `anon` y
-- `authenticated` al crear cada función, y un revoke a PUBLIC no retira esas
-- concesiones con nombre.
--
-- Consecuencia antes de esta migración: cualquier sesión —incluso sin iniciar
-- sesión— podía llamar a `purge_ai_data(0, 0)`, que es `security definer`, y
-- borrar los contadores de cuota y el historial del Coach de **todos** los
-- usuarios. Borrar los contadores anula el límite de uso.
--
-- Mismo patrón que `register_sheet_draft` y `project_recurring_templates`:
-- revocar con nombre y conceder solo lo necesario.
--
-- Comprobado con supabase/tests/db/30-coach-consent-and-purge.sql, que falla
-- sin esta migración.

revoke all on function public.purge_ai_data(integer, integer) from public, anon, authenticated;

-- La cuota la consume el usuario autenticado; `anon` no tiene `auth.uid()` y
-- la función ya lanzaba, pero no tiene por qué poder llamarla.
revoke all on function public.consume_ai_quota(integer) from public, anon;
grant execute on function public.consume_ai_quota(integer) to authenticated;

-- Reversión manual (no recomendada): volver a conceder EXECUTE reabre el
-- defecto descrito arriba.
