-- FinTrack Coach — Consentimiento, cuota e historial (Fase 4, migración 1)
--
-- Las tres cosas que faltan para poder abrir la ruta de IA, juntas porque
-- comparten política de retención y porque ninguna sirve sin las otras: sin
-- consentimiento no se puede enviar nada, sin cuota no se puede controlar el
-- coste de enviarlo, y sin historial no hay conversación que mostrar.
--
-- No activa nada por sí sola. La Edge Function seguirá sin llamar a ningún
-- proveedor mientras no se configuren sus secretos.
--
-- **Solo forward.** Sin SQL de reversión, como el resto de migraciones del
-- proyecto. El rollback manual se documenta en docs/16-coach-fase-4.md.
--
-- Verificado contra el esquema remoto antes de escribirse (2026-09-23):
--   - public.profiles existe y no tiene ai_consent_at ni ai_consent_version.
--   - public.ai_conversations, ai_messages y ai_usage_counters no existen.

-- =============================================================
-- 1. Consentimiento, sobre profiles
-- =============================================================

-- No se crea una tabla aparte: el consentimiento es un atributo del perfil, y
-- una tabla propia duplicaría la moneda principal y la zona horaria, que ya
-- viven aquí. Revocarlo es poner las dos columnas a null.
alter table public.profiles
  add column ai_consent_at timestamptz,
  add column ai_consent_version text;

-- Las dos van juntas o ninguna. Un consentimiento sin versión no se puede
-- auditar —no se sabría qué texto aceptó el usuario— y una versión sin fecha
-- no es un consentimiento.
alter table public.profiles
  add constraint profiles_ai_consent_pair_check check (
    (ai_consent_at is null) = (ai_consent_version is null)
  );

comment on column public.profiles.ai_consent_at is
  'Cuándo autorizó el usuario el análisis por IA. NULL = no autorizado.';
comment on column public.profiles.ai_consent_version is
  'Versión del texto de consentimiento aceptado, para poder volver a pedirlo si cambia.';

-- =============================================================
-- 2. Cuota de uso
-- =============================================================

create table public.ai_usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Inicio de la ventana, truncado a la hora. Forma parte de la clave: cada
  -- hora es una fila distinta, así que el contador nunca necesita reiniciarse.
  window_start timestamptz not null,
  message_count integer not null default 0 check (message_count >= 0),
  primary key (user_id, window_start)
);

alter table public.ai_usage_counters enable row level security;

-- El usuario **puede leer** su contador y **no puede escribirlo**: no hay
-- políticas de insert, update ni delete. La única vía de escritura es la
-- función de abajo, que decide bajo el bloqueo de la fila.
create policy "ai_usage_counters_select_own"
  on public.ai_usage_counters for select
  using (auth.uid() = user_id);

-- Índice para la purga por antigüedad. La clave primaria empieza por user_id,
-- así que no sirve para barrer por ventana.
create index ai_usage_counters_window_start_idx
  on public.ai_usage_counters (window_start);

-- Consume una unidad de cuota y devuelve el consumo resultante, o NULL si ya
-- se alcanzó el límite.
--
-- Todo ocurre en **una sola sentencia**. El riesgo que evita es el de leer y
-- escribir en dos pasos: dos peticiones simultáneas leerían ambas el mismo
-- valor y las dos pasarían. Aquí, el `where` del `do update` hace que al
-- alcanzar el límite no se actualice nada y no vuelva ninguna fila; quien
-- decide es PostgreSQL con la fila bloqueada, no la Edge Function.
--
-- `security definer` porque el rol `authenticated` no tiene permiso de
-- escritura sobre la tabla, y eso es deliberado: así un cliente no puede
-- rebajarse el contador. `search_path` fijo para que la función no dependa
-- del search_path de quien la llama, igual que handle_new_user.
create function public.consume_ai_quota(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_window timestamptz := date_trunc('hour', now());
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Se necesita una sesión para consumir cuota.';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'El límite de cuota debe ser mayor que cero.';
  end if;

  insert into public.ai_usage_counters (user_id, window_start, message_count)
  values (v_user_id, v_window, 1)
  on conflict (user_id, window_start) do update
    set message_count = ai_usage_counters.message_count + 1
    where ai_usage_counters.message_count < p_limit
  returning ai_usage_counters.message_count into v_count;

  -- NULL significa denegado: la fila existía y ya estaba en el límite.
  return v_count;
end;
$$;

-- Por defecto una función es ejecutable por todo el mundo. Aquí solo tiene
-- sentido con una sesión iniciada.
revoke execute on function public.consume_ai_quota(integer) from public;
grant execute on function public.consume_ai_quota(integer) to authenticated;

comment on function public.consume_ai_quota(integer) is
  'Consume una unidad de cuota horaria del usuario autenticado. Devuelve el consumo, o NULL si se alcanzó el límite.';

-- =============================================================
-- 3. Historial de conversaciones
-- =============================================================

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Necesaria como destino de la clave foránea compuesta de ai_messages.
  -- `id` ya es única por ser clave primaria, así que esto no cambia qué filas
  -- son válidas; es el mismo patrón que budgets usa desde la Fase 8.
  constraint ai_conversations_id_user_id_key unique (id, user_id)
);

