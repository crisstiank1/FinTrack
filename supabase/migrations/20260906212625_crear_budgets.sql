-- FinTrack — Presupuestos (Fase 8, paso 1)
--
-- Modelo histórico: una modificación de plantilla crea una versión nueva
-- vigente desde el mes actual y no altera las anteriores, para que el progreso
-- de un mes ya cerrado nunca cambie de forma retroactiva.
--
-- Dos tipos de fila, distinguidos por period_month:
--
--   period_month IS NULL     -> plantilla, vigente desde effective_from en
--                               adelante hasta que otra versión la reemplace.
--   period_month IS NOT NULL -> excepción, sobrescribe a la plantilla
--                               únicamente en ese mes.
--
-- Resolución para un mes M y una categoría C:
--   1. La excepción de (C, M) si existe.
--   2. Si no, la plantilla de C con el effective_from más reciente <= M.
--   3. Si no hay ninguna, esa categoría no tiene presupuesto en M.
--
-- amount_minor = 0 es válido y significa "sin presupuesto para esta categoría
-- durante este mes"; sirve para anular la plantilla en un mes concreto.

-- =============================================================
-- 1. Requisito para la clave foránea compuesta
-- =============================================================

-- `id` ya es única por ser clave primaria, así que esta restricción no
-- cambia qué filas son válidas. Existe porque una clave foránea compuesta
-- necesita una restricción única que cubra exactamente sus columnas de
-- destino, y es lo que permite delegar en la base de datos la garantía de
-- que un presupuesto solo puede apuntar a una categoría del mismo usuario.
alter table public.categories
  add constraint categories_id_user_id_key unique (id, user_id);

-- =============================================================
-- 2. budgets
-- =============================================================

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  -- NULL = plantilla. Si no, primer día del mes que sobrescribe.
  period_month date,
  -- Primer mes en que la fila entra en vigor.
  effective_from date not null,
  -- Unidades mínimas de la moneda, igual que en transactions y accounts.
  -- bigint, nunca punto flotante: los montos deben ser exactos.
  amount_minor bigint not null check (amount_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Ambas fechas representan meses, no días sueltos, y se validan comparando
  -- contra su propio truncado a mes. Sin esto, '2026-09-15' y '2026-09-01'
  -- serían dos valores distintos para los índices únicos y la misma categoría
  -- podría acabar con dos presupuestos en septiembre.
  --
  -- El cast explícito a `timestamp` no es decorativo. Con un argumento `date`,
  -- PostgreSQL resuelve `date_trunc` hacia la variante `timestamptz`, que es
  -- STABLE por depender de la zona horaria, y una restricción CHECK exige
  -- funciones IMMUTABLE: la migración fallaría al crearse. Al forzar
  -- `timestamp` se usa la variante inmutable, con el mismo significado.
  constraint budgets_period_month_is_month_start_check check (
    period_month is null
    or period_month = date_trunc('month', period_month::timestamp)::date
  ),
  constraint budgets_effective_from_is_month_start_check check (
    effective_from = date_trunc('month', effective_from::timestamp)::date
  ),

  -- En una excepción, effective_from no aporta información propia: la fila
  -- vale para ese mes y solo para ese mes. Anclarlos evita filas con dos
  -- fechas contradictorias que después habría que interpretar.
  constraint budgets_exception_dates_match_check check (
    period_month is null or effective_from = period_month
  ),

  -- Ownership declarativo: la categoría debe pertenecer al mismo usuario que
  -- el presupuesto. Al ser una clave foránea, PostgreSQL la aplica siempre,
  -- incluso a un superusuario o a una conexión que no pase por RLS.
  --
  -- La comprobación es `deferrable initially deferred`: no ocurre al terminar
  -- cada sentencia, sino recién al commit de la transacción. Por defecto una
  -- FK es NOT DEFERRABLE / INITIALLY IMMEDIATE y se comprueba cuando cada
  -- sentencia termina; con esa semántica, al borrar un usuario de auth.users
  -- la cascada elimina categories y budgets dentro de la misma sentencia y,
  -- si en el punto intermedio un presupuesto todavía referencia a una
  -- categoría ya borrada, la operación fallaría a mitad de camino aunque al
  -- final no quedasen referencias. Diferida al commit, la cadena de borrado
  -- completa tiene oportunidad de terminar y la comprobación solo ve el
  -- estado final de la transacción.
  --
  -- `no action`, no `restrict`, y la diferencia importa: ambas impiden borrar
  -- una categoría que conserve presupuestos cuando la FK se comprueba, pero
  -- `restrict` comprueba de inmediato y no admite diferimiento, mientras que
  -- `no action`, tal como se declara aquí, hereda la comprobación diferida.
  constraint budgets_category_same_user_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete no action
    deferrable initially deferred
);

-- =============================================================
-- 3. Índices
-- =============================================================

