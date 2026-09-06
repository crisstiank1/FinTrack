-- FinTrack — Esquema inicial (Fase 2)
-- Tablas: profiles, accounts, categories, transactions.
-- Todas las tablas privadas tienen RLS activa con políticas explícitas
-- de SELECT/INSERT/UPDATE/DELETE restringidas a auth.uid() = user_id.

-- =============================================================
-- 1. Función utilitaria: mantener updated_at al día
-- =============================================================

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================
-- 2. profiles
-- =============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  currency_code text not null default 'COP',
  timezone text not null default 'America/Bogota',
  theme_preference text not null default 'light'
    check (theme_preference in ('light', 'dark', 'system')),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles for delete
  using (auth.uid() = id);

-- Crear el perfil automáticamente al registrarse, sin depender del
-- cliente. security definer + search_path fijo para evitar que la
-- función se vea afectada por RLS o por un search_path manipulado.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================
-- 3. accounts
-- =============================================================

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null
    check (type in ('cash', 'checking', 'savings', 'digital_wallet', 'credit_card')),
  initial_balance_minor bigint not null default 0,
  currency_code text not null default 'COP',
  color text,
  icon text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounts_user_id_idx on public.accounts (user_id);

alter table public.accounts enable row level security;

create trigger set_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create policy "accounts_select_own"
  on public.accounts for select
  using (auth.uid() = user_id);

create policy "accounts_insert_own"
  on public.accounts for insert
  with check (auth.uid() = user_id);

create policy "accounts_update_own"
  on public.accounts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "accounts_delete_own"
  on public.accounts for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 4. categories
-- =============================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  icon text,
  color text,
  is_system boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_user_id_type_idx on public.categories (user_id, type);

alter table public.categories enable row level security;

create trigger set_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create policy "categories_select_own"
  on public.categories for select
  using (auth.uid() = user_id);

create policy "categories_insert_own"
  on public.categories for insert
  with check (auth.uid() = user_id);

create policy "categories_update_own"
  on public.categories for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "categories_delete_own"
  on public.categories for delete
  using (auth.uid() = user_id);

-- =============================================================
-- 5. transactions
-- =============================================================

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- accounts/categories con historial se archivan, nunca se borran;
  -- "restrict" es una segunda barrera a nivel de base de datos.
  account_id uuid not null references public.accounts (id) on delete restrict,
  category_id uuid references public.categories (id) on delete restrict,
  type text not null check (type in ('income', 'expense', 'transfer')),
  transfer_direction text check (transfer_direction in ('incoming', 'outgoing')),
  -- Unidades mínimas de la moneda (p. ej. COP 15.000 -> 15000). Siempre positivo.
  amount_minor bigint not null check (amount_minor > 0),
  transaction_date date not null,
  description text not null,
  notes text,
  is_reconciled boolean not null default false,
  -- Vincula los dos movimientos que conforman una transferencia.
  transfer_group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_transfer_consistency_check check (
    (
      type = 'transfer'
      and transfer_direction is not null
      and transfer_group_id is not null
      and category_id is null
    )
    or (
      type in ('income', 'expense')
      and transfer_direction is null
      and transfer_group_id is null
    )
  )
);

create index transactions_user_id_date_idx
  on public.transactions (user_id, transaction_date desc);
create index transactions_user_id_account_id_idx
  on public.transactions (user_id, account_id);
create index transactions_user_id_category_id_idx
  on public.transactions (user_id, category_id);
create index transactions_transfer_group_id_idx
  on public.transactions (transfer_group_id);

alter table public.transactions enable row level security;

create trigger set_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create policy "transactions_select_own"
  on public.transactions for select
  using (auth.uid() = user_id);

create policy "transactions_insert_own"
  on public.transactions for insert
  with check (auth.uid() = user_id);

create policy "transactions_update_own"
  on public.transactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transactions_delete_own"
  on public.transactions for delete
  using (auth.uid() = user_id);

-- Refuerza, a nivel de base de datos, que account_id/category_id
-- pertenezcan al mismo usuario que el movimiento, y que el tipo de
-- categoría coincida con el tipo de movimiento (regla de negocio:
-- una categoría income no puede usarse en un movimiento expense y
-- viceversa). No depende del frontend.
create function public.validate_transaction()
returns trigger
language plpgsql
as $$
declare
  v_account_user_id uuid;
  v_category_user_id uuid;
  v_category_type text;
begin
  select user_id into v_account_user_id
  from public.accounts
  where id = new.account_id;

  if v_account_user_id is null or v_account_user_id <> new.user_id then
    raise exception 'La cuenta indicada no existe o no pertenece al usuario.';
  end if;

  if new.category_id is not null then
    select user_id, type into v_category_user_id, v_category_type
    from public.categories
    where id = new.category_id;

    if v_category_user_id is null or v_category_user_id <> new.user_id then
      raise exception 'La categoría indicada no existe o no pertenece al usuario.';
    end if;

    if new.type in ('income', 'expense') and v_category_type <> new.type then
      raise exception
        'El tipo de la categoría (%) no coincide con el tipo de movimiento (%).',
        v_category_type, new.type;
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_transaction_trigger
  before insert or update on public.transactions
  for each row execute function public.validate_transaction();
