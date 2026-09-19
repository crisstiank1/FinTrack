-- Fix raíz de divisas con centavos.
--
-- El problema: la app guardaba `amount_minor` como si TODAS las monedas fueran de
-- exponente 0 ("COP 15.000 se guarda como 15000"). Para monedas cuya unidad
-- mínima real es el centavo (USD, EUR, MXN, ARS, PEN según ISO 4217) eso hacía
-- dos cosas:
--   * Era imposible registrar 45,99 USD: el campo solo aceptaba enteros.
--   * Si algo se guardaba "en dólares enteros", hoy se leería como centavos.
--
-- Esta migración da el paso correcto y único: multiplica por 100 los montos ya
-- registrados en esas monedas para que pasen de "unidades enteras de la moneda"
-- a "centavos". COP, CLP y JPY NO se tocan: su exponente es 0 y sus montos ya
-- están en su unidad mínima correcta.

-- 1) Cuentas: el saldo inicial pasa de dólares/pesos enteros a centavos.
update public.accounts
set initial_balance_minor = initial_balance_minor * 100
where currency_code in ('USD', 'EUR', 'MXN', 'ARS', 'PEN');

-- 2) Movimientos: la moneda es la de su cuenta.
update public.transactions t
set amount_minor = t.amount_minor * 100
from public.accounts a
where t.account_id = a.id
  and a.currency_code in ('USD', 'EUR', 'MXN', 'ARS', 'PEN');

-- 3) Borradores de hojas sin registrar: la celda de monto está en la moneda de
--    la cuenta de su fila. El RPC valida que `amount_minor` sea un entero, así
--    que basta multiplicar las celdas que tengan valor numérico entero.
update public.sheet_drafts d
set cells = jsonb_set(d.cells, '{amount_minor}', to_jsonb(((d.cells ->> 'amount_minor')::numeric) * 100))
from public.accounts a
where (d.cells ->> 'account_id') = a.id::text
  and d.cells ? 'account_id'
  and d.cells ? 'amount_minor'
  and (d.cells ->> 'amount_minor') ~ '^-?[0-9]+$'
  and a.user_id = d.user_id
  and a.currency_code in ('USD', 'EUR', 'MXN', 'ARS', 'PEN');

-- 4) Presupuestos: no tienen columna de moneda; se guardan en la moneda
--    principal del usuario (profiles.currency_code).
update public.budgets b
set amount_minor = b.amount_minor * 100
from public.profiles p
where b.user_id = p.id
  and p.currency_code in ('USD', 'EUR', 'MXN', 'ARS', 'PEN');

-- 5) Plan mensual: igual que budgets, en la moneda principal del usuario.
update public.plan_income_sources s
set planned_minor = s.planned_minor * 100
from public.profiles p
where s.user_id = p.id
  and p.currency_code in ('USD', 'EUR', 'MXN', 'ARS', 'PEN');

update public.plan_lines l
set planned_minor = l.planned_minor * 100
from public.profiles p
where l.user_id = p.id
  and p.currency_code in ('USD', 'EUR', 'MXN', 'ARS', 'PEN');