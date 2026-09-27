-- FinTrack — Permisos de funciones: deny-by-default
--
-- 1. Corrige un defecto crítico de 20260923120000.
-- 2. Deja todas las funciones existentes de `public` con EXECUTE mínimo y
--    `search_path = ''`.
-- 3. Cierra por defecto las funciones que se creen en el futuro.
--
-- Auditoría completa y reglas para funciones nuevas:
-- docs/22-auditoria-security-definer.md. Verificación (solo lectura, también
-- en remoto): supabase/tests/db/40-function-privileges.sql.
--
-- Solo cambia permisos y configuración de funciones: no toca datos ni tablas.
--
-- ---------------------------------------------------------------------------
-- El defecto
-- ---------------------------------------------------------------------------
-- `purge_ai_data` y `consume_ai_quota` solo hacían `revoke … from public`. En
-- Supabase, los privilegios por defecto del esquema public conceden EXECUTE
-- **con nombre** a `anon` y `authenticated` sobre cada función nueva, y un
-- revoke a PUBLIC no retira esas concesiones. Cualquier sesión, incluso sin
-- iniciar sesión, podía llamar a `purge_ai_data(0, 0)` —`security definer`— y
-- borrar los contadores de cuota y el historial del Coach de todos los
-- usuarios, anulando además el límite de uso.

-- ===========================================================================
-- A. Funciones `security definer`
-- ===========================================================================

-- purge_ai_data: borra datos de todos los usuarios. Ningún rol de la API.
revoke all on function public.purge_ai_data(integer, integer) from public, anon, authenticated;
alter function public.purge_ai_data(integer, integer) set search_path = '';

-- handle_new_user: trigger de auth.users. PostgreSQL comprueba EXECUTE al
-- crear el trigger, no al dispararlo; el alta sigue funcionando
-- (41-handle-new-user-trigger.sql). Ningún rol de la API.
revoke all on function public.handle_new_user() from public, anon, authenticated;
alter function public.handle_new_user() set search_path = '';

-- consume_ai_quota: la invoca finance-chat con el JWT del usuario y decide con
-- auth.uid(). Solo `authenticated`.
revoke all on function public.consume_ai_quota(integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(integer) to authenticated;
alter function public.consume_ai_quota(integer) set search_path = '';

-- ===========================================================================
-- B. RPC `security invoker`: solo `authenticated` (ya lo estaban; se repite
--    para que esta migración sea la referencia completa)
-- ===========================================================================

revoke all on function public.register_sheet_draft(uuid) from public, anon, authenticated;
grant execute on function public.register_sheet_draft(uuid) to authenticated;

revoke all on function public.project_recurring_templates(text) from public, anon, authenticated;
grant execute on function public.project_recurring_templates(text) to authenticated;

-- ===========================================================================
-- C. Funciones de trigger `security invoker`: ningún rol de la API
-- ===========================================================================
-- No se pueden invocar fuera de un trigger y el trigger no comprueba EXECUTE
-- al dispararse, así que no necesitan concesiones. Se revocan para que no
-- quede ninguna función de `public` abierta a `anon`.

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.validate_transaction() from public, anon, authenticated;
revoke all on function public.validate_budget() from public, anon, authenticated;
revoke all on function public.validate_category_classification() from public, anon, authenticated;
revoke all on function public.validate_income_source_category() from public, anon, authenticated;
revoke all on function public.validate_plan_line() from public, anon, authenticated;
revoke all on function public.check_plan_allocations_sum() from public, anon, authenticated;
revoke all on function public.validate_recurring_template() from public, anon, authenticated;
revoke all on function public.clear_draft_generated_month() from public, anon, authenticated;

-- Las dos únicas sin search_path fijo. Sus referencias ya están calificadas
-- (`public.accounts`, `public.categories`; `now()` es de pg_catalog).
alter function public.set_updated_at() set search_path = '';
alter function public.validate_transaction() set search_path = '';

-- ===========================================================================
-- D. Deny-by-default para funciones futuras
-- ===========================================================================
--
-- ALTER DEFAULT PRIVILEGES solo afecta a objetos que cree el rol indicado. No
-- se asume cuál es: el repositorio no lo fija y la CLI de Supabase aplica las
-- migraciones con su propio rol de sesión. Se configura para:
--
--   - `current_user`: el rol que ejecuta esta migración, que es el que creará
--     las funciones de las migraciones siguientes aplicadas del mismo modo; y
--   - el propietario real de las funciones existentes (el de `purge_ai_data`),
--     si es otro rol.
--
-- Dos niveles, porque PostgreSQL los combina:
--
--   - Global (sin IN SCHEMA): quita el EXECUTE que PostgreSQL concede a
--     PUBLIC por defecto. Un revoke por esquema no puede quitar un permiso
--     concedido globalmente.
--   - Esquema public: quita las concesiones con nombre a anon y authenticated
--     que añade Supabase. Se revoca también a nivel global por si existieran
--     ahí.
--
-- `service_role` conserva sus concesiones: es un rol de servidor que ya
-- ignora RLS y nunca se usa desde el navegador.
--
-- Si no se puede configurar para el propietario (por falta de pertenencia al
-- rol), se avisa y la migración sigue: los revokes de arriba son lo urgente, y
-- 40-function-privileges.sql fallará en la verificación posterior, que es
-- obligatoria (docs/23-procedimiento-aplicacion-remota.md).

do $$
declare
  v_owner name := (
    select pg_get_userbyid(p.proowner)
    from pg_proc p
    where p.oid = 'public.purge_ai_data(integer, integer)'::regprocedure
  );
  v_role name;
begin
  foreach v_role in array array(select distinct r from unnest(array[current_user::name, v_owner]) r) loop
    begin
      execute format(
        'alter default privileges for role %I revoke execute on functions from public, anon, authenticated',
        v_role
      );
      execute format(
        'alter default privileges for role %I in schema public revoke execute on functions from public, anon, authenticated',
        v_role
      );
      raise notice 'deny-by-default configurado para funciones creadas por %', v_role;
    exception when insufficient_privilege then
      raise warning 'No se pudo configurar deny-by-default para %: %. Verificar con 40-function-privileges.sql.',
        v_role, sqlerrm;
    end;
  end loop;
end;
$$;

-- ===========================================================================
-- Reglas para toda función nueva a partir de esta migración
-- ===========================================================================
-- Cada `create function` en `public` debe declarar explícitamente:
--
--   security definer | security invoker     y por qué (comentario)
--   set search_path = ''                    con todas las referencias calificadas
--   revoke all on function … from public, anon, authenticated;
--   grant execute on function … to authenticated;   solo si es una RPC de usuario
--
-- y añadirse, con sus roles esperados, a 40-function-privileges.sql y a
-- docs/22-auditoria-security-definer.md. Abrir una función a `anon` exige
-- justificación explícita, revisión de seguridad y una prueba específica.

-- ===========================================================================
-- Reversión manual (no recomendada: reabre el defecto)
-- ===========================================================================
-- grant execute on function public.purge_ai_data(integer, integer) to anon, authenticated;
-- alter default privileges for role <ROL> in schema public
--   grant execute on functions to anon, authenticated;
-- alter default privileges for role <ROL> grant execute on functions to public;
