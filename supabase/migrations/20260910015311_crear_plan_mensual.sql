-- FinTrack — Plan mensual (Fase 8.7, migración M3)
--
-- Crea las cinco tablas restantes del Plan mensual:
--   plan_months, plan_allocations, plan_income_sources,
--   plan_income_source_categories y plan_lines.
--
-- Las cinco van en una sola migración porque sus claves foráneas compuestas son
-- mutuamente dependientes: separarlas dejaría estados intermedios inválidos.
--
-- Ninguna de estas tablas almacena un importe real. Los valores «Actual» se
-- calculan siempre desde transactions en tiempo de consulta, lo que vuelve
-- imposible por construcción que un valor real sea editable.
--
-- No toca accounts, budgets, categories, sheets ni transactions.
-- No consulta accounts.type = 'credit_card' en ninguna regla.
--
-- **Solo forward.** Sin SQL de reversión; el rollback manual está en
-- docs/09-plan-mensual.md.
--
-- Depende de M1 (accounts_id_user_id_key y el tipo 'investment') y reutiliza
-- categories_id_user_id_key de la Fase 8. Modelo completo y numeración de
-- restricciones: docs/09-plan-mensual.md.

-- =============================================================
-- 1. plan_months — cabecera del plan de un mes
-- =============================================================

-- Snapshot por mes. A diferencia de budgets, aquí no hay plantillas,
-- excepciones ni resolución: un mes es una fila y nada apunta hacia atrás, así
-- que un mes cerrado es inmutable por construcción y no por una regla que haya
-- que respetar.
create table public.plan_months (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_month date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- C1. period_month representa un mes, no un día suelto, y se valida contra su
  -- propio truncado a mes. El cast explícito a `timestamp` no es decorativo:
  -- con un argumento `date`, PostgreSQL resuelve date_trunc hacia la variante
  -- `timestamptz`, que es STABLE por depender de la zona horaria, y una
  -- restricción CHECK exige funciones IMMUTABLE; sin el cast la migración
  -- fallaría al crearse. Mismo motivo documentado en la migración de budgets.
  constraint plan_months_period_month_is_month_start_check check (
    period_month = date_trunc('month', period_month::timestamp)::date
  ),

  -- U2. Un solo plan por usuario y mes.
  constraint plan_months_user_id_period_month_key unique (user_id, period_month),

  -- U3 y U4. No cambian qué filas son válidas —`id` ya es única por ser clave
  -- primaria—: existen porque una clave foránea compuesta necesita una
  -- restricción única que cubra exactamente sus columnas de destino. U3
  -- sostiene F7 y U4 sostiene F2, F3 y F6.
  constraint plan_months_id_period_month_key unique (id, period_month),
  constraint plan_months_id_user_id_key unique (id, user_id)
);

alter table public.plan_months enable row level security;

create trigger set_plan_months_updated_at
  before update on public.plan_months
  for each row execute function public.set_updated_at();

create policy "plan_months_select_own"
  on public.plan_months for select
  using (auth.uid() = user_id);

create policy "plan_months_insert_own"
  on public.plan_months for insert
  with check (auth.uid() = user_id);

create policy "plan_months_update_own"
  on public.plan_months for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plan_months_delete_own"
  on public.plan_months for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 2. plan_allocations — porcentajes del reparto
-- =============================================================

