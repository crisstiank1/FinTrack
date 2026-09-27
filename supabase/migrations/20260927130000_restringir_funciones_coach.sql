-- FinTrack — Cierra EXECUTE y fija search_path en todas las funciones
-- `security definer`
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
-- Auditoría completa en docs/22-auditoria-security-definer.md. Las tres únicas
-- funciones `security definer` del esquema quedan así:
--
--   purge_ai_data      ningún rol de la API; solo administración / pg_cron
--   handle_new_user    ningún rol de la API; solo el trigger de auth.users
--   consume_ai_quota   solo `authenticated`; decide con auth.uid()
--
-- Además, las tres pasan a `search_path = ''`. Ya tenían un search_path fijo
-- (`public`) y todas sus referencias están calificadas, así que el cambio no
-- altera el comportamiento; elimina cualquier resolución de nombres implícita
-- en código que corre con los privilegios del propietario.
--
-- Solo cambia permisos y configuración de funciones: no toca datos ni tablas.
-- Comprobado con supabase/tests/db/30-coach-consent-and-purge.sql y
-- 40-function-privileges.sql, que fallan sin esta migración.

-- ---------------------------------------------------------------------------
-- purge_ai_data: borra datos de todos los usuarios. Nadie de la API.
-- ---------------------------------------------------------------------------
revoke all on function public.purge_ai_data(integer, integer) from public, anon, authenticated;
alter function public.purge_ai_data(integer, integer) set search_path = '';

-- ---------------------------------------------------------------------------
-- handle_new_user: función de trigger. PostgreSQL comprueba EXECUTE al crear
-- el trigger, no al dispararlo, así que revocar no afecta al alta de usuarios
-- (lo prueba 40-function-privileges.sql con un rol sin privilegios).
-- ---------------------------------------------------------------------------
revoke all on function public.handle_new_user() from public, anon, authenticated;
alter function public.handle_new_user() set search_path = '';

-- ---------------------------------------------------------------------------
-- consume_ai_quota: la invoca la Edge Function con el JWT del usuario. Solo
-- `authenticated`; `anon` no tiene auth.uid() y la función ya lanzaba.
-- ---------------------------------------------------------------------------
revoke all on function public.consume_ai_quota(integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(integer) to authenticated;
alter function public.consume_ai_quota(integer) set search_path = '';

-- Reversión manual (no recomendada: reabre el defecto descrito arriba):
--
-- grant execute on function public.purge_ai_data(integer, integer) to anon, authenticated;
-- grant execute on function public.handle_new_user() to anon, authenticated;
-- grant execute on function public.consume_ai_quota(integer) to anon;
-- alter function public.purge_ai_data(integer, integer) set search_path = public;
-- alter function public.handle_new_user() set search_path = public;
-- alter function public.consume_ai_quota(integer) set search_path = public;