-- Una sola plantilla por usuario, categoría y mes de entrada en vigor.
-- Además de garantizar unicidad, este índice resuelve el paso 2 de la
-- resolución: con user_id y category_id fijos, el recorrido descendente por
-- effective_from encuentra la versión vigente sin ordenar en memoria.
create unique index budgets_template_unique_idx
  on public.budgets (user_id, category_id, effective_from)
  where period_month is null;

-- Una sola excepción por usuario, categoría y mes.
-- Resuelve también el paso 1 de la resolución mediante búsqueda directa.
-- Una consulta con `period_month = <fecha>` implica `period_month is not
-- null`, así que el planificador puede usar este índice parcial.
create unique index budgets_exception_unique_idx
  on public.budgets (user_id, category_id, period_month)
  where period_month is not null;

-- PostgreSQL no crea índices automáticamente para las claves foráneas. Sin
-- este, borrar o archivar en bloque categorías obligaría a recorrer budgets
-- entera para comprobar la clave foránea. Los dos índices anteriores no
-- sirven: category_id no es su primera columna.
create index budgets_category_id_idx on public.budgets (category_id);

-- No se añaden más índices. Cargar todos los presupuestos de un usuario para
-- un mes se apoya en el prefijo `user_id` de los dos índices únicos; añadir
-- índices extra encarecería la escritura sin una consulta que los justifique.

-- =============================================================
-- 4. updated_at
-- =============================================================

-- Reutiliza la función creada en la migración inicial; no se redefine.
create trigger set_budgets_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- =============================================================
-- 5. RLS
-- =============================================================

alter table public.budgets enable row level security;

create policy "budgets_select_own"
  on public.budgets for select
  using (auth.uid() = user_id);

create policy "budgets_insert_own"
  on public.budgets for insert
  with check (auth.uid() = user_id);

create policy "budgets_update_own"
  on public.budgets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "budgets_delete_own"
  on public.budgets for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 6. Reglas de negocio sobre la categoría
-- =============================================================

-- La pertenencia al usuario ya la garantiza la clave foránea compuesta. Aquí
-- quedan las dos reglas que dependen de atributos mutables de la categoría y
-- que, por tanto, no caben en una clave foránea: `type` e `is_archived`.
--
-- Las dos siguen la misma regla: no es "prohibido tocar", es "prohibido
-- estrenar". Se deniega al insertar y al cambiar de categoría hacia una
-- categoría de tipo income o archivada; se permite seguir editando un
-- presupuesto histórico que conserva su categoría, aunque después esa
-- categoría se haya archivado o se le haya cambiado el tipo.
--
-- Se implementa como trigger y no como RPC porque un trigger no se puede
-- esquivar: se ejecuta en cualquier INSERT o UPDATE, venga del cliente o de
-- donde venga. Una RPC solo protege a quien decide llamarla.
--
-- Deliberadamente NO es `security definer`: al ejecutarse con los permisos de
-- quien llama, su SELECT sobre categories queda sujeto a RLS y la función no
-- puede convertirse en una vía para leer o alterar datos ajenos. Con
-- `security definer` habría que replicar a mano el control de acceso, que es
-- justo donde suelen aparecer los agujeros.
--
-- `search_path = ''` con los nombres calificados impide que un search_path
-- manipulado desvíe las consultas a un esquema suplantado.
create function public.validate_budget()
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
  select type, is_archived
    into v_category_type, v_category_is_archived
  from public.categories
  where id = new.category_id;

  -- Si la categoría no es visible (no existe, o RLS la oculta por ser de otro
  -- usuario), no hay nada que validar contra ella.
  if not found then
    raise exception 'La categoría indicada no existe o no pertenece al usuario.';
  end if;

  -- ¿Esta fila está estrenando categoría? Se comprueba con TG_OP en vez de
  -- con un `or` sobre OLD porque SQL no garantiza evaluación en cortocircuito
  -- y OLD no está asignado durante un INSERT.
  if tg_op = 'INSERT' then
    v_category_is_new := true;
  else
    v_category_is_new := new.category_id is distinct from old.category_id;
  end if;

  -- Los atributos mutables de la categoría — `type` e `is_archived` — se
  -- validan solo cuando la fila estrena categoría: en un INSERT y en un
  -- UPDATE que cambia category_id, la nueva categoría debe ser de gasto y no
  -- estar archivada. Un UPDATE que conserva la misma categoría permite
  -- corregir un presupuesto histórico aunque después esa categoría se haya
  -- archivado o se le haya cambiado el tipo: sin esta distinción, corregir
  -- esos presupuestos pasados sería imposible. Consultar y borrarlos siempre
  -- se permite: DELETE no dispara este trigger y SELECT no pasa por él.
  if v_category_is_new then
    if v_category_type <> 'expense' then
      raise exception
        'Solo se pueden presupuestar categorías de gasto; la indicada es de tipo %.',
        v_category_type;
    end if;

    if v_category_is_archived then
      raise exception 'No se puede presupuestar una categoría archivada.';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_budget_trigger
  before insert or update on public.budgets
  for each row execute function public.validate_budget();
