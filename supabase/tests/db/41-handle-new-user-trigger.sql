-- Triggers tras el revoke de EXECUTE.
--
-- El alta de usuarios sigue creando el perfil aunque ningún rol de la API
-- pueda ejecutar handle_new_user: PostgreSQL comprueba EXECUTE al crear el
-- trigger, no al dispararlo. Se prueba con un rol SIN privilegios de
-- superusuario, como el que usa Supabase Auth para insertar en auth.users.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create role test_auth_admin nologin;
grant usage on schema auth to test_auth_admin;
grant insert on auth.users to test_auth_admin;

set role test_auth_admin;
insert into auth.users (id) values ('99999999-0000-4000-8000-000000000009');
reset role;

do $$
begin
  if not has_function_privilege('test_auth_admin', 'public.handle_new_user()', 'EXECUTE') is false then
    raise exception 'la prueba necesita un rol sin EXECUTE sobre handle_new_user';
  end if;
  if not exists (select 1 from public.profiles where id = '99999999-0000-4000-8000-000000000009') then
    raise exception 'el trigger no creó el perfil tras revocar EXECUTE';
  end if;
end;
$$;

-- Los triggers `security invoker` también se disparan para un usuario
-- autenticado aunque ningún rol de la API tenga EXECUTE sobre sus funciones.
insert into public.accounts (id, user_id, name, type, currency_code)
values ('99990000-0000-4000-8000-000000000009', '99999999-0000-4000-8000-000000000009', 'Banco', 'checking', 'COP');
insert into public.categories (id, user_id, name, type)
values ('99980000-0000-4000-8000-000000000009', '99999999-0000-4000-8000-000000000009', 'Mercado', 'expense');

select set_config('request.jwt.claims', '{"sub":"99999999-0000-4000-8000-000000000009","role":"authenticated"}', false);
set role authenticated;

-- validate_transaction
insert into public.transactions (user_id, account_id, category_id, type, amount_minor, transaction_date, description)
values ('99999999-0000-4000-8000-000000000009', '99990000-0000-4000-8000-000000000009',
        '99980000-0000-4000-8000-000000000009', 'expense', 1000, '2026-09-05', 'Prueba');

-- validate_budget
insert into public.budgets (user_id, category_id, effective_from, amount_minor)
values ('99999999-0000-4000-8000-000000000009', '99980000-0000-4000-8000-000000000009', '2026-09-01', 50000);

-- set_updated_at
update public.profiles set display_name = 'Prueba' where id = '99999999-0000-4000-8000-000000000009';

do $$
begin
  -- validate_transaction sigue rechazando una categoría de otro tipo.
  begin
    insert into public.transactions (user_id, account_id, category_id, type, amount_minor, transaction_date, description)
    values ('99999999-0000-4000-8000-000000000009', '99990000-0000-4000-8000-000000000009',
            '99980000-0000-4000-8000-000000000009', 'income', 1000, '2026-09-05', 'Tipo erróneo');
  exception when others then
    return;
  end;
  raise exception 'validate_transaction no se disparó';
end;
$$;

reset role;

delete from auth.users where id = '99999999-0000-4000-8000-000000000009';
revoke all on auth.users from test_auth_admin;
revoke usage on schema auth from test_auth_admin;
drop role test_auth_admin;