-- Cinco grupos posibles aquí y solo tres en category_classifications: el
-- reparto distribuye el ingreso hacia cinco destinos, mientras que la
-- clasificación únicamente etiqueta categorías de gasto.
--
-- Puntos base y no decimales: 50% es 5000. Un porcentaje en coma flotante
-- haría imposible garantizar que la suma sea exactamente 100%.
create table public.plan_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_month_id uuid not null,
  budget_group text not null
    check (budget_group in ('needs', 'wants', 'savings', 'investment', 'debt')),
  -- C9.
  percent_bp integer not null check (percent_bp between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- U5. Un grupo aparece una sola vez por mes.
  constraint plan_allocations_plan_month_id_budget_group_key
    unique (plan_month_id, budget_group),

  -- F2. Propiedad declarativa y cascada, diferida al commit: al borrar un
  -- usuario, las cascadas sobre plan_months y plan_allocations corren dentro de
  -- la misma sentencia y en el punto intermedio una fila podría referenciar un
  -- mes ya borrado. Diferida, la comprobación solo ve el estado final.
  --
  -- Una sola clave compuesta hace los dos trabajos —cascada y propiedad—, tal
  -- como especifica docs/09-plan-mensual.md. `sheets` resuelve lo mismo con dos
  -- claves separadas: una simple con cascada inmediata y una compuesta
  -- `no action` diferida. La divergencia es intencional: manda la
  -- especificación aprobada.
  constraint plan_allocations_plan_month_same_user_fkey
    foreign key (plan_month_id, user_id)
    references public.plan_months (id, user_id)
    on delete cascade
    deferrable initially deferred
);

-- PostgreSQL no indexa las claves foráneas por su cuenta. El índice único
-- anterior ya empieza por plan_month_id, así que sirve para la comprobación de
-- la clave y no se añade ninguno más.

alter table public.plan_allocations enable row level security;

create trigger set_plan_allocations_updated_at
  before update on public.plan_allocations
  for each row execute function public.set_updated_at();

create policy "plan_allocations_select_own"
  on public.plan_allocations for select
  using (auth.uid() = user_id);

create policy "plan_allocations_insert_own"
  on public.plan_allocations for insert
  with check (auth.uid() = user_id);

create policy "plan_allocations_update_own"
  on public.plan_allocations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plan_allocations_delete_own"
  on public.plan_allocations for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 3. plan_income_sources — fuentes de ingreso planeadas
-- =============================================================

create table public.plan_income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_month_id uuid not null,
  name text not null
    check (length(btrim(name)) between 1 and 80),
  planned_minor bigint not null check (planned_minor >= 0),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- U6 y U7. Destinos de F4 y de F4b respectivamente.
  constraint plan_income_sources_id_plan_month_id_key unique (id, plan_month_id),
  constraint plan_income_sources_id_user_id_key unique (id, user_id),

  -- U8. Diferible porque reordenar intercambia posiciones y el estado
  -- intermedio tiene duplicados aunque el final sea válido. Se declara como
  -- restricción y no como índice porque en PostgreSQL solo una restricción
  -- puede diferirse. Mismo patrón que sheet_drafts.
  constraint plan_income_sources_plan_month_id_position_key
    unique (plan_month_id, position)
    deferrable initially immediate,

  -- F3. Como F2: una sola clave compuesta con cascada diferida, no el patrón
  -- de dos claves de `sheets`. Intencional, según docs/09-plan-mensual.md.
  constraint plan_income_sources_plan_month_same_user_fkey
    foreign key (plan_month_id, user_id)
    references public.plan_months (id, user_id)
    on delete cascade
    deferrable initially deferred
);

alter table public.plan_income_sources enable row level security;

create trigger set_plan_income_sources_updated_at
  before update on public.plan_income_sources
  for each row execute function public.set_updated_at();

create policy "plan_income_sources_select_own"
  on public.plan_income_sources for select
  using (auth.uid() = user_id);

create policy "plan_income_sources_insert_own"
  on public.plan_income_sources for insert
  with check (auth.uid() = user_id);

create policy "plan_income_sources_update_own"
  on public.plan_income_sources for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plan_income_sources_delete_own"
  on public.plan_income_sources for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 4. plan_income_source_categories — puente fuente ↔ categoría
-- =============================================================

