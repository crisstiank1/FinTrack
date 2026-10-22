-- Pruebas de plantillas recurrentes y de project_recurring_templates.
-- Se ejecutan con scripts/test-db.sh sobre una base vacía con las migraciones
-- aplicadas. Cualquier fallo lanza una excepción y detiene el archivo.

\set ON_ERROR_STOP on
set client_min_messages = warning;

create schema t;
grant usage on schema t to authenticated, anon;

-- Actúa como el usuario indicado en las sentencias siguientes.
create function t.claims(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false)
$$;
grant execute on function t.claims(uuid) to authenticated, anon;

-- Ejecuta una sentencia y exige que falle.
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

-- ---------------------------------------------------------------------------
-- Datos: dos usuarios, cada uno con cuentas y categorías propias.
-- ---------------------------------------------------------------------------

insert into auth.users (id) values
  ('aaaaaaaa-0000-4000-8000-000000000001'),
  ('bbbbbbbb-0000-4000-8000-000000000002');

insert into public.accounts (id, user_id, name, type, currency_code) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Banco A', 'checking', 'COP'),
  ('a2000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Dólares A', 'savings', 'USD'),
  ('a3000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Vieja A', 'cash', 'COP'),
  ('b1000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Banco B', 'checking', 'COP');

insert into public.categories (id, user_id, name, type) values
  ('c1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Arriendo', 'expense'),
  ('c2000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Salario', 'income'),
  ('c3000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'Gimnasio', 'expense'),
  ('d1000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Arriendo B', 'expense');

-- ---------------------------------------------------------------------------
-- 1. Creación y propiedad (como usuario A)
-- ---------------------------------------------------------------------------

select t.claims('aaaaaaaa-0000-4000-8000-000000000001');
set role authenticated;

insert into public.recurring_templates (id, user_id, type, amount_minor, account_id, category_id, description, day_of_month) values
  ('e1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'expense', 1500000,
   'a1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'Arriendo', 31),
  ('e2000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'income', 450099,
   'a2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Salario USD', 29),
  ('e3000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'expense', 90000,
   'a3000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'Gimnasio', 5),
  ('e4000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'expense', 1000,
   'a1000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000001', 'Inactiva', 10);

update public.recurring_templates set is_active = false where id = 'e4000000-0000-4000-8000-000000000001';

do $$
begin
  -- Cuenta o categoría de otro usuario: rechazadas.
  perform t.expect_error($q$
    insert into public.recurring_templates (user_id, type, amount_minor, account_id, category_id, description, day_of_month)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'expense', 1, 'b1000000-0000-4000-8000-000000000002',
            'c1000000-0000-4000-8000-000000000001', 'x', 1)
  $q$, 'cuenta ajena');

  perform t.expect_error($q$
    insert into public.recurring_templates (user_id, type, amount_minor, account_id, category_id, description, day_of_month)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'expense', 1, 'a1000000-0000-4000-8000-000000000001',
            'd1000000-0000-4000-8000-000000000002', 'x', 1)
  $q$, 'categoría ajena');

  -- Plantilla a nombre de otro usuario: RLS.
  perform t.expect_error($q$
    insert into public.recurring_templates (user_id, type, amount_minor, account_id, category_id, description, day_of_month)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'expense', 1, 'b1000000-0000-4000-8000-000000000002',
            'd1000000-0000-4000-8000-000000000002', 'x', 1)
  $q$, 'user_id ajeno');

  -- Transferencias: no admitidas en esta versión.
  perform t.expect_error($q$
    insert into public.recurring_templates (user_id, type, amount_minor, account_id, category_id, description, day_of_month)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'transfer', 1, 'a1000000-0000-4000-8000-000000000001',
            'c1000000-0000-4000-8000-000000000001', 'x', 1)
  $q$, 'transferencia');

  -- Categoría de otro tipo, día fuera de rango, monto no positivo, descripción vacía.
  perform t.expect_error($q$
    insert into public.recurring_templates (user_id, type, amount_minor, account_id, category_id, description, day_of_month)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'income', 1, 'a1000000-0000-4000-8000-000000000001',
            'c1000000-0000-4000-8000-000000000001', 'x', 1)
  $q$, 'tipo de categoría');
  perform t.expect_error($q$
    insert into public.recurring_templates (user_id, type, amount_minor, account_id, category_id, description, day_of_month)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'expense', 1, 'a1000000-0000-4000-8000-000000000001',
            'c1000000-0000-4000-8000-000000000001', 'x', 32)
  $q$, 'día 32');
  perform t.expect_error($q$
    insert into public.recurring_templates (user_id, type, amount_minor, account_id, category_id, description, day_of_month)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'expense', 0, 'a1000000-0000-4000-8000-000000000001',
            'c1000000-0000-4000-8000-000000000001', 'x', 1)
  $q$, 'monto 0');
  perform t.expect_error($q$
    insert into public.recurring_templates (user_id, type, amount_minor, account_id, category_id, description, day_of_month)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'expense', 1, 'a1000000-0000-4000-8000-000000000001',
            'c1000000-0000-4000-8000-000000000001', '   ', 1)
  $q$, 'descripción vacía');
