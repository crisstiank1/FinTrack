-- Stubs mínimos de Supabase para aplicar las migraciones en un PostgreSQL
-- limpio (local o en CI). Solo lo que las migraciones y las pruebas usan:
-- roles, `auth.users`, `auth.uid()` y los privilegios por defecto que
-- Supabase concede sobre el esquema public. RLS sigue siendo la barrera real,
-- exactamente como en el proyecto.
--
-- No es una réplica de Supabase: no incluye GoTrue, PostgREST ni Storage.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text
);

-- Igual que en Supabase: el `sub` de los claims del JWT de la petición.
create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
