-- FinTrack — Renombrar categorías predeterminadas (Fase 9, migración M10)
--
-- src/features/categories/default-categories.ts cambió los nombres que el
-- onboarding usa para sembrar categorías nuevas:
--   Alimentación      -> Mercado
--   Entretenimiento   -> Ocio
--   Compras personales -> Gastos hormiga
--   Freelance         -> Bono
--
-- Ese archivo solo afecta a cuentas que hagan onboarding de ahora en
-- adelante. Esta migración aplica los mismos cuatro renombres a las
-- categorías predeterminadas que ya existen en cuentas creadas antes del
-- cambio, para todos los usuarios por igual.
--
-- Solo renombra: no toca icon, color, is_archived ni ninguna otra columna.
-- Los movimientos existentes siguen apuntando al mismo id, así que no pierden
-- ni cambian su categoría.
--
-- Filtra por is_system = true además de por nombre y tipo, para no tocar una
-- categoría personalizada que un usuario haya creado o renombrado a mano con
-- ese mismo texto por su cuenta — is_system = true identifica exactamente a
-- las categorías que vinieron del onboarding y nadie más pudo renombrar,
-- porque la UI no expone ese flag.
--
-- **Solo forward.** Sin SQL de reversión: ver docs/09-plan-mensual.md para el
-- procedimiento manual y la guarda obligatoria antes de revertir en producción.

update public.categories
  set name = 'Mercado'
  where is_system = true
    and type = 'expense'
    and name = 'Alimentación';

update public.categories
  set name = 'Ocio'
  where is_system = true
    and type = 'expense'
    and name = 'Entretenimiento';

update public.categories
  set name = 'Gastos hormiga'
  where is_system = true
    and type = 'expense'
    and name = 'Compras personales';

update public.categories
  set name = 'Bono'
  where is_system = true
    and type = 'income'
    and name = 'Freelance';