end;
$$;

reset role;

-- La cuenta de «Gimnasio» se archiva después de crear la plantilla: la
-- plantilla sigue existiendo, pero no se proyecta.
update public.accounts set is_archived = true where id = 'a3000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- 2. Aislamiento: el usuario B no ve, edita ni borra plantillas de A
-- ---------------------------------------------------------------------------

select t.claims('bbbbbbbb-0000-4000-8000-000000000002');
set role authenticated;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.recurring_templates;
  perform t.eq(v_count, 0, 'B no ve plantillas de A');

  update public.recurring_templates set amount_minor = 1;
  get diagnostics v_count = row_count;
  perform t.eq(v_count, 0, 'B no edita plantillas de A');

  delete from public.recurring_templates;
  get diagnostics v_count = row_count;
  perform t.eq(v_count, 0, 'B no borra plantillas de A');

  -- La proyección de B no toca nada de A.
  perform t.eq(
    jsonb_array_length(public.project_recurring_templates('2026-02') -> 'results'),
    0,
    'B no tiene plantillas que proyectar'
  );

  -- B no puede colgar un borrador suyo de una plantilla de A, aunque conozca
  -- su id: la clave foránea se comprueba sin RLS y debe exigir el mismo dueño.
  insert into public.sheets (id, user_id, name)
  values ('5b000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Hoja B');
  perform t.expect_error($q$
    insert into public.sheet_drafts (user_id, sheet_id, position, cells, source_template_id, generated_for_month)
    values ('bbbbbbbb-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000002', 0, '{}',
            'e1000000-0000-4000-8000-000000000001', '2026-01')
  $q$, 'borrador de B apuntando a la plantilla de A');

  -- Tampoco puede registrar una proyección sobre la plantilla de A.
  perform t.expect_error($q$
    insert into public.recurring_template_projections (user_id, template_id, generated_for_month)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000001', '2026-01')
  $q$, 'proyección de B sobre la plantilla de A');
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- 3. Proyección de febrero de 2026 (no bisiesto) como A
-- ---------------------------------------------------------------------------

select t.claims('aaaaaaaa-0000-4000-8000-000000000001');
set role authenticated;

do $$
declare
  v_result jsonb;
  v_statuses jsonb;
  v_transactions_before integer;
  v_transactions_after integer;
  v_cells jsonb;
