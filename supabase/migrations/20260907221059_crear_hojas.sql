-- FinTrack — Hojas de cálculo (paso 1)
--
-- Una "hoja" es una rejilla editable donde el usuario escribe gastos e
-- ingresos antes de registrarlos. Mientras una fila es borrador no existe
-- para las finanzas: no mueve saldos, ni el dashboard, ni los presupuestos,
-- ni aparece en el Libro. Solo al registrarla se convierte en un movimiento
-- real, y ese paso es explícito.
--
-- De ahí la forma del esquema:
--
--   sheets        Hoja con nombre y su configuración de columnas.
--   sheet_drafts  Filas a medio escribir. Se borran al registrarse.
--   transactions  Gana `custom_fields` para los valores de las columnas
--                 propias del usuario.
--
-- El registro no es un INSERT seguido de un DELETE desde el cliente: es la
-- función `register_sheet_draft`, atómica por fila. Dos llamadas
-- simultáneas sobre el mismo borrador —dos pestañas, un doble clic, el
-- registro por lotes de un paso posterior— insertarían el mismo gasto dos
-- veces, y un movimiento duplicado corrompe cifras financieras sin que el
-- usuario lo note.

-- =============================================================
-- 1. sheets
-- =============================================================

create table public.sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- Definición de columnas: array de objetos con id, label, type y position.
  -- Aquí solo se valida su forma exterior; ver la nota del apartado 2.
  columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sheets_name_length_check
    check (length(btrim(name)) between 1 and 80),

  constraint sheets_columns_is_array_check
    check (jsonb_typeof(columns) = 'array'),

  -- El tope de columnas se escribe con CASE, no con `... and ...`, porque
  -- `jsonb_array_length` lanza una excepción si el valor no es un array y
  -- PostgreSQL no garantiza el orden de evaluación de los operandos de AND.
  -- Con AND, un `columns` escalar podría fallar con "cannot get array length
  -- of a scalar" en vez de con la restricción que le corresponde. CASE sí
  -- garantiza que la rama solo se evalúa cuando la condición se cumple.
  constraint sheets_columns_max_check
    check (
      case
        when jsonb_typeof(columns) = 'array' then jsonb_array_length(columns) <= 20
        else false
      end
    )
);

-- `id` ya es única por ser clave primaria, así que esta restricción no cambia
-- qué filas son válidas. Existe porque una clave foránea compuesta necesita
-- una restricción única que cubra exactamente sus columnas de destino, y es
-- lo que permite delegar en la base de datos la garantía de que un borrador
-- solo puede colgar de una hoja del mismo usuario.
alter table public.sheets
  add constraint sheets_id_user_id_key unique (id, user_id);

-- Listar las hojas del usuario y, sobre todo, evitar que borrar una cuenta
-- obligue a recorrer la tabla entera: PostgreSQL no indexa las claves
-- foráneas por su cuenta.
create index sheets_user_id_idx on public.sheets (user_id);

-- =============================================================
-- 2. sheet_drafts
-- =============================================================
--
-- Sobre la validación de `columns` y de `cells`: la base de datos comprueba
-- solo la forma exterior —array, tope de 20, objeto—. Las reglas internas
-- (ids únicos, slugs con formato, posiciones sin huecos, ids que no pisen un
-- campo financiero) viven en la capa de aplicación, donde se expresan sin
-- retorcer SQL/JSON path hasta volverlo ilegible.
--
-- Esa decisión no abre un agujero: aunque `columns` acabara mal formada,
-- `register_sheet_draft` reconstruye `custom_fields` recorriendo la
-- definición y quedándose solo con entradas cuyo `id` sea texto, cuyo `type`
-- sea 'text' y cuyo slug no sea uno de los campos financieros. Lo que no pase
-- ese filtro no llega nunca a `transactions`.

