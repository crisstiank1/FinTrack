# FinTrack — Pruebas SQL de la migración `budgets`

> Verificación manual de la migración `20260906212625_crear_budgets.sql`.
> Ejecutar en Supabase Studio → **SQL Editor** después de aplicarla.
>
> **Estado: PENDIENTE.** No se han ejecutado: sin Docker no fue posible
> levantar una instancia local, y el agente no debe acceder al proyecto remoto.

## Preparación

El editor SQL corre como superusuario y **se salta RLS**, así que hay que
impersonar al usuario en cada bloque. Obtén primero los identificadores:

```sql
select id, email from auth.users order by created_at desc limit 5;
```

Necesitas, para el Usuario A: su UUID, el id de una categoría de **gasto** no
archivada, el de una categoría de **ingreso**, y el de una categoría
**archivada**. Y para el Usuario B: su UUID y el id de una categoría de gasto
suya.

```sql
select id, name, type, is_archived
from public.categories
where user_id = 'UUID_A'
order by type, is_archived;
```

Todos los bloques terminan en `rollback` para no dejar rastro.

---

## a. Plantilla válida — debe pasar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000)
  returning id, period_month, effective_from, amount_minor;
rollback;
```

Esperado: **1 fila insertada**, `period_month` nulo.

---

## b. Excepción válida — debe pasar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', '2026-10-01', '2026-10-01', 750000)
  returning id, period_month, amount_minor;
rollback;
```

Esperado: **1 fila insertada**. `effective_from` debe coincidir con
`period_month`; si se pasan distintos, salta
`budgets_exception_dates_match_check`.

---

## c. Presupuesto 0 — debe pasar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', '2026-11-01', '2026-11-01', 0)
  returning id, amount_minor;
rollback;
```

Esperado: **1 fila insertada** con `amount_minor = 0`, que significa "sin
presupuesto para esta categoría durante este mes".

---

## d. Fecha que no cae el primer día del mes — debe fallar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  -- period_month a mitad de mes
  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', '2026-09-15', '2026-09-15', 500000);
rollback;
```

Esperado: error de `budgets_period_month_is_first_day_check`.

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  -- effective_from a mitad de mes, en una plantilla
  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', null, '2026-09-15', 500000);
rollback;
```

Esperado: error de `budgets_effective_from_is_first_day_check`.

---

## e. Categoría de ingreso — debe fallar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_INGRESO_A', null, '2026-09-01', 500000);
rollback;
```

Esperado: `Solo se pueden presupuestar categorías de gasto; la indicada es de
tipo income.`

---

## f. Categoría archivada — debe fallar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_ARCHIVADA_A', null, '2026-09-01', 500000);
rollback;
```

Esperado: `No se puede presupuestar una categoría archivada.`

> Consecuencia a tener en cuenta: la regla también aplica en UPDATE. Si se
> archiva una categoría que ya tenía presupuestos, esos presupuestos quedan
> consultables y borrables, pero **no editables** hasta desarchivarla.

---

## g. Categoría de otro usuario — debe fallar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_B","role":"authenticated"}';

  -- B intenta presupuestar una categoría de A, a nombre de B
  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_B', 'CAT_GASTO_A', null, '2026-09-01', 500000);
rollback;
```

Esperado: `La categoría indicada no existe o no pertenece al usuario.` (RLS
oculta la categoría de A, así que el trigger no la encuentra).

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_B","role":"authenticated"}';

  -- B intenta insertar directamente a nombre de A
  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000);
rollback;
```

Esperado: `new row violates row-level security policy` (la política de INSERT
exige `auth.uid() = user_id`).

**Prueba de la barrera declarativa**, sin RLS de por medio: ejecuta este bloque
**sin** impersonar (como superusuario). Debe fallar igualmente por la clave
foránea compuesta, lo que demuestra que la protección no depende solo de RLS.

```sql
begin;
  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_B', 'CAT_GASTO_A', null, '2026-09-01', 500000);
rollback;
```

Esperado: violación de `budgets_category_same_user_fkey`.

---

## h. Duplicado de plantilla — debe fallar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000);

  -- Misma categoría y mismo effective_from
  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 900000);
rollback;
```

Esperado: violación de `budgets_template_unique_idx`.

Comprobación complementaria: una **segunda versión** de la misma plantilla con
otro `effective_from` **sí** debe permitirse, porque es justo el mecanismo del
modelo histórico.

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000);

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', null, '2026-10-01', 900000);

  select effective_from, amount_minor from public.budgets
  where user_id = 'UUID_A' and category_id = 'CAT_GASTO_A' and period_month is null
  order by effective_from;
rollback;
```

Esperado: **2 filas**, septiembre con 500000 y octubre con 900000.

---

## i. Duplicado de excepción — debe fallar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', '2026-09-01', '2026-09-01', 500000);

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', '2026-09-01', '2026-09-01', 900000);
rollback;
```

Esperado: violación de `budgets_exception_unique_idx`.

> Nota: una plantilla y una excepción de la misma categoría y mes **coexisten**
> a propósito — es exactamente el caso "la excepción sobrescribe a la
> plantilla". Los dos índices son parciales y disjuntos, así que no chocan.

---

## j. Aislamiento RLS entre A y B

Crea primero un presupuesto real de A (**sin** `rollback`, para que persista):

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000);
commit;
```

Y ahora comprueba qué puede hacer B con él:

```sql
-- B no ve nada de A
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_B","role":"authenticated"}';

  select count(*) as presupuestos_de_a_visibles_por_b
  from public.budgets where user_id = 'UUID_A';
commit;
```

Esperado: `0`.

```sql
-- B no puede modificar ni borrar presupuestos de A
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_B","role":"authenticated"}';

  with actualizados as (
    update public.budgets set amount_minor = 1 where user_id = 'UUID_A' returning 1
  ),
  borrados as (
    delete from public.budgets where user_id = 'UUID_A' returning 1
  )
  select
    (select count(*) from actualizados) as filas_actualizadas,
    (select count(*) from borrados)     as filas_borradas;
rollback;
```

Esperado: `0 | 0`.

Limpieza final:

```sql
delete from public.budgets where user_id = 'UUID_A';
```

---

## Resolución del presupuesto vigente

Consulta de referencia para un mes `M` y una categoría `C`. La usará la capa
de datos del paso 3; conviene comprobar aquí que devuelve lo esperado.

```sql
-- Sustituye M por el primer día del mes consultado
select coalesce(
  -- 1. La excepción del mes, si existe
  (select amount_minor from public.budgets
   where category_id = 'CAT_GASTO_A' and period_month = 'M'),
  -- 2. Si no, la plantilla vigente más reciente
  (select amount_minor from public.budgets
   where category_id = 'CAT_GASTO_A'
     and period_month is null
     and effective_from <= 'M'
   order by effective_from desc
   limit 1)
) as presupuesto_vigente;
```

`null` significa que esa categoría no tiene presupuesto ese mes.
