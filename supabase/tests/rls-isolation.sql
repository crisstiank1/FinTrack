-- =====================================================================
-- FinTrack — Prueba manual de aislamiento RLS entre dos usuarios (Fase 2)
-- =====================================================================
-- Requisitos previos:
--   1. Crea dos usuarios de prueba desde Supabase Studio > Authentication
--      > Add user (o mediante registro real en la app cuando exista la
--      Fase 3). No uses cuentas ni datos financieros reales.
--   2. Reemplaza <UUID_USUARIO_A> y <UUID_USUARIO_B> por los UUID reales.
--   3. Ejecuta cada bloque, en orden, en el SQL Editor de Supabase Studio.
--
-- Este script simula el JWT de cada usuario con `request.jwt.claims`, que
-- es exactamente lo que lee auth.uid() dentro de las políticas RLS. Es el
-- método recomendado por Supabase para probar políticas sin pasar por el
-- flujo completo de autenticación.
-- =====================================================================

-- --- Paso 1: Usuario A crea una cuenta y un movimiento ---
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_USUARIO_A>", "role": "authenticated"}';

insert into public.accounts (user_id, name, type, initial_balance_minor)
values ('<UUID_USUARIO_A>', 'Cuenta prueba A', 'cash', 100000);

insert into public.transactions (user_id, account_id, type, amount_minor, transaction_date, description)
select '<UUID_USUARIO_A>', id, 'income', 5000, current_date, 'Movimiento de prueba A'
from public.accounts
where name = 'Cuenta prueba A' and user_id = '<UUID_USUARIO_A>';

commit;

-- --- Paso 2: Usuario B no debe poder VER los datos de A ---
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_USUARIO_B>", "role": "authenticated"}';

-- Ambas consultas deben devolver 0:
select count(*) as deberia_ser_cero from public.accounts where name = 'Cuenta prueba A';
select count(*) as deberia_ser_cero from public.transactions where description = 'Movimiento de prueba A';

commit;

-- --- Paso 3: Usuario B intenta CREAR una fila con user_id de A ---
-- Debe fallar con "new row violates row-level security policy" (WITH CHECK).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_USUARIO_B>", "role": "authenticated"}';

insert into public.accounts (user_id, name, type, initial_balance_minor)
values ('<UUID_USUARIO_A>', 'Intento malicioso', 'cash', 0);

rollback;

-- --- Paso 4: Usuario B intenta ACTUALIZAR/ELIMINAR datos de A ---
-- No debe dar error, pero debe afectar 0 filas (RLS filtra la fila antes del UPDATE/DELETE).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_USUARIO_B>", "role": "authenticated"}';

update public.accounts set name = 'hackeado' where name = 'Cuenta prueba A';
-- Verificar en el resultado: "UPDATE 0"

delete from public.accounts where name = 'Cuenta prueba A';
-- Verificar en el resultado: "DELETE 0"

rollback;

-- --- Paso 5: limpieza, como Usuario A ---
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_USUARIO_A>", "role": "authenticated"}';

delete from public.transactions where description = 'Movimiento de prueba A';
delete from public.accounts where name = 'Cuenta prueba A';

commit;
