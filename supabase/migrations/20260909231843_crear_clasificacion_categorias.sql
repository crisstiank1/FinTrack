-- FinTrack — Clasificación de categorías (Fase 8.7, migración M2)
--
-- Crea public.category_classifications: la tabla que asigna cada categoría de
-- gasto a un grupo del reparto del Plan mensual. Es el único lugar del esquema
-- donde vive la noción de deuda.
--
-- No crea ninguna otra tabla del Plan mensual. No toca accounts, budgets,
-- sheets, transactions ni categories. No modifica datos existentes.
--
-- **Solo forward.** Esta migración no incluye SQL de reversión. El rollback
-- manual está documentado en docs/09-plan-mensual.md.
--
-- Verificado contra el esquema remoto antes de escribirse:
--   - public.categories tiene categories_id_user_id_key con UNIQUE (id, user_id).
--   - public.category_classifications no existe (to_regclass devolvió null).

-- =============================================================
-- 1. category_classifications
-- =============================================================

create table public.category_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null,
  -- 'budget_group' y no 'group': GROUP es palabra reservada y obligaría a
  -- entrecomillarla en cada consulta.
  --
  -- Solo tres valores. 'savings' e 'investment' no se clasifican por categoría:
  -- se miden por transferencias registradas hacia cuentas del tipo
  -- correspondiente. Admitirlos aquí abriría una segunda vía de cálculo para el
  -- mismo importe, que es exactamente como aparece el doble conteo.
  budget_group text not null
    check (budget_group in ('needs', 'wants', 'debt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Una categoría pertenece a un solo grupo. Esta restricción es la barrera
  -- estructural contra el doble conteo en el reparto: sin ella, un mismo gasto
  -- podría sumar en dos grupos a la vez.
  constraint category_classifications_user_id_category_id_key
    unique (user_id, category_id),

  -- Propiedad declarativa: la categoría debe pertenecer al mismo usuario que la
  -- clasificación. Al ser una clave foránea, PostgreSQL la aplica siempre,
  -- incluso a un superusuario o a una conexión que no pase por RLS.
  --
  -- La comprobación es `deferrable initially deferred`: no ocurre al terminar
  -- cada sentencia, sino al commit de la transacción. Eso es lo que protege el
  -- borrado en cascada desde auth.users. Con la semántica inmediata, eliminar un
  -- usuario dispara a la vez las cascadas sobre categories y sobre
  -- category_classifications dentro de una misma sentencia; si en el punto
  -- intermedio una clasificación todavía referencia una categoría ya borrada, la
  -- operación falla a mitad de camino aunque al final no quede ninguna
  -- referencia colgante. Diferida al commit, la cadena de borrado completa tiene
  -- oportunidad de terminar y la comprobación solo ve el estado final, que sí es
  -- consistente.
  --
  -- La diferibilidad de esta clave es independiente de la del índice al que
  -- apunta: categories_id_user_id_key es un UNIQUE no diferible y sirve
  -- igualmente como destino. Es el mismo patrón que
  -- budgets_category_same_user_fkey usa desde la Fase 8.
  --
  -- `no action`, no `restrict`, y la diferencia importa: ambas impiden borrar
  -- una categoría que conserve clasificaciones cuando la clave se comprueba,
  -- pero `restrict` comprueba de inmediato y no admite diferimiento, mientras
  -- que `no action`, tal como se declara aquí, hereda la comprobación diferida.
  constraint category_classifications_category_same_user_fkey
    foreign key (category_id, user_id)
    references public.categories (id, user_id)
    on delete no action
    deferrable initially deferred
);

-- =============================================================
-- 2. Índices
-- =============================================================

-- PostgreSQL no crea índices automáticamente para las claves foráneas. Sin
-- este, borrar o archivar categorías en bloque obligaría a recorrer la tabla
-- entera para comprobar la clave. El índice único anterior no sirve:
-- category_id no es su primera columna.
create index category_classifications_category_id_idx
  on public.category_classifications (category_id);

-- No se añaden más índices. Cargar todas las clasificaciones de un usuario se
-- apoya en el prefijo user_id del índice único; añadir otros encarecería la
-- escritura sin una consulta que los justifique.

-- =============================================================
-- 3. updated_at
-- =============================================================

-- Reutiliza la función creada en la migración inicial; no se redefine.
create trigger set_category_classifications_updated_at
  before update on public.category_classifications
  for each row execute function public.set_updated_at();

-- =============================================================
-- 4. RLS
-- =============================================================

alter table public.category_classifications enable row level security;

create policy "category_classifications_select_own"
  on public.category_classifications for select
  using (auth.uid() = user_id);

create policy "category_classifications_insert_own"
  on public.category_classifications for insert
  with check (auth.uid() = user_id);

create policy "category_classifications_update_own"
  on public.category_classifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "category_classifications_delete_own"
  on public.category_classifications for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 5. Reglas de negocio sobre la categoría
-- =============================================================

-- La pertenencia al usuario ya la garantiza la clave foránea compuesta. Aquí
-- quedan las reglas que dependen de atributos mutables de la categoría —`type`
-- e `is_archived`— y que, por tanto, no caben en una clave foránea, más la
-- prohibición de transferir la propiedad de una fila.
--
-- Las dos reglas sobre la categoría siguen el mismo criterio que en budgets: no
-- es "prohibido tocar", es **prohibido estrenar**. Se deniega al insertar y al
-- apuntar a otra categoría; se permite seguir editando una clasificación que
-- conserva la suya, aunque después esa categoría se haya archivado o se le haya
-- cambiado el tipo. Sin esa distinción, archivar una categoría dejaría sus
-- meses ya cerrados sin poder corregirse.
--
-- Se implementa como trigger y no como RPC porque un trigger no se puede
-- esquivar: se ejecuta en cualquier INSERT o UPDATE, venga del cliente o de
-- donde venga. Una RPC solo protege a quien decide llamarla.
--
-- Deliberadamente NO es `security definer`: al ejecutarse con los permisos de
-- quien llama, su SELECT sobre categories queda sujeto a RLS y la función no
-- puede convertirse en una vía para leer datos ajenos. Con `security definer`
-- habría que replicar a mano el control de acceso, que es justo donde suelen
-- aparecer los agujeros.
--
-- `search_path = ''` con los nombres calificados impide que un search_path
-- manipulado desvíe las consultas a un esquema suplantado.
create function public.validate_category_classification()
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
  -- La propiedad de una fila no se transfiere. Permitir cambiar user_id dejaría
  -- que un usuario empujase una clasificación al espacio de otro; el WITH CHECK
  -- de la política lo impediría desde el cliente, pero esta comprobación no
  -- depende de que la escritura pase por RLS.
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'No se puede cambiar el propietario de una clasificación.';
  end if;

  -- ¿Esta fila está estrenando categoría? Se comprueba con TG_OP en vez de con
  -- un `or` sobre OLD porque SQL no garantiza evaluación en cortocircuito y OLD
  -- no está asignado durante un INSERT.
  if tg_op = 'INSERT' then
    v_category_is_new := true;
  else
    v_category_is_new := new.category_id is distinct from old.category_id;
  end if;

  -- La categoría solo se consulta cuando se estrena. Un UPDATE que únicamente
  -- cambia budget_group no la mira: por eso puede corregirse la clasificación de
  -- una categoría archivada, o que hoy sería de ingreso, sin que el trigger lo
  -- impida.
  if v_category_is_new then
    select c.type, c.is_archived
      into v_category_type, v_category_is_archived
    from public.categories as c
    where c.id = new.category_id
      and c.user_id = new.user_id;

    -- Si la categoría no es visible —no existe, o RLS la oculta por ser de otro
    -- usuario— no hay nada que validar contra ella.
    if not found then
      raise exception 'La categoría indicada no existe o no pertenece al usuario.';
    end if;

    if v_category_type <> 'expense' then
      raise exception
        'Solo se pueden clasificar categorías de gasto; la indicada es de tipo %.',
        v_category_type;
    end if;

    if v_category_is_archived then
      raise exception 'No se puede clasificar una categoría archivada.';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_category_classification_trigger
  before insert or update on public.category_classifications
  for each row execute function public.validate_category_classification();