begin
  select count(*) into v_transactions_before from public.transactions;

  v_result := public.project_recurring_templates('2026-02');

  select jsonb_object_agg(r ->> 'template_id', r ->> 'status') into v_statuses
  from jsonb_array_elements(v_result -> 'results') r;

  perform t.eq(v_statuses ->> 'e1000000-0000-4000-8000-000000000001', 'created', 'arriendo creado');
  perform t.eq(v_statuses ->> 'e2000000-0000-4000-8000-000000000001', 'created', 'salario creado');
  perform t.eq(v_statuses ->> 'e3000000-0000-4000-8000-000000000001', 'skipped_archived_account', 'cuenta archivada omitida');
  perform t.eq(v_statuses ? 'e4000000-0000-4000-8000-000000000001', false, 'inactiva no se proyecta');

  -- Día 31 y día 29 en febrero no bisiesto → 28.
  select cells into v_cells from public.sheet_drafts
  where source_template_id = 'e1000000-0000-4000-8000-000000000001' and generated_for_month = '2026-02';
  perform t.eq(v_cells ->> 'transaction_date', '2026-02-28', 'día 31 en febrero');
  perform t.eq(v_cells ->> 'amount_minor', '1500000', 'monto COP intacto');
  perform t.eq(v_cells ->> 'type', 'expense', 'tipo');
  perform t.eq(v_cells ->> 'account_id', 'a1000000-0000-4000-8000-000000000001', 'cuenta');

  select cells into v_cells from public.sheet_drafts
  where source_template_id = 'e2000000-0000-4000-8000-000000000001' and generated_for_month = '2026-02';
  perform t.eq(v_cells ->> 'transaction_date', '2026-02-28', 'día 29 en febrero no bisiesto');
  -- USD en centavos: 4500,99 USD siguen siendo 450099, en su propia cuenta.
  perform t.eq(v_cells ->> 'amount_minor', '450099', 'monto USD en centavos');
  perform t.eq(v_cells ->> 'account_id', 'a2000000-0000-4000-8000-000000000001', 'cuenta USD');

  -- Los borradores van a la hoja «Recurrentes 2026-02».
  perform t.eq(
    (select name from public.sheets where id = (v_result ->> 'sheet_id')::uuid),
    'Recurrentes 2026-02',
    'hoja del mes'
  );

  -- Ningún movimiento real.
  select count(*) into v_transactions_after from public.transactions;
  perform t.eq(v_transactions_after, v_transactions_before, 'no crea transactions');

  -- Segunda llamada: todo ya existe.
  v_result := public.project_recurring_templates('2026-02');
  select jsonb_object_agg(r ->> 'template_id', r ->> 'status') into v_statuses
  from jsonb_array_elements(v_result -> 'results') r;
  perform t.eq(v_statuses ->> 'e1000000-0000-4000-8000-000000000001', 'skipped_existing', 'idempotente arriendo');
  perform t.eq(v_statuses ->> 'e2000000-0000-4000-8000-000000000001', 'skipped_existing', 'idempotente salario');
  perform t.eq(
    (select count(*)::integer from public.sheet_drafts where generated_for_month = '2026-02'),
    2,
    'solo dos borradores en febrero'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Registrar o borrar el borrador no permite volver a proyectar
-- ---------------------------------------------------------------------------

do $$
declare
  v_draft uuid;
  v_register jsonb;
  v_result jsonb;
begin
  select id into v_draft from public.sheet_drafts
  where source_template_id = 'e1000000-0000-4000-8000-000000000001' and generated_for_month = '2026-02';

  -- Registro manual con el flujo existente.
  v_register := public.register_sheet_draft(v_draft);
  perform t.eq(v_register ->> 'status', 'registered', 'registro manual');

  -- El borrador del salario se borra a mano (el usuario no lo quería).
  delete from public.sheet_drafts
  where source_template_id = 'e2000000-0000-4000-8000-000000000001' and generated_for_month = '2026-02';

  v_result := public.project_recurring_templates('2026-02');
  perform t.eq(
    (select count(*)::integer from jsonb_array_elements(v_result -> 'results') r where r ->> 'status' = 'created'),
    0,
    'ni registrado ni borrado se vuelven a proyectar'
  );
  perform t.eq(
    (select count(*)::integer from public.transactions where description = 'Arriendo'),
    1,
    'un solo movimiento de arriendo'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Otro mes sí proyecta; abril y bisiesto
-- ---------------------------------------------------------------------------

do $$
declare
  v_cells jsonb;
begin
  perform public.project_recurring_templates('2026-04');
  select cells into v_cells from public.sheet_drafts
  where source_template_id = 'e1000000-0000-4000-8000-000000000001' and generated_for_month = '2026-04';
  perform t.eq(v_cells ->> 'transaction_date', '2026-04-30', 'día 31 en abril');

  perform public.project_recurring_templates('2028-02');
  select cells into v_cells from public.sheet_drafts
  where source_template_id = 'e2000000-0000-4000-8000-000000000001' and generated_for_month = '2028-02';
  perform t.eq(v_cells ->> 'transaction_date', '2028-02-29', 'día 29 en febrero bisiesto');
  select cells into v_cells from public.sheet_drafts
  where source_template_id = 'e1000000-0000-4000-8000-000000000001' and generated_for_month = '2028-02';
  perform t.eq(v_cells ->> 'transaction_date', '2028-02-29', 'día 31 en febrero bisiesto');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Categoría archivada y mes inválido
-- ---------------------------------------------------------------------------

reset role;
update public.categories set is_archived = true where id = 'c2000000-0000-4000-8000-000000000001';
select t.claims('aaaaaaaa-0000-4000-8000-000000000001');
set role authenticated;

do $$
declare
  v_result jsonb;
  v_statuses jsonb;
begin
  v_result := public.project_recurring_templates('2026-05');
  select jsonb_object_agg(r ->> 'template_id', r ->> 'status') into v_statuses
  from jsonb_array_elements(v_result -> 'results') r;
  perform t.eq(v_statuses ->> 'e2000000-0000-4000-8000-000000000001', 'skipped_archived_category', 'categoría archivada omitida');
  -- La omisión de una no bloquea a las demás.
  perform t.eq(v_statuses ->> 'e1000000-0000-4000-8000-000000000001', 'created', 'las demás siguen');

  perform t.expect_error($q$ select public.project_recurring_templates('2026-13') $q$, 'mes 13');
  perform t.expect_error($q$ select public.project_recurring_templates('2026-2') $q$, 'mes sin cero');
  perform t.expect_error($q$ select public.project_recurring_templates(null) $q$, 'mes nulo');
  perform t.expect_error($q$ select public.project_recurring_templates('1999-01') $q$, 'fuera de rango');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Borradores manuales no se ven afectados; borrar la plantilla conserva el borrador
-- ---------------------------------------------------------------------------

do $$
declare
  v_sheet uuid;
  v_draft uuid;
begin
  select id into v_sheet from public.sheets where name = 'Recurrentes 2026-05';

  -- Dos borradores manuales (source_template_id nulo) no chocan con el índice parcial.
  insert into public.sheet_drafts (user_id, sheet_id, position, cells)
  values ('aaaaaaaa-0000-4000-8000-000000000001', v_sheet, 100, '{}'),
         ('aaaaaaaa-0000-4000-8000-000000000001', v_sheet, 101, '{}');

  -- Un segundo borrador de la misma plantilla y mes es imposible.
  perform t.expect_error(format($q$
    insert into public.sheet_drafts (user_id, sheet_id, position, cells, source_template_id, generated_for_month)
    values ('aaaaaaaa-0000-4000-8000-000000000001', %L, 200, '{}', 'e1000000-0000-4000-8000-000000000001', '2026-05')
  $q$, v_sheet), 'borrador duplicado');

  select id into v_draft from public.sheet_drafts
  where source_template_id = 'e1000000-0000-4000-8000-000000000001' and generated_for_month = '2026-05';

  delete from public.recurring_templates where id = 'e1000000-0000-4000-8000-000000000001';

  perform t.eq(
    (select source_template_id is null and generated_for_month is null from public.sheet_drafts where id = v_draft),
    true,
    'el borrador sobrevive sin referencia'
  );
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- 8. Sin sesión no se proyecta; anon no puede ejecutar
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', '', false);
set role authenticated;
do $$
begin
  perform t.expect_error($q$ select public.project_recurring_templates('2026-06') $q$, 'sin sesión');
end;
$$;
reset role;

set role anon;
do $$
begin
  perform t.expect_error($q$ select public.project_recurring_templates('2026-06') $q$, 'anon');
end;
$$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. Borrar un usuario con plantillas, proyecciones y borradores funciona
-- ---------------------------------------------------------------------------

delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';

do $$
begin
  perform t.eq(
    (select count(*)::integer from public.recurring_templates
     where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
    0,
    'plantillas borradas en cascada'
  );
  perform t.eq(
    (select count(*)::integer from public.sheet_drafts
     where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
    0,
    'borradores borrados en cascada'
  );
end;
$$;

drop schema t cascade;