create table public.sheet_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sheet_id uuid not null,
  -- Orden dentro de la hoja. Entero, no fraccionario: reordenar es cosa de
  -- una RPC futura (ver docs/07-hojas.md), no de esta fase.
  position integer not null,
  -- Valores de la fila, indexados por la clave de cada columna. Se llama
  -- `cells` y no `values` porque VALUES es palabra reservada en SQL y
  -- obligaría a entrecomillar el identificador en cada consulta, en cada
  -- política y en cada `select` de PostgREST.
  cells jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sheet_drafts_position_check check (position >= 0),

  constraint sheet_drafts_cells_is_object_check
    check (jsonb_typeof(cells) = 'object'),

  -- Borrar una hoja se lleva sus borradores.
  constraint sheet_drafts_sheet_id_fkey
    foreign key (sheet_id) references public.sheets (id) on delete cascade,

  -- Propiedad declarativa: la hoja debe pertenecer al mismo usuario que el
  -- borrador. Al ser una clave foránea, PostgreSQL la aplica siempre, incluso
  -- a una conexión que no pase por RLS.
  --
  -- Es `deferrable initially deferred` por la misma razón que en budgets: al
  -- borrar un usuario de auth.users, la cascada elimina sheets y sheet_drafts
  -- dentro de la misma sentencia y, en el punto intermedio, un borrador puede
  -- referenciar una hoja ya borrada. Comprobada al commit, la comprobación
  -- solo ve el estado final. Y es `no action`, no `restrict`: ambas impiden
  -- dejar referencias colgando, pero `restrict` comprueba de inmediato y no
  -- admite diferimiento.
  constraint sheet_drafts_sheet_same_user_fkey
    foreign key (sheet_id, user_id) references public.sheets (id, user_id)
    on delete no action
    deferrable initially deferred,

  -- Una posición por hoja. Deferible porque reordenar filas intercambia
  -- posiciones y el estado intermedio tiene duplicados aunque el final sea
  -- válido; la futura RPC de reordenamiento diferirá esta comprobación dentro
  -- de su transacción. `initially immediate`: en el uso normal se comprueba
  -- al instante.
  --
  -- Coste conocido: una restricción única deferible NO sirve como destino de
  -- inferencia en `ON CONFLICT`. Aquí no se usa para eso.
  constraint sheet_drafts_sheet_position_key
    unique (sheet_id, position) deferrable initially immediate
);

-- Igual que en sheets: para la cascada de borrado de usuario.
--
-- No se crea un índice sobre (sheet_id, position): la restricción única
-- anterior ya genera uno, y ese mismo índice resuelve la lectura ordenada de
-- los borradores de una hoja.
create index sheet_drafts_user_id_idx on public.sheet_drafts (user_id);

-- =============================================================
-- 3. transactions.custom_fields
-- =============================================================
--
-- Valores de las columnas propias del usuario, guardados junto al movimiento.
-- Los movimientos que ya existen reciben '{}' y ningún campo financiero
-- cambia de tipo, de default ni de significado.
--
-- Sin índice GIN, deliberadamente. Todavía no hay filtrado real por estos
-- campos, y el índice correcto depende del operador que acabe usándose:
-- `->>` con igualdad pide un índice de expresión y `@>` pide jsonb_path_ops.
-- Son índices distintos; elegir a ciegas encarece cada escritura sin
-- beneficio. El criterio para añadirlo está en docs/07-hojas.md.

alter table public.transactions
  add column custom_fields jsonb not null default '{}'::jsonb;

alter table public.transactions
  add constraint transactions_custom_fields_is_object_check
  check (jsonb_typeof(custom_fields) = 'object');

-- =============================================================
-- 4. updated_at
-- =============================================================

-- Reutiliza la función creada en la migración inicial; no se redefine.
create trigger set_sheets_updated_at
  before update on public.sheets
  for each row execute function public.set_updated_at();

create trigger set_sheet_drafts_updated_at
  before update on public.sheet_drafts
  for each row execute function public.set_updated_at();

-- =============================================================
-- 5. RLS
-- =============================================================
--
-- No se añaden GRANT de tabla: las cuatro tablas del esquema inicial se
-- apoyan en los privilegios por defecto del esquema public de Supabase y RLS
-- es la barrera real. Mantener el mismo criterio evita dos modelos de
-- permisos conviviendo. Si esos privilegios faltasen, las pruebas 16-20
-- fallarían de forma ruidosa, no silenciosa.

alter table public.sheets enable row level security;

create policy "sheets_select_own"
  on public.sheets for select
  using (auth.uid() = user_id);

create policy "sheets_insert_own"
  on public.sheets for insert
  with check (auth.uid() = user_id);

create policy "sheets_update_own"
  on public.sheets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "sheets_delete_own"
  on public.sheets for delete
  using (auth.uid() = user_id);

alter table public.sheet_drafts enable row level security;

create policy "sheet_drafts_select_own"
  on public.sheet_drafts for select
  using (auth.uid() = user_id);

create policy "sheet_drafts_insert_own"
  on public.sheet_drafts for insert
  with check (auth.uid() = user_id);

create policy "sheet_drafts_update_own"
  on public.sheet_drafts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "sheet_drafts_delete_own"
  on public.sheet_drafts for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 6. register_sheet_draft
