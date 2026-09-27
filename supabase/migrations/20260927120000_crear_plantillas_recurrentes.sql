-- FinTrack — Movimientos recurrentes: plantillas y proyección mensual a borradores
--
-- Principio: FinTrack no crea movimientos reales automáticamente. Una
-- plantilla recurrente solo se **proyecta** a borradores de Hojas cuando el
-- usuario lo pide, y cada borrador se registra a mano con
-- `register_sheet_draft`, como cualquier otro.
--
-- Modelo real verificado antes de escribir esta migración:
--
--   - Los borradores son `public.sheet_drafts` (celdas en jsonb) dentro de
--     `public.sheets`. `register_sheet_draft` **borra el borrador** al
--     registrarlo y rechaza `type = 'transfer'`.
--   - Una transferencia son dos filas de `transactions` enlazadas por
--     `transfer_group_id`; Hojas no puede representarlas. Por eso las
--     plantillas de esta versión son solo de ingreso y gasto.
--   - `amount_minor` es `bigint` en la unidad mínima de la moneda de la cuenta
--     (COP exponente 0; USD, ARS… centavos). La plantilla no guarda moneda:
--     la hereda de su cuenta, igual que un movimiento.
--   - `accounts_id_user_id_key` y `categories_id_user_id_key` existen y
--     permiten claves foráneas compuestas de propiedad.
--
-- Idempotencia: como el borrador desaparece al registrarse, una unicidad
-- sobre `sheet_drafts` no basta —tras registrar, la plantilla volvería a
-- proyectarse y el movimiento se duplicaría—. La autoridad es
-- `recurring_template_projections`, una fila por plantilla y mes que
-- sobrevive al registro y al borrado del borrador. `sheet_drafts` gana además
-- `source_template_id` y `generated_for_month` para trazabilidad, con un
-- índice único parcial como segunda defensa.
--
-- Reversión: ver el bloque comentado al final.

-- =============================================================
-- 1. recurring_templates
-- =============================================================

create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Sin 'transfer' en esta versión: ver la cabecera.
  type text not null check (type in ('income', 'expense')),
  amount_minor bigint not null check (amount_minor > 0),
  account_id uuid not null,
  category_id uuid not null,
  description text not null,
  day_of_month smallint not null check (day_of_month between 1 and 31),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Mismo tope que `register_sheet_draft`: una plantilla que genera un
  -- borrador imposible de registrar no sirve.
  constraint recurring_templates_description_check
    check (length(btrim(description)) between 1 and 250),

  -- Propiedad declarativa: la cuenta y la categoría son del mismo usuario que
  -- la plantilla, siempre, incluso para una conexión que no pase por RLS.
  -- Diferidas por la cascada de borrado de usuario, igual que en budgets.
  constraint recurring_templates_account_same_user_fkey
    foreign key (account_id, user_id) references public.accounts (id, user_id)
    on delete cascade
    deferrable initially deferred,
  constraint recurring_templates_category_same_user_fkey
    foreign key (category_id, user_id) references public.categories (id, user_id)
    on delete cascade
    deferrable initially deferred,

  constraint recurring_templates_id_user_id_key unique (id, user_id)
);

create index recurring_templates_user_id_idx
  on public.recurring_templates (user_id) where is_active;
create index recurring_templates_account_id_idx on public.recurring_templates (account_id);
create index recurring_templates_category_id_idx on public.recurring_templates (category_id);

create trigger set_recurring_templates_updated_at
  before update on public.recurring_templates
  for each row execute function public.set_updated_at();

-- Coherencia que no cabe en una clave foránea: el tipo de la categoría y el
-- archivado. Como en el plan mensual, el archivado solo se comprueba al
-- estrenar destino (insert, o cambio de cuenta o categoría): una plantilla ya
-- existente cuya cuenta se archiva después no se rompe; la proyección la
-- omite y lo informa.
create function public.validate_recurring_template()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_type text;
  v_category_archived boolean;
  v_account_archived boolean;
  v_new_target boolean;
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el propietario de una plantilla recurrente.';
  end if;

  select c.type, c.is_archived into v_category_type, v_category_archived
  from public.categories c
  where c.id = new.category_id and c.user_id = new.user_id;

  if not found then
    raise exception 'La categoría indicada no existe o no pertenece al usuario.';
  end if;

  if v_category_type <> new.type then
    raise exception 'El tipo de la categoría no coincide con el tipo de la plantilla.';
  end if;

  select a.is_archived into v_account_archived
  from public.accounts a
  where a.id = new.account_id and a.user_id = new.user_id;

  if not found then
    raise exception 'La cuenta indicada no existe o no pertenece al usuario.';
  end if;

  v_new_target := tg_op = 'INSERT'
    or new.account_id is distinct from old.account_id
    or new.category_id is distinct from old.category_id;

  if v_new_target and v_account_archived then
    raise exception 'La cuenta está archivada.';
  end if;

  if v_new_target and v_category_archived then
    raise exception 'La categoría está archivada.';
  end if;

  return new;
