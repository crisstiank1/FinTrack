-- Permisos de funciones: SOLO LECTURA.
--
-- No crea, modifica ni borra nada, así que sirve también para verificar el
-- proyecto remoto después de aplicar las migraciones
-- (docs/23-procedimiento-aplicacion-remota.md). Lanza una excepción, con el
-- detalle, ante cualquier desviación.
\set ON_ERROR_STOP on

do $$
declare
  -- Única lista autorizada de funciones `security definer` en public y quién
  -- puede ejecutarlas desde la API. Añadir una función definer obliga a
  -- revisarla y a actualizar esta lista y docs/22-auditoria-security-definer.md.
  c_expected constant jsonb := jsonb_build_object(
    'consume_ai_quota(integer)', jsonb_build_array('authenticated'),
    'handle_new_user()', jsonb_build_array(),
    'purge_ai_data(integer,integer)', jsonb_build_array()
  );
  v_fn record;
  v_found text[] := '{}';
  v_allowed jsonb;
  v_role text;
  v_can boolean;
  v_public boolean;
  v_errors text[] := '{}';
begin
  for v_fn in
    select p.oid,
           replace(p.oid::regprocedure::text, 'public.', '') as signature,
           p.proconfig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    -- Firma sin nombres de parámetro: `purge_ai_data(integer,integer)`.
    v_found := v_found || v_fn.signature;
    v_allowed := c_expected -> v_fn.signature;

    if v_allowed is null then
      v_errors := v_errors || format('función security definer no auditada: %s', v_fn.signature);
      continue;
    end if;

    -- EXECUTE concedido a PUBLIC (grantee 0 en el ACL).
    select exists (
      select 1 from aclexplode(coalesce((select proacl from pg_proc where oid = v_fn.oid), acldefault('f', (select proowner from pg_proc where oid = v_fn.oid))))
      where grantee = 0 and privilege_type = 'EXECUTE'
    ) into v_public;
    if v_public then
      v_errors := v_errors || format('%s: PUBLIC tiene EXECUTE', v_fn.signature);
    end if;

    foreach v_role in array array['anon', 'authenticated'] loop
      v_can := has_function_privilege(v_role, v_fn.oid, 'EXECUTE');
      if v_can <> (v_allowed ? v_role) then
        v_errors := v_errors || format('%s: %s %s EXECUTE', v_fn.signature, v_role,
          case when v_can then 'tiene' else 'no tiene' end);
      end if;
    end loop;

    if v_fn.proconfig is null or not ('search_path=""' = any (v_fn.proconfig)) then
      v_errors := v_errors || format('%s: search_path no es vacío (%s)', v_fn.signature,
        coalesce(array_to_string(v_fn.proconfig, ','), 'sin fijar'));
    end if;
  end loop;

  if (select count(*) from jsonb_object_keys(c_expected)) <> coalesce(array_length(v_found, 1), 0) then
    v_errors := v_errors || format('se esperaban %s funciones definer, hay %s: %s',
      (select count(*) from jsonb_object_keys(c_expected)), coalesce(array_length(v_found, 1), 0), v_found);
  end if;

  -- RPC `security invoker` expuestas: nunca a `anon`.
  foreach v_role in array array[
    'public.register_sheet_draft(uuid)',
    'public.project_recurring_templates(text)'
  ] loop
    if to_regprocedure(v_role) is null then
      v_errors := v_errors || format('falta la función %s', v_role);
    elsif has_function_privilege('anon', v_role::regprocedure, 'EXECUTE') then
      v_errors := v_errors || format('%s: anon tiene EXECUTE', v_role);
    elsif not has_function_privilege('authenticated', v_role::regprocedure, 'EXECUTE') then
      v_errors := v_errors || format('%s: authenticated no tiene EXECUTE', v_role);
    end if;
  end loop;

  if array_length(v_errors, 1) > 0 then
    raise exception E'Permisos de funciones incorrectos:\n  %', array_to_string(v_errors, E'\n  ');
  end if;

  raise notice 'Permisos de funciones correctos: % funciones security definer auditadas.', array_length(v_found, 1);
end;
$$;