-- Una fuente puede alimentarse de varias categorías de ingreso, pero una
-- categoría alimenta una sola fuente del mes. Esa regla es la que impide contar
-- dos veces el mismo ingreso, y para poder expresarla hace falta plan_month_id
-- aquí: sin él, la unicidad solo podría declararse por fuente, que es
-- justamente lo que no basta.
--
-- La columna desnormalizada no queda al aire: F4 la ata contra la fuente.
create table public.plan_income_source_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_month_id uuid not null,
  plan_income_source_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),

  -- U9. Una categoría de ingreso alimenta una sola fuente del mes.
  constraint plan_income_source_categories_plan_month_id_category_id_key
    unique (plan_month_id, category_id),

  -- F4. Impide que el puente apunte a una fuente de otro mes: la pareja
  -- (fuente, mes) tiene que existir tal cual en plan_income_sources.
  constraint plan_income_source_categories_source_month_fkey
    foreign key (plan_income_source_id, plan_month_id)
    references public.plan_income_sources (id, plan_month_id)
    on delete cascade,

  -- F4b. Cierra la cadena de propiedad: sin ella, el user_id del puente podría
  -- diferir del de su fuente. F4 ata la pareja (fuente, mes) y F5 ata la
  -- categoría al usuario, pero ninguna de las dos ata el puente a su fuente por
  -- usuario.
  constraint plan_income_source_categories_source_same_user_fkey
    foreign key (plan_income_source_id, user_id)
    references public.plan_income_sources (id, user_id)
    on delete cascade
    deferrable initially deferred,

  -- F5. Propiedad declarativa de la categoría, diferida por el mismo motivo que
  -- en budgets y en category_classifications.
  constraint plan_income_source_categories_category_same_user_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete no action
    deferrable initially deferred
);

create index plan_income_source_categories_category_id_idx
  on public.plan_income_source_categories (category_id);

create index plan_income_source_categories_source_id_idx
  on public.plan_income_source_categories (plan_income_source_id);

alter table public.plan_income_source_categories enable row level security;

create policy "plan_income_source_categories_select_own"
  on public.plan_income_source_categories for select
  using (auth.uid() = user_id);

create policy "plan_income_source_categories_insert_own"
  on public.plan_income_source_categories for insert
  with check (auth.uid() = user_id);

create policy "plan_income_source_categories_update_own"
  on public.plan_income_source_categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plan_income_source_categories_delete_own"
  on public.plan_income_source_categories for delete
  using (auth.uid() = user_id);

-- Sin trigger de updated_at: la tabla no tiene esa columna. Es una fila puente
-- que se crea o se elimina para vincular una fuente con una categoría, nunca se
-- edita como entidad.

-- =============================================================
-- 5. plan_lines — facturas, variables, ahorro e inversión
-- =============================================================