-- =============================================================
--
-- Convierte un borrador en un movimiento, o explica por qué no puede.
--
-- Devuelve uno de tres resultados, siempre como jsonb:
--
--   {"status":"registered","draft_id":"…","transaction_id":"…"}
--   {"status":"invalid","draft_id":"…","errors":[{"field":"…","code":"…"}]}
--   {"status":"not_found","draft_id":"…"}
--
-- Los fallos de validación se DEVUELVEN, no se lanzan. Lanzarlos abortaría la
-- transacción y obligaría al cliente a interpretar textos en español, que es
-- exactamente el punto frágil que ya arrastramos en el mapeo de errores de
-- presupuestos. Los fallos inesperados —violación de clave foránea, el
-- trigger de transactions, un permiso que falta— sí se propagan como
-- excepción y abortan: ahí queremos que nada quede a medias.
--
-- Los códigos son estables y no exponen SQLSTATE, nombres de índices, de
-- políticas ni de restricciones. La traducción a mensajes es cosa de la
-- interfaz.
--
-- Deliberadamente NO es `security definer`: al ejecutarse con los permisos de
-- quien llama, sus consultas quedan sujetas a RLS y la función no puede
-- convertirse en una vía para leer o escribir datos ajenos. Con `security
-- definer` habría que replicar a mano el control de acceso, que es justo
-- donde suelen aparecer los agujeros.
--
-- `search_path = ''` con los nombres calificados impide que un search_path
-- manipulado desvíe las consultas a un esquema suplantado. El trigger
-- `validate_transaction` que se dispara al insertar hereda ese search_path
-- vacío, y funciona porque sus consultas ya están calificadas con `public.`.
--
-- Las comprobaciones de pertenencia y de tipo de categoría duplican lo que
-- `validate_transaction` ya garantiza. La autoridad sigue siendo el trigger:
-- estas existen solo para poder devolver un código por campo en vez de un
-- P0001 con texto libre.

create function public.register_sheet_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_draft public.sheet_drafts;
  v_columns jsonb;

  -- Un código por campo, en vez de ir apilando en un array, para poder
  -- emitirlos siempre en el mismo orden aunque se detecten en otro. El
  -- type_mismatch de la categoría, por ejemplo, no se conoce hasta haber
  -- leído el tipo de movimiento.
  v_err_date text;
  v_err_description text;
  v_err_notes text;
  v_err_account text;
  v_err_category text;
  v_err_type text;
  v_err_amount text;

  v_date_text text;
  v_account_text text;
  v_category_text text;
  v_amount_text text;

  v_date date;
  v_description text;
  v_account_id uuid;
  v_category_id uuid;
  v_type text;
  v_amount numeric;
  v_notes text;

  v_category_type text;

  v_custom jsonb := '{}'::jsonb;
  v_custom_errors jsonb := '[]'::jsonb;
  v_column jsonb;
  v_slug text;
  v_value text;

  v_errors jsonb := '[]'::jsonb;
  v_transaction_id uuid;

  -- Claves que ya tienen significado financiero. Una columna propia con uno
  -- de estos identificadores secuestraría el campo real.
  c_reserved constant text[] := array[
    'transaction_date', 'description', 'account_id',
    'category_id', 'type', 'amount_minor', 'notes'
  ];
  c_uuid constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  -- Solo ISO, y con ceros a la izquierda. Ver la nota del bloque de fecha.
  c_iso_date constant text := '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

  -- Topes de longitud. La base de datos no los impone sobre `text`, así que
  -- sin esto una celda pegada desde otro sitio podría guardar megabytes.
  c_max_description constant integer := 250;
  c_max_notes constant integer := 1000;
  c_max_custom constant integer := 1000;
