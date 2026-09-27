-- Deny-by-default en la práctica: una función nueva creada por el mismo rol que
-- aplica las migraciones no es ejecutable por PUBLIC, anon ni authenticated
-- hasta que se le concede EXECUTE explícitamente. Solo local/CI: crea y borra
-- objetos.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create function public.zz_probe_default_privileges()
returns integer
language sql
security invoker
set search_path = ''
as $$ select 1 $$;

do $$
declare
  v_fn regprocedure := 'public.zz_probe_default_privileges()'::regprocedure;
begin
  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception 'deny-by-default: anon puede ejecutar una función nueva';
  end if;
  if has_function_privilege('authenticated', v_fn, 'EXECUTE') then
    raise exception 'deny-by-default: authenticated puede ejecutar una función nueva';
  end if;
  if exists (
    select 1
    from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = v_fn and a.grantee = 0 and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'deny-by-default: PUBLIC puede ejecutar una función nueva';
  end if;
end;
$$;

-- Una concesión explícita, como la de una RPC de usuario, sí funciona.
grant execute on function public.zz_probe_default_privileges() to authenticated;

set role authenticated;
select public.zz_probe_default_privileges();
reset role;

set role anon;
do $$
begin
  begin
    perform public.zz_probe_default_privileges();
  exception when insufficient_privilege then
    return;
  end;
  raise exception 'anon pudo ejecutar una función concedida solo a authenticated';
end;
$$;
reset role;

drop function public.zz_probe_default_privileges();