-- Una sola tabla y no varias: los bloques comparten columnas casi idénticas, y
-- separarlos multiplicaría políticas RLS, índices y superficie de consulta sin
-- ganar nada semánticamente.
--
-- El eje de medición es la idea central. Una línea se mide **o por categoría, o
-- por cuenta**, nunca por las dos, y el eje determina de dónde sale el importe
-- planeado: por categoría, de budgets; por cuenta, de la propia línea. Las tres
-- restricciones C5, C6 y C7 lo hacen imposible de violar, así que el doble
-- presupuesto por categoría no se evita al consultar: no se puede escribir.
--
-- No existe kind = 'debt'. La deuda es una categoría de gasto clasificada como
-- 'debt' en category_classifications, con su presupuesto en budgets como
-- cualquier otra. Una línea de deuda sería idéntica a una 'variable' y su único
-- rasgo distintivo —la clasificación— ya vive en otra tabla, donde no puede
-- desincronizarse.
create table public.plan_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_month_id uuid not null,
  -- Desnormalizado para que C4 sea una restricción de fila y no un trigger. No
  -- puede desviarse: F7 lo ata contra plan_months.
  period_month date not null,
  kind text not null
    check (kind in ('bill', 'variable', 'savings', 'investment')),
  name text not null
    check (length(btrim(name)) between 1 and 80),
  category_id uuid,
  account_id uuid,
  planned_minor bigint,
  due_date date,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- C2. Mismo criterio y mismo cast que C1.
  constraint plan_lines_period_month_is_month_start_check check (
    period_month = date_trunc('month', period_month::timestamp)::date
  ),

  -- C3. La fecha esperada de pago solo tiene sentido en una factura.
  constraint plan_lines_due_date_only_bill_check check (
    due_date is null or kind = 'bill'
  ),

  -- C4. La fecha esperada cae dentro del mes del plan.
  constraint plan_lines_due_date_within_period_check check (
    due_date is null
    or date_trunc('month', due_date::timestamp)::date = period_month
  ),

  -- C5 y C6. El kind fija el eje. Juntas implican que solo hay un eje por
  -- línea, así que no hace falta declarar el XOR aparte: es una consecuencia.
  constraint plan_lines_category_axis_check check (
    (kind in ('bill', 'variable')) = (category_id is not null)
  ),
  constraint plan_lines_account_axis_check check (
    (kind in ('savings', 'investment')) = (account_id is not null)
  ),

  -- C7. El importe sigue al eje: una línea medida por categoría no puede llevar
  -- cifra propia, porque la suya está en budgets.
  constraint plan_lines_planned_minor_follows_axis_check check (
    (planned_minor is null) = (category_id is not null)
  ),

  -- C8.
  constraint plan_lines_planned_minor_non_negative_check check (
    planned_minor is null or planned_minor >= 0
  ),

  -- U12. Diferible, como U8 y por el mismo motivo.
  constraint plan_lines_plan_month_id_position_key
    unique (plan_month_id, position)
    deferrable initially immediate,

  -- F6. Como F2: una sola clave compuesta con cascada diferida, no el patrón
  -- de dos claves de `sheets`. Intencional, según docs/09-plan-mensual.md.
  constraint plan_lines_plan_month_same_user_fkey
    foreign key (plan_month_id, user_id)
    references public.plan_months (id, user_id)
    on delete cascade
    deferrable initially deferred,

  -- F7. Ata period_month al mes real del plan y es lo que sostiene C4.
  constraint plan_lines_plan_month_period_fkey
    foreign key (plan_month_id, period_month)
    references public.plan_months (id, period_month)
    on delete cascade,

  -- F8 y F9. Propiedad declarativa del destino, diferidas por el mismo motivo
  -- que las demás.
  constraint plan_lines_category_same_user_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete no action
    deferrable initially deferred,
  constraint plan_lines_account_same_user_fkey
    foreign key (account_id, user_id)
    references public.accounts (id, user_id)
    on delete no action
    deferrable initially deferred
);

-- U10. Una categoría alimenta una sola línea del mes. Es la barrera que hace
-- que Facturas, Variables y No planeado sean conjuntos disjuntos, y por tanto
-- que su suma dé exactamente Gastos totales.
--
-- Índice parcial y no restricción: una restricción única no admite cláusula
-- WHERE. No necesita ser diferible.
create unique index plan_lines_plan_month_id_category_id_key
  on public.plan_lines (plan_month_id, category_id)
  where category_id is not null;

-- U11. El tipo de la cuenta ya determina qué kind puede apuntarla, así que dos
-- líneas sobre una misma cuenta serían forzosamente del mismo tipo y no hace
-- falta incluir kind en la clave.
create unique index plan_lines_plan_month_id_account_id_key
  on public.plan_lines (plan_month_id, account_id)
  where account_id is not null;

-- Índices de clave foránea. Los dos únicos parciales de arriba no sirven:
-- category_id y account_id no son su primera columna.
create index plan_lines_category_id_idx on public.plan_lines (category_id);
create index plan_lines_account_id_idx on public.plan_lines (account_id);

alter table public.plan_lines enable row level security;

create trigger set_plan_lines_updated_at
  before update on public.plan_lines
  for each row execute function public.set_updated_at();

create policy "plan_lines_select_own"
  on public.plan_lines for select
  using (auth.uid() = user_id);

create policy "plan_lines_insert_own"
  on public.plan_lines for insert
  with check (auth.uid() = user_id);

