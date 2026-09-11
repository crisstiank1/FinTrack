-- FinTrack — Ampliar los tipos de cuenta (Fase 8.7, migración M1)
--
-- Dos cambios sobre public.accounts, y nada más:
--   1. Añadir 'investment' al dominio de accounts.type.
--   2. Crear la restricción única (id, user_id).
--
-- No crea tablas, triggers, funciones, políticas ni RPC. No toca budgets,
-- sheets ni transactions. No modifica datos existentes ni introduce backfill.
--
-- **Solo forward.** Esta migración no incluye SQL de reversión: un rollback
-- copiable invita a ejecutarse sin leer sus guardas. El procedimiento manual y
-- la guarda obligatoria están en docs/09-plan-mensual.md.
--
-- Verificado contra el esquema remoto antes de escribirse:
--   - accounts_type_check es el único CHECK de la tabla.
--   - Permite exactamente cash, checking, savings, digital_wallet y
--     credit_card.
--   - accounts.type es text NOT NULL, sin valor predeterminado.
--   - No existe ninguna restricción ni índice único sobre (id, user_id).
--   - Los datos actuales solo usan 'cash' y 'checking'.

-- =============================================================
-- 1. Ampliar el dominio de accounts.type
-- =============================================================

-- 'investment' identifica una cuenta de destino de inversión. Existe para que
-- el usuario registre manualmente los aportes que ya realizó por su cuenta.
-- FinTrack no conecta brokers, no abre productos, no compra activos y no opera
-- dinero; tampoco almacena credenciales ni datos de terceros.
--
-- Ampliar un CHECK no puede invalidar ninguna fila: todo valor que cumplía el
-- dominio anterior cumple el nuevo, porque el nuevo lo contiene. Por eso no
-- hace falta backfill ni validación previa de los datos.
--
-- La nulabilidad no se toca. `not null` lo declara la columna, no esta
-- restricción, así que eliminar y recrear el CHECK deja accounts.type
-- exactamente como estaba: text NOT NULL y sin valor predeterminado.
--
-- El DROP y el ADD van en la misma transacción —una migración es atómica—, así
-- que en ningún instante observable la tabla queda sin su restricción. Si el
-- ADD fallara, el DROP se deshace con él.

alter table public.accounts
  drop constraint accounts_type_check;

alter table public.accounts
  add constraint accounts_type_check
  check (
    type in (
      'cash',
      'checking',
      'savings',
      'digital_wallet',
      'credit_card',
      'investment'
    )
  );

-- =============================================================
-- 2. Restricción única (id, user_id)
-- =============================================================

-- `id` ya es única por ser clave primaria, así que esta restricción no cambia
-- qué filas son válidas ni puede fallar por datos existentes. Existe porque una
-- clave foránea compuesta necesita una restricción única que cubra exactamente
-- sus columnas de destino, y es lo que permitirá delegar en la base de datos la
-- garantía de que una línea del Plan mensual solo apunta a una cuenta del mismo
-- usuario. Es el mismo recurso que categories_id_user_id_key aporta a los
-- presupuestos desde la Fase 8.
--
-- Todavía no la usa ninguna clave foránea: las tablas que la necesitan llegan
-- en la migración M3. Se crea aquí para que M3 no dependa de modificar accounts.

alter table public.accounts
  add constraint accounts_id_user_id_key unique (id, user_id);
