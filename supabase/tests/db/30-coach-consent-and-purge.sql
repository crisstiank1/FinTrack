-- Consentimiento del Coach sobre profiles y purga de datos del Coach.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema t;
grant usage on schema t to authenticated, anon;

create function t.claims(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false)
$$;
grant execute on function t.claims(uuid) to authenticated, anon;

create function t.expect_error(p_sql text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'Se esperaba un error: %', p_label;
end;
$$;
grant execute on function t.expect_error(text, text) to authenticated, anon;

create function t.eq(p_actual anyelement, p_expected anyelement, p_label text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '%: se esperaba %, llegó %', p_label, p_expected, p_actual;
  end if;
end;
$$;
grant execute on function t.eq(anyelement, anyelement, text) to authenticated, anon;

insert into auth.users (id) values
  ('dddddddd-0000-4000-8000-000000000004'),
  ('eeeeeeee-0000-4000-8000-000000000005');

-- ---------------------------------------------------------------------------
-- 1. Consentimiento: el usuario lo da y lo retira en su perfil; no en el ajeno
-- ---------------------------------------------------------------------------

select t.claims('dddddddd-0000-4000-8000-000000000004');
set role authenticated;

do $$
declare
  v_rows integer;
begin
  update public.profiles
  set ai_consent_at = now(), ai_consent_version = '2026-09-27'
  where id = 'dddddddd-0000-4000-8000-000000000004';
  get diagnostics v_rows = row_count;
  perform t.eq(v_rows, 1, 'concede en su perfil');

  -- Fecha sin versión (o al revés): la restricción lo impide.
  perform t.expect_error($q$
    update public.profiles set ai_consent_version = null
    where id = 'dddddddd-0000-4000-8000-000000000004'
  $q$, 'versión sin fecha');

  -- El perfil de otro usuario no se ve ni se modifica.
  update public.profiles
  set ai_consent_at = now(), ai_consent_version = '2026-09-27'
  where id = 'eeeeeeee-0000-4000-8000-000000000005';
  get diagnostics v_rows = row_count;
  perform t.eq(v_rows, 0, 'no concede por otro usuario');

  update public.profiles
  set ai_consent_at = null, ai_consent_version = null
  where id = 'dddddddd-0000-4000-8000-000000000004';
  get diagnostics v_rows = row_count;
  perform t.eq(v_rows, 1, 'revoca');
end;
$$;

reset role;

do $$
begin
  perform t.eq(
    (select ai_consent_at from public.profiles where id = 'eeeeeeee-0000-4000-8000-000000000005'),
    null::timestamptz,
    'el otro perfil sigue sin consentimiento'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Purga: borra solo lo vencido y no la puede ejecutar un usuario
-- ---------------------------------------------------------------------------

insert into public.ai_usage_counters (user_id, window_start, message_count) values
  ('dddddddd-0000-4000-8000-000000000004', date_trunc('hour', now()) - interval '8 days', 3),
  ('dddddddd-0000-4000-8000-000000000004', date_trunc('hour', now()) - interval '1 day', 2);

insert into public.ai_conversations (id, user_id, updated_at) values
  ('f1000000-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', now() - interval '100 days'),
  ('f2000000-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', now());

insert into public.ai_messages (conversation_id, user_id, role, content, created_at) values
  ('f1000000-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'user', 'viejo', now() - interval '100 days'),
  ('f2000000-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'user', 'reciente', now());

select t.claims('dddddddd-0000-4000-8000-000000000004');
set role authenticated;
do $$
begin
  perform t.expect_error($q$ select * from public.purge_ai_data(0, 0) $q$, 'usuario ejecuta la purga');
end;
$$;
reset role;

select set_config('request.jwt.claims', '', false);
set role anon;
do $$
begin
  perform t.expect_error($q$ select * from public.purge_ai_data(0, 0) $q$, 'anon ejecuta la purga');
  perform t.expect_error($q$ select public.consume_ai_quota(15) $q$, 'anon consume cuota');
end;
$$;
reset role;

do $$
declare
  v record;
begin
  select * into v from public.purge_ai_data();
  perform t.eq(v.mensajes, 1, 'mensajes purgados');
  perform t.eq(v.conversaciones, 1, 'conversaciones vacías purgadas');
  perform t.eq(v.contadores, 1, 'contadores purgados');

  perform t.eq((select count(*)::integer from public.ai_messages), 1, 'queda el mensaje reciente');
  perform t.eq((select count(*)::integer from public.ai_conversations), 1, 'queda la conversación reciente');
  perform t.eq((select count(*)::integer from public.ai_usage_counters), 1, 'queda el contador reciente');

  -- Segunda ejecución: nada que borrar.
  select * into v from public.purge_ai_data();
  perform t.eq(v.mensajes + v.conversaciones + v.contadores, 0, 'purga idempotente');
end;
$$;

drop schema t cascade;