create policy "plan_lines_update_own"
  on public.plan_lines for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "plan_lines_delete_own"
  on public.plan_lines for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 6. T2 — reglas de la categoría en el puente de ingresos
-- =============================================================

-- Mismo criterio que en budgets y en category_classifications: no es
-- "prohibido tocar", es **prohibido estrenar**. Y las mismas razones de forma:
-- trigger y no RPC, porque un trigger no se puede esquivar; `security invoker`,
-- para que su SELECT quede sujeto a RLS y la función no pueda convertirse en
-- una vía de lectura ajena; `search_path` vacío con nombres calificados, para
-- que un search_path manipulado no desvíe las consultas.
create function public.validate_income_source_category()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_type text;
  v_category_is_archived boolean;
  v_category_is_new boolean;
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el propietario de un vínculo de ingreso.';
  end if;

  -- Se comprueba con TG_OP en vez de con un `or` sobre OLD porque SQL no
  -- garantiza evaluación en cortocircuito y OLD no está asignado en un INSERT.
  if tg_op = 'INSERT' then
    v_category_is_new := true;
  else
    v_category_is_new := new.category_id is distinct from old.category_id;
  end if;

  if v_category_is_new then
    select c.type, c.is_archived
      into v_category_type, v_category_is_archived
    from public.categories as c
    where c.id = new.category_id
      and c.user_id = new.user_id;

    if not found then
      raise exception 'La categoría indicada no existe o no pertenece al usuario.';
    end if;

    if v_category_type <> 'income' then
      raise exception
        'Una fuente de ingreso solo puede vincularse a categorías de ingreso; la indicada es de tipo %.',
        v_category_type;
    end if;

    if v_category_is_archived then
      raise exception 'No se puede vincular una categoría archivada.';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_income_source_category_trigger
  before insert or update on public.plan_income_source_categories
  for each row execute function public.validate_income_source_category();

-- =============================================================
-- 7. T3 — reglas del destino de una línea de plan
-- =============================================================

-- C5 y C6 ya garantizan que hay exactamente un destino y que corresponde al
-- kind. Aquí quedan las reglas que dependen de atributos mutables del destino
-- —`type` e `is_archived`— y que por tanto no caben en una clave foránea.
create function public.validate_plan_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_category_type text;
  v_category_is_archived boolean;
  v_account_type text;
  v_account_is_archived boolean;
  v_target_is_new boolean;
begin
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el propietario de una línea de plan.';
  end if;

  -- El destino se estrena al insertar y al cambiar de categoría, de cuenta o de
  -- kind. Un UPDATE que solo mueve la posición o renombra la línea no vuelve a
  -- validar: por eso puede corregirse una línea histórica aunque su categoría o
  -- su cuenta se hayan archivado después.
  if tg_op = 'INSERT' then
    v_target_is_new := true;
  else
    v_target_is_new :=
      new.category_id is distinct from old.category_id
      or new.account_id is distinct from old.account_id
      or new.kind is distinct from old.kind;
  end if;

  if v_target_is_new then
    if new.category_id is not null then
      select c.type, c.is_archived
        into v_category_type, v_category_is_archived
      from public.categories as c
      where c.id = new.category_id
        and c.user_id = new.user_id;

      if not found then
        raise exception 'La categoría indicada no existe o no pertenece al usuario.';
      end if;

      if v_category_type <> 'expense' then
        raise exception
          'Una línea de plan solo puede apuntar a categorías de gasto; la indicada es de tipo %.',
          v_category_type;
      end if;

      if v_category_is_archived then
        raise exception 'No se puede planificar sobre una categoría archivada.';
      end if;
    else
      select a.type, a.is_archived
        into v_account_type, v_account_is_archived
      from public.accounts as a
      where a.id = new.account_id
        and a.user_id = new.user_id;

      if not found then
        raise exception 'La cuenta indicada no existe o no pertenece al usuario.';
      end if;

      if v_account_is_archived then
        raise exception 'No se puede planificar sobre una cuenta archivada.';
      end if;

      -- El `else` no es decorativo: si algún día se añade un kind medido por
      -- cuenta y no se actualiza esta función, debe fallar en vez de dejar
      -- pasar una línea sin validar el tipo de la cuenta.
      case new.kind
        when 'savings' then
          if v_account_type <> 'savings' then
            raise exception
              'Una línea de ahorro requiere una cuenta de tipo savings; la indicada es de tipo %.',
              v_account_type;
          end if;
        when 'investment' then
          if v_account_type <> 'investment' then
            raise exception
              'Una línea de inversión requiere una cuenta de tipo investment; la indicada es de tipo %.',
              v_account_type;
          end if;
        else
          raise exception 'Tipo de línea medido por cuenta no contemplado: %.', new.kind;
      end case;
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_plan_line_trigger
  before insert or update on public.plan_lines
  for each row execute function public.validate_plan_line();