begin
  if v_user_id is null then
    raise exception 'register_sheet_draft requiere una sesión autenticada.';
  end if;

  -- `for update` es lo que impide el registro doble. Sin él, dos llamadas
  -- simultáneas leen el mismo borrador, ambas insertan y una borra: el gasto
  -- queda registrado dos veces. Con él, la segunda espera; cuando la primera
  -- confirma, el borrador ya no está y la segunda devuelve not_found.
  select * into v_draft
  from public.sheet_drafts
  where id = p_draft_id
    and user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found', 'draft_id', p_draft_id);
  end if;

  -- La clave foránea garantiza que la hoja existe; RLS, que es del usuario.
  select s.columns into v_columns
  from public.sheets s
  where s.id = v_draft.sheet_id;

  if not found then
    return jsonb_build_object('status', 'not_found', 'draft_id', p_draft_id);
  end if;

  -- ---------- transaction_date ----------
  v_date_text := nullif(btrim(coalesce(v_draft.cells ->> 'transaction_date', '')), '');

  if v_date_text is null then
    v_err_date := 'required';
  elsif v_date_text !~ c_iso_date then
    -- Solo ISO YYYY-MM-DD, y la comprobación va antes del cast porque
    -- PostgreSQL acepta bastante más que eso según el DateStyle de la sesión:
    -- '07/09/2026' se interpretaría como julio o como septiembre según la
    -- configuración del servidor, y '2026-2-7' pasaría sin ceros. Un gasto
    -- guardado en el mes equivocado es un error silencioso y caro.
    v_err_date := 'invalid_date';
  else
    -- La forma correcta no garantiza que la fecha exista: '2026-02-31' pasa
    -- la expresión regular y no es un día real. Se intenta el cast y se
    -- captura solo el fallo de formato o de rango, no cualquier error.
    begin
      v_date := v_date_text::date;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        v_err_date := 'invalid_date';
    end;
  end if;

  -- ---------- description ----------
  v_description := nullif(btrim(coalesce(v_draft.cells ->> 'description', '')), '');

  if v_description is null then
    v_err_description := 'required';
  elsif length(v_description) > c_max_description then
    v_err_description := 'description_too_long';
  end if;

  -- ---------- notes ----------
  -- Opcional, pero si viene se le exige un tope: `text` no lo tiene.
  v_notes := nullif(btrim(coalesce(v_draft.cells ->> 'notes', '')), '');

  if v_notes is not null and length(v_notes) > c_max_notes then
    v_err_notes := 'notes_too_long';
  end if;

  -- ---------- type ----------
  -- Se resuelve antes que la categoría porque su tipo depende de este.
  v_type := nullif(btrim(coalesce(v_draft.cells ->> 'type', '')), '');

  if v_type is null then
    v_err_type := 'required';
  elsif v_type = 'transfer' then
    -- Una transferencia necesita dos cuentas y el esquema le prohíbe tener
    -- categoría. Se rechaza aquí, no solo en la interfaz, para que un cliente
    -- manipulado tampoco pueda crearla desde una hoja.
    v_err_type := 'transfer_not_allowed';
  elsif v_type not in ('income', 'expense') then
    v_err_type := 'invalid_type';
  end if;

  -- ---------- account_id ----------
  v_account_text := nullif(btrim(coalesce(v_draft.cells ->> 'account_id', '')), '');

  if v_account_text is null then
    v_err_account := 'required';
  elsif v_account_text !~ c_uuid then
    v_err_account := 'invalid_uuid';
  else
    v_account_id := v_account_text::uuid;

    perform 1
    from public.accounts a
    where a.id = v_account_id
      and a.user_id = v_user_id;

    if not found then
      v_err_account := 'account_not_found';
    end if;
  end if;

  -- ---------- category_id ----------
  -- Obligatoria para registrar, aunque la columna admita nulos y aunque un
  -- borrador pueda estar sin ella: es el mismo criterio que el formulario de
  -- movimientos.
  v_category_text := nullif(btrim(coalesce(v_draft.cells ->> 'category_id', '')), '');

  if v_category_text is null then
    v_err_category := 'required';
  elsif v_category_text !~ c_uuid then
    v_err_category := 'invalid_uuid';
  else
    v_category_id := v_category_text::uuid;

    select c.type into v_category_type
    from public.categories c
    where c.id = v_category_id
      and c.user_id = v_user_id;

    if not found then
      v_err_category := 'category_not_found';
    elsif v_type in ('income', 'expense') and v_category_type <> v_type then
      v_err_category := 'type_mismatch';
    end if;
  end if;

  -- ---------- amount_minor ----------
  v_amount_text := nullif(btrim(coalesce(v_draft.cells ->> 'amount_minor', '')), '');

  if v_amount_text is null then
    v_err_amount := 'required';
  elsif v_amount_text !~ '^-?[0-9]+$' then
    -- Se valida el texto antes de castear: 'abc'::bigint lanzaría una
    -- excepción y rompería el contrato de retorno estructurado. Los decimales
    -- también caen aquí, y es correcto: COP no los tiene.
    v_err_amount := 'invalid_amount';
  else
    -- numeric, no bigint: una cifra de treinta dígitos desbordaría bigint en
    -- el propio cast, antes de poder comprobar el rango.
    v_amount := v_amount_text::numeric;

    if v_amount <= 0 then
      v_err_amount := 'not_positive';
    elsif v_amount > 9223372036854775807 then
      v_err_amount := 'invalid_amount';
    end if;
  end if;

  -- ---------- custom_fields ----------
  -- Se construye desde la definición de columnas, no desde las claves de
  -- `cells`. Así una clave que nadie declaró —una errata, o algo escrito por
  -- un cliente manipulado— no se cuela como campo fantasma, y una definición
  -- mal formada no puede contaminar transactions.
  --
  -- Va antes del reparto de errores porque también puede producirlos: un valor
  -- demasiado largo se informa, no se recorta ni se descarta en silencio.
  for v_column in select value from jsonb_array_elements(v_columns)
  loop
    continue when jsonb_typeof(v_column) <> 'object';
    continue when jsonb_typeof(v_column -> 'id') <> 'string';
    continue when (v_column ->> 'type') is distinct from 'text';

    v_slug := v_column ->> 'id';

    continue when v_slug = any (c_reserved);
    -- `jsonb_exists(...)` en vez del operador `?`: es la misma comprobación,
    -- pero `?` lo interpretan como marcador de parámetro algunos clientes y
    -- herramientas de migración, y ese fallo aparecería al desplegar, no aquí.
    continue when not jsonb_exists(v_draft.cells, v_slug);

    -- `->>` normaliza cualquier escalar a su texto; las columnas propias son
    -- de texto libre en esta fase.
    v_value := v_draft.cells ->> v_slug;
    continue when v_value is null;

    if length(v_value) > c_max_custom then
      -- El campo se identifica como custom_fields.<slug> para que la interfaz
      -- sepa a qué celda señalar sin ambigüedad con los campos financieros.
      v_custom_errors := v_custom_errors || jsonb_build_object(
        'field', 'custom_fields.' || v_slug,
        'code', 'custom_field_too_long'
      );
      continue;
    end if;

    v_custom := v_custom || jsonb_build_object(v_slug, v_value);
  end loop;

  -- ---------- ¿hay errores? ----------
  -- Se emiten en orden de columna para que el resultado sea determinista, y
  -- se emiten todos: quien corrige una fila quiere ver de una vez lo que le
  -- falta, no descubrirlo de uno en uno. Las columnas propias van al final,
  -- en el orden en que aparecen en la definición de la hoja.
  if v_err_date is not null then
    v_errors := v_errors || jsonb_build_object('field', 'transaction_date', 'code', v_err_date);
  end if;
  if v_err_description is not null then
    v_errors := v_errors || jsonb_build_object('field', 'description', 'code', v_err_description);
  end if;
  if v_err_notes is not null then
    v_errors := v_errors || jsonb_build_object('field', 'notes', 'code', v_err_notes);
  end if;
  if v_err_account is not null then
    v_errors := v_errors || jsonb_build_object('field', 'account_id', 'code', v_err_account);
  end if;
  if v_err_category is not null then
    v_errors := v_errors || jsonb_build_object('field', 'category_id', 'code', v_err_category);
  end if;
  if v_err_type is not null then
    v_errors := v_errors || jsonb_build_object('field', 'type', 'code', v_err_type);
  end if;
  if v_err_amount is not null then
    v_errors := v_errors || jsonb_build_object('field', 'amount_minor', 'code', v_err_amount);
  end if;

  v_errors := v_errors || v_custom_errors;

  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object(
      'status', 'invalid',
      'draft_id', p_draft_id,
      'errors', v_errors
    );
  end if;

  -- ---------- registro ----------
  insert into public.transactions (
    user_id,
    account_id,
    category_id,
    type,
    amount_minor,
    transaction_date,
    description,
    notes,
    custom_fields
  )
  values (
    v_user_id,
    v_account_id,
    v_category_id,
    v_type,
    v_amount::bigint,
    v_date,
    v_description,
    v_notes,
    v_custom
  )
  returning id into v_transaction_id;

  -- Solo después de que la inserción haya salido bien, y en la misma
  -- transacción: si el insert falla, la excepción aborta y el borrador sigue
  -- donde estaba.
  delete from public.sheet_drafts where id = p_draft_id;

  return jsonb_build_object(
    'status', 'registered',
    'draft_id', p_draft_id,
    'transaction_id', v_transaction_id
  );
end;
$$;

-- =============================================================
-- 7. Permisos de la función
-- =============================================================
--
-- PostgreSQL concede EXECUTE a PUBLIC por defecto, así que sin este revoke la
-- función quedaría al alcance de cualquier rol, `anon` incluido. El revoke a
-- anon es redundante tras el de public y se deja como documentación viva de
-- la intención.

revoke all on function public.register_sheet_draft(uuid) from public;
revoke all on function public.register_sheet_draft(uuid) from anon;
grant execute on function public.register_sheet_draft(uuid) to authenticated;
