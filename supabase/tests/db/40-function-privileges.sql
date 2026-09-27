-- Permisos de funciones: SOLO LECTURA.
--
-- No crea, modifica ni borra nada, así que sirve también para verificar el
-- proyecto remoto después de aplicar las migraciones
-- (docs/23-procedimiento-aplicacion-remota.md). Lanza una excepción con el
-- detalle de cada desviación.
--
-- Comprueba:
--   1. Que cada función de `public` está en la lista esperada, con su modo
--      (definer/invoker), `search_path = ''` y exactamente los roles de la API
--      con EXECUTE. Una función nueva que no esté en la lista hace fallar la
--      prueba: obliga a auditarla (docs/22-auditoria-security-definer.md).
--   2. Que PUBLIC no tiene EXECUTE en ninguna.
--   3. Deny-by-default: los privilegios por defecto del rol propietario de las
--      funciones no conceden EXECUTE a PUBLIC, `anon` ni `authenticated` sobre
--      funciones futuras.
\set ON_ERROR_STOP on

do $$
declare
  -- Firma → [modo, roles de la API con EXECUTE]. Única fuente de verdad.
  c_expected constant jsonb := jsonb_build_object(
    -- security definer
    'purge_ai_data(integer,integer)', jsonb_build_array('definer', jsonb_build_array()),
    'handle_new_user()', jsonb_build_array('definer', jsonb_build_array()),
    'consume_ai_quota(integer)', jsonb_build_array('definer', jsonb_build_array('authenticated')),
    -- RPC security invoker
    'register_sheet_draft(uuid)', jsonb_build_array('invoker', jsonb_build_array('authenticated')),
    'project_recurring_templates(text)', jsonb_build_array('invoker', jsonb_build_array('authenticated')),
    -- triggers security invoker
    'set_updated_at()', jsonb_build_array('invoker', jsonb_build_array()),
    'validate_transaction()', jsonb_build_array('invoker', jsonb_build_array()),
    'validate_budget()', jsonb_build_array('invoker', jsonb_build_array()),
    'validate_category_classification()', jsonb_build_array('invoker', jsonb_build_array()),
    'validate_income_source_category()', jsonb_build_array('invoker', jsonb_build_array()),
    'validate_plan_line()', jsonb_build_array('invoker', jsonb_build_array()),
    'check_plan_allocations_sum()', jsonb_build_array('invoker', jsonb_build_array()),
    'validate_recurring_template()', jsonb_build_array('invoker', jsonb_build_array()),
    'clear_draft_generated_month()', jsonb_build_array('invoker', jsonb_build_array())
  );
  c_api_roles constant text[] := array['anon', 'authenticated'];

  v_fn record;
  v_expected jsonb;
  v_found text[] := '{}';
  v_role text;
  v_can boolean;
  v_owner oid;
  v_owners oid[];
  v_errors text[] := '{}';
  v_key text;
  v_acl aclitem[];
  v_grantee text;
begin
  -- -------------------------------------------------------------------------
  -- 1 y 2. Cada función existente
  -- -------------------------------------------------------------------------
  for v_fn in
    select p.oid,
           replace(p.oid::regprocedure::text, 'public.', '') as signature,
           p.prosecdef,
           p.proconfig,
           p.proowner,
           coalesce(p.proacl, acldefault('f', p.proowner)) as acl
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
    order by 2
  loop
    v_found := v_found || v_fn.signature;
    v_expected := c_expected -> v_fn.signature;

    if v_expected is null then
      v_errors := v_errors || format('función no auditada: %s', v_fn.signature);
      continue;
    end if;

    if (v_expected ->> 0 = 'definer') <> v_fn.prosecdef then
      v_errors := v_errors || format('%s: se esperaba security %s', v_fn.signature, v_expected ->> 0);
    end if;

    if v_fn.proconfig is null or not ('search_path=""' = any (v_fn.proconfig)) then
      v_errors := v_errors || format('%s: search_path no es vacío (%s)', v_fn.signature,
        coalesce(array_to_string(v_fn.proconfig, ','), 'sin fijar'));
    end if;

    if exists (
      select 1 from aclexplode(v_fn.acl) where grantee = 0 and privilege_type = 'EXECUTE'
    ) then
      v_errors := v_errors || format('%s: PUBLIC tiene EXECUTE', v_fn.signature);
    end if;

    foreach v_role in array c_api_roles loop
      v_can := has_function_privilege(v_role, v_fn.oid, 'EXECUTE');
      if v_can <> ((v_expected -> 1) ? v_role) then
        v_errors := v_errors || format('%s: %s %s EXECUTE', v_fn.signature, v_role,
          case when v_can then 'tiene' else 'no tiene' end);
      end if;
    end loop;
  end loop;

  for v_key in select jsonb_object_keys(c_expected) loop
    if not (v_key = any (v_found)) then
      v_errors := v_errors || format('falta la función esperada %s', v_key);
    end if;
  end loop;

  -- -------------------------------------------------------------------------
  -- 3. Deny-by-default para el rol (o roles) que poseen las funciones
  -- -------------------------------------------------------------------------
  select array_agg(distinct p.proowner) into v_owners
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public';

  foreach v_owner in array coalesce(v_owners, '{}') loop
    -- Global: sin fila propia, PostgreSQL concede EXECUTE a PUBLIC.
    select d.defaclacl into v_acl
    from pg_default_acl d
    where d.defaclrole = v_owner and d.defaclnamespace = 0 and d.defaclobjtype = 'f';

    if v_acl is null then
      v_errors := v_errors || format(
        'deny-by-default: %s no tiene privilegios por defecto globales; las funciones nuevas darían EXECUTE a PUBLIC',
        pg_get_userbyid(v_owner));
    else
      for v_grantee in
        select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end
        from aclexplode(v_acl) a
        where a.privilege_type = 'EXECUTE'
          and (a.grantee = 0 or pg_get_userbyid(a.grantee) = any (c_api_roles))
      loop
        v_errors := v_errors || format('deny-by-default: %s concede EXECUTE global a %s',
          pg_get_userbyid(v_owner), v_grantee);
      end loop;
    end if;

    -- Esquema public: Supabase añade aquí anon y authenticated.
    for v_grantee in
      select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end
      from pg_default_acl d, aclexplode(d.defaclacl) a
      where d.defaclrole = v_owner
        and d.defaclnamespace = 'public'::regnamespace
        and d.defaclobjtype = 'f'
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or pg_get_userbyid(a.grantee) = any (c_api_roles))
    loop
      v_errors := v_errors || format('deny-by-default: %s concede EXECUTE en public a %s',
        pg_get_userbyid(v_owner), v_grantee);
    end loop;
  end loop;

  if array_length(v_errors, 1) > 0 then
    raise exception E'Permisos de funciones incorrectos:\n  %', array_to_string(v_errors, E'\n  ');
  end if;

  raise notice 'Permisos de funciones correctos: % funciones auditadas; deny-by-default activo para %.',
    array_length(v_found, 1),
    (select string_agg(pg_get_userbyid(o), ', ') from unnest(v_owners) o);
end;
$$;