create index ai_conversations_user_id_updated_at_idx
  on public.ai_conversations (user_id, updated_at desc);

alter table public.ai_conversations enable row level security;

create trigger set_ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create policy "ai_conversations_select_own"
  on public.ai_conversations for select
  using (auth.uid() = user_id);

create policy "ai_conversations_insert_own"
  on public.ai_conversations for insert
  with check (auth.uid() = user_id);

create policy "ai_conversations_update_own"
  on public.ai_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "ai_conversations_delete_own"
  on public.ai_conversations for delete
  using (auth.uid() = user_id);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Solo trazabilidad: intención, herramientas, moneda, mes, versión de prompt,
  -- modelo, latencia y resultado de la validación. **Nunca el snapshot**: sería
  -- una segunda copia de datos financieros con su propia superficie de fuga
  -- (docs/14-coach-fase-2.md).
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  -- Propiedad declarativa: el mensaje y su conversación son del mismo usuario.
  -- Al ser una clave foránea, PostgreSQL la aplica siempre, incluso a una
  -- conexión que no pase por RLS.
  --
  -- Diferida al commit por la misma razón que en budgets: al borrar un usuario,
  -- la cascada elimina conversaciones y mensajes dentro de la misma sentencia y
  -- una comprobación inmediata podría fallar en un punto intermedio aunque el
  -- estado final sea consistente.
  constraint ai_messages_conversation_same_user_fkey
    foreign key (conversation_id, user_id)
    references public.ai_conversations (id, user_id)
    on delete cascade
    deferrable initially deferred
);

create index ai_messages_conversation_id_created_at_idx
  on public.ai_messages (conversation_id, created_at);

-- Para la purga por antigüedad, que barre por fecha y no por conversación.
create index ai_messages_created_at_idx
  on public.ai_messages (created_at);

alter table public.ai_messages enable row level security;

create policy "ai_messages_select_own"
  on public.ai_messages for select
  using (auth.uid() = user_id);

create policy "ai_messages_insert_own"
  on public.ai_messages for insert
  with check (auth.uid() = user_id);

create policy "ai_messages_update_own"
  on public.ai_messages for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "ai_messages_delete_own"
  on public.ai_messages for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 4. Purga
-- =============================================================

-- Borra lo que ya cumplió su retención: mensajes de más de 90 días, las
-- conversaciones que se quedan sin ninguno, y contadores de más de 7 días.
--
-- Es una función y no una tarea programada porque programarla exige la
-- extensión pg_cron, que es una decisión aparte. Mientras tanto se ejecuta a
-- mano o desde un programador externo; el procedimiento está en
-- docs/16-coach-fase-4.md.
--
-- No la puede ejecutar ningún usuario final: borra filas de todos.
create function public.purge_ai_data(
  p_message_days integer default 90,
  p_counter_days integer default 7
)
returns table (mensajes integer, conversaciones integer, contadores integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages integer;
  v_conversations integer;
  v_counters integer;
begin
  delete from public.ai_messages
  where created_at < now() - make_interval(days => p_message_days);
  get diagnostics v_messages = row_count;

  delete from public.ai_conversations c
  where not exists (
    select 1 from public.ai_messages m where m.conversation_id = c.id
  )
  and c.updated_at < now() - make_interval(days => p_message_days);
  get diagnostics v_conversations = row_count;

  delete from public.ai_usage_counters
  where window_start < now() - make_interval(days => p_counter_days);
  get diagnostics v_counters = row_count;

  return query select v_messages, v_conversations, v_counters;
end;
$$;

revoke execute on function public.purge_ai_data(integer, integer) from public;

comment on function public.purge_ai_data(integer, integer) is
  'Purga el historial del Coach y los contadores de cuota vencidos. Solo para mantenimiento; no la ejecuta el usuario final.';