-- =============================================================
-- 8. T4 — la suma de porcentajes del reparto
-- =============================================================

-- Un mes sin allocations es un estado válido: «distribución sin configurar».
-- Con una o más, la suma debe ser exactamente 10000 puntos base.
--
-- Es un constraint trigger diferido al commit por el mismo motivo que las
-- claves foráneas: reasignar porcentajes toca varias filas y ningún orden de
-- sentencias mantiene la suma válida en todo momento. Se dispara también en
-- DELETE, porque borrar un grupo rompe la suma igual que editarlo.
create function public.check_plan_allocations_sum()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_month_ids uuid[];
  v_plan_month_id uuid;
  v_count integer;
  v_total integer;
begin
  -- Qué meses quedan afectados por esta fila. Un UPDATE puede trasladar la
  -- asignación de un mes a otro, y entonces hay que revalidar los dos: el
  -- destino, que gana un grupo, y el origen, que lo pierde y podría quedarse
  -- por debajo de 10000 sin que nadie volviera a mirarlo. Validar solo el mes
  -- nuevo dejaría ese hueco abierto.
  --
  -- La comparación usa `is not distinct from` y no `=`: con `=`, un NULL en
  -- cualquiera de los dos lados haría que la condición fuese NULL y el traslado
  -- se colara por el ELSE equivocado.
  if tg_op = 'INSERT' then
    v_plan_month_ids := array[new.plan_month_id];
  elsif tg_op = 'DELETE' then
    v_plan_month_ids := array[old.plan_month_id];
  elsif new.plan_month_id is not distinct from old.plan_month_id then
    v_plan_month_ids := array[new.plan_month_id];
  else
    v_plan_month_ids := array[old.plan_month_id, new.plan_month_id];
  end if;

  foreach v_plan_month_id in array v_plan_month_ids loop
    -- Si el mes ya no existe, sus asignaciones desaparecieron con él por
    -- cascada y no hay nada que validar. Sin esta salida, borrar un plan
    -- mensual fallaría al commit —la suma de cero filas nunca es 10000— y el
    -- error aparecería lejos de la sentencia que lo causó.
    if not exists (
      select 1 from public.plan_months as m where m.id = v_plan_month_id
    ) then
      continue;
    end if;

    select count(*), coalesce(sum(a.percent_bp), 0)
      into v_count, v_total
    from public.plan_allocations as a
    where a.plan_month_id = v_plan_month_id;

    -- Cero filas es «sin configurar», no un error. Se distingue con count y no
    -- con la suma, porque un conjunto de filas que sumase 0 sí sería inválido.
    if v_count = 0 then
      continue;
    end if;

    if v_total <> 10000 then
      raise exception
        'Los porcentajes del reparto del mes % deben sumar 10000 puntos base; suman %.',
        v_plan_month_id, v_total;
    end if;
  end loop;

  return null;
end;
$$;

create constraint trigger check_plan_allocations_sum_trigger
  after insert or update or delete on public.plan_allocations
  deferrable initially deferred
  for each row execute function public.check_plan_allocations_sum();