end;
$$;

create trigger validate_recurring_template_trigger
  before insert or update on public.recurring_templates
  for each row execute function public.validate_recurring_template();

alter table public.recurring_templates enable row level security;

create policy "recurring_templates_select_own"
  on public.recurring_templates for select
  using (auth.uid() = user_id);

create policy "recurring_templates_insert_own"
  on public.recurring_templates for insert
  with check (auth.uid() = user_id);

create policy "recurring_templates_update_own"
  on public.recurring_templates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recurring_templates_delete_own"
  on public.recurring_templates for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 2. recurring_template_projections
-- =============================================================
--
-- Registro de qué plantilla ya se proyectó para qué mes. Es lo que hace la
-- proyección idempotente para siempre: sobrevive a que el borrador se
-- registre (y se borre) o a que el usuario lo elimine porque no lo quería.

create table public.recurring_template_projections (
  user_id uuid not null references auth.users (id) on delete cascade,
  template_id uuid not null,
  -- 'YYYY-MM'. Texto y no fecha: es un mes de calendario del usuario, sin
  -- hora ni zona horaria que pueda moverlo.
  generated_for_month text not null
    check (generated_for_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz not null default now(),

  primary key (template_id, generated_for_month),

  -- Inmediata: rechaza en la propia sentencia una proyección sobre la
  -- plantilla de otro usuario. El borrado en cascada de un usuario funciona
  -- igual (10-recurring-templates.sql, apartado 9).
  constraint recurring_template_projections_template_same_user_fkey
    foreign key (template_id, user_id) references public.recurring_templates (id, user_id)
    on delete cascade
);

create index recurring_template_projections_user_month_idx
  on public.recurring_template_projections (user_id, generated_for_month);

alter table public.recurring_template_projections enable row level security;

-- Sin política de update: una proyección no se edita. Borrarla es la forma
-- explícita de permitir volver a proyectar ese mes.
create policy "recurring_template_projections_select_own"
  on public.recurring_template_projections for select
  using (auth.uid() = user_id);

create policy "recurring_template_projections_insert_own"
  on public.recurring_template_projections for insert
  with check (auth.uid() = user_id);

create policy "recurring_template_projections_delete_own"
  on public.recurring_template_projections for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 3. sheet_drafts: trazabilidad del origen
-- =============================================================

alter table public.sheet_drafts
  add column source_template_id uuid,
  add column generated_for_month text;

alter table public.sheet_drafts
  add constraint sheet_drafts_generated_pair_check check (
    (source_template_id is null) = (generated_for_month is null)
  ),
  add constraint sheet_drafts_generated_for_month_check check (
    generated_for_month is null or generated_for_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  -- Propiedad declarativa: un borrador solo puede citar una plantilla de su
  -- mismo usuario. Una clave foránea se comprueba sin pasar por RLS, así que
  -- con una simple sobre `id` un usuario podría colgar su borrador de la
  -- plantilla de otro conociendo su UUID. Compuesta, igual que el resto del
  -- esquema.
  --
  -- Si se borra la plantilla, el borrador sigue siendo un borrador válido:
  -- `set null (source_template_id)` anula solo la referencia —nunca
  -- `user_id`— y el trigger de abajo anula el mes. La lista de columnas en
  -- `set null` requiere PostgreSQL 15 o posterior.
  --
  -- Inmediata, no diferida: `set null` no deja estados intermedios inválidos
  -- al borrar un usuario (lo prueba 10-recurring-templates.sql), y así un
  -- intento de citar una plantilla ajena falla en la propia sentencia.
  add constraint sheet_drafts_source_template_fkey
    foreign key (source_template_id, user_id)
    references public.recurring_templates (id, user_id)
    on delete set null (source_template_id);

-- `on delete set null` solo anula `source_template_id`; el par exige anular
-- también el mes. Este trigger lo hace antes de que se compruebe el check.
create function public.clear_draft_generated_month()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_template_id is null and old.source_template_id is not null then
    new.generated_for_month := null;
  end if;
  return new;
end;
$$;

create trigger clear_draft_generated_month_trigger
  before update of source_template_id on public.sheet_drafts
  for each row execute function public.clear_draft_generated_month();

-- Único parcial: los borradores manuales (`source_template_id` nulo) no
-- entran en el índice y no se ven afectados. Con un índice único normal, los
-- NULL no chocarían entre sí en PostgreSQL, pero el parcial deja la intención
-- explícita y es el destino de `on conflict` en la RPC.
create unique index sheet_drafts_template_month_key
  on public.sheet_drafts (user_id, source_template_id, generated_for_month)
  where source_template_id is not null;

-- =============================================================
-- 4. project_recurring_templates
-- =============================================================
--
-- Proyecta las plantillas activas del usuario autenticado a borradores del
-- mes pedido. Devuelve jsonb:
--
--   {
--     "month": "2026-09",
--     "sheet_id": "…" | null,
--     "results": [
--       {"template_id": "…", "status": "created", "draft_id": "…", "date": "2026-09-30"},
--       {"template_id": "…", "status": "skipped_existing"},
--       {"template_id": "…", "status": "skipped_archived_account"},
--       {"template_id": "…", "status": "skipped_archived_category"},
--       {"template_id": "…", "status": "invalid_template"}
--     ]
--   }
--
-- Un problema en una plantilla no aborta las demás: se informa por plantilla.
-- Los errores inesperados —permisos, restricciones, colisión de posición— sí
-- se propagan y abortan toda la proyección: no se tapan con `on conflict`.
--
-- `security invoker`, como `register_sheet_draft`: todas sus lecturas y
-- escrituras pasan por RLS con el usuario del JWT.
--
-- Concurrencia: un cerrojo transaccional por usuario y mes serializa dos
-- proyecciones simultáneas (doble clic, dos pestañas). La primera crea; la
-- segunda espera y encuentra todo proyectado. La clave primaria de
-- `recurring_template_projections` es la garantía última aunque el cerrojo
-- faltara.

create function public.project_recurring_templates(p_month text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_year integer;
  v_month integer;
  v_last_day integer;
  v_template public.recurring_templates;
  v_account_archived boolean;
  v_category_archived boolean;
  v_category_type text;
  v_date date;
  v_sheet_id uuid;
  v_sheet_name text;
  v_position integer;
  v_draft_id uuid;
  v_inserted integer;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'project_recurring_templates requiere una sesión autenticada.';
  end if;

  if p_month is null or p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'El mes debe tener el formato YYYY-MM.' using errcode = '22023';
  end if;

  v_year := substr(p_month, 1, 4)::integer;
  v_month := substr(p_month, 6, 2)::integer;

  if v_year < 2000 or v_year > 2100 then
    raise exception 'El mes está fuera del rango admitido.' using errcode = '22023';
  end if;

  -- Último día natural del mes. No «último día hábil»: eso exige un
  -- calendario de festivos por país que FinTrack no tiene.
  v_last_day := extract(day from (make_date(v_year, v_month, 1) + interval '1 month - 1 day'))::integer;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_month, 0));

  v_sheet_name := 'Recurrentes ' || p_month;

  for v_template in
    select *
    from public.recurring_templates t
    where t.user_id = v_user_id
      and t.is_active
    order by t.day_of_month, t.created_at, t.id
  loop
    if exists (
      select 1
      from public.recurring_template_projections p
      where p.template_id = v_template.id
        and p.generated_for_month = p_month
    ) then
      v_results := v_results || jsonb_build_object(
        'template_id', v_template.id, 'status', 'skipped_existing'
      );
      continue;
    end if;

    select a.is_archived into v_account_archived
    from public.accounts a
    where a.id = v_template.account_id and a.user_id = v_user_id;

    if not found then
      v_results := v_results || jsonb_build_object(
        'template_id', v_template.id, 'status', 'invalid_template'
      );
      continue;
    end if;

    select c.is_archived, c.type into v_category_archived, v_category_type
    from public.categories c
    where c.id = v_template.category_id and c.user_id = v_user_id;

    if not found or v_category_type <> v_template.type then
      v_results := v_results || jsonb_build_object(
        'template_id', v_template.id, 'status', 'invalid_template'
      );
      continue;
    end if;

    if v_account_archived then
      v_results := v_results || jsonb_build_object(
        'template_id', v_template.id, 'status', 'skipped_archived_account'
      );
      continue;
    end if;

    if v_category_archived then
      v_results := v_results || jsonb_build_object(
        'template_id', v_template.id, 'status', 'skipped_archived_category'
      );
      continue;
    end if;

    -- El registro de proyección va primero. Si ya existía (no debería, con el
    -- cerrojo), `on conflict` sobre su clave primaria —y solo sobre ella— lo
    -- trata como ya proyectado.
    insert into public.recurring_template_projections (user_id, template_id, generated_for_month)
    values (v_user_id, v_template.id, p_month)
    on conflict (template_id, generated_for_month) do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      v_results := v_results || jsonb_build_object(
        'template_id', v_template.id, 'status', 'skipped_existing'
      );
      continue;
    end if;

    -- La hoja del mes se crea al primer borrador que haga falta.
    if v_sheet_id is null then
      select s.id into v_sheet_id
      from public.sheets s
      where s.user_id = v_user_id and s.name = v_sheet_name
      order by s.created_at
      limit 1;

      if v_sheet_id is null then
        insert into public.sheets (user_id, name, columns)
        values (v_user_id, v_sheet_name, '[]'::jsonb)
        returning id into v_sheet_id;
      end if;
    end if;

    select coalesce(max(d.position), -1) + 1 into v_position
    from public.sheet_drafts d
    where d.sheet_id = v_sheet_id;

    v_date := make_date(v_year, v_month, least(v_template.day_of_month::integer, v_last_day));

    insert into public.sheet_drafts (
      user_id, sheet_id, position, cells, source_template_id, generated_for_month
    )
    values (
      v_user_id,
      v_sheet_id,
      v_position,
      jsonb_build_object(
        'transaction_date', to_char(v_date, 'YYYY-MM-DD'),
        'description', v_template.description,
        'account_id', v_template.account_id::text,
        'category_id', v_template.category_id::text,
        'type', v_template.type,
        'amount_minor', v_template.amount_minor::text,
        'notes', ''
      ),
      v_template.id,
      p_month
    )
    on conflict (user_id, source_template_id, generated_for_month)
      where source_template_id is not null
      do nothing
    returning id into v_draft_id;

    if v_draft_id is null then
      v_results := v_results || jsonb_build_object(
        'template_id', v_template.id, 'status', 'skipped_existing'
      );
      continue;
    end if;

    v_results := v_results || jsonb_build_object(
      'template_id', v_template.id,
      'status', 'created',
      'draft_id', v_draft_id,
      'date', to_char(v_date, 'YYYY-MM-DD')
    );
    v_draft_id := null;
  end loop;

  return jsonb_build_object('month', p_month, 'sheet_id', v_sheet_id, 'results', v_results);
end;
$$;

revoke all on function public.project_recurring_templates(text) from public;
revoke all on function public.project_recurring_templates(text) from anon;
grant execute on function public.project_recurring_templates(text) to authenticated;

comment on function public.project_recurring_templates(text) is
  'Proyecta las plantillas recurrentes activas del usuario a borradores de Hojas del mes indicado (YYYY-MM). Idempotente; nunca crea movimientos.';

-- =============================================================
-- Reversión manual (no se ejecuta)
-- =============================================================
--
-- begin;
-- drop function if exists public.project_recurring_templates(text);
-- drop index if exists public.sheet_drafts_template_month_key;
-- drop trigger if exists clear_draft_generated_month_trigger on public.sheet_drafts;
-- drop function if exists public.clear_draft_generated_month();
-- alter table public.sheet_drafts
--   drop constraint if exists sheet_drafts_source_template_fkey,
--   drop constraint if exists sheet_drafts_generated_for_month_check,
--   drop constraint if exists sheet_drafts_generated_pair_check,
--   drop column if exists generated_for_month,
--   drop column if exists source_template_id;
-- drop table if exists public.recurring_template_projections;
-- drop table if exists public.recurring_templates;
-- drop function if exists public.validate_recurring_template();
-- commit;
--
-- Los borradores ya proyectados siguen siendo borradores normales y los
-- movimientos registrados no se tocan.
