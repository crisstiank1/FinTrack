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

Esperado: error de `budgets_period_month_is_month_start_check`.

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  -- effective_from a mitad de mes, en una plantilla
  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_GASTO_A', null, '2026-09-15', 500000);
rollback;
```

Esperado: error de `budgets_effective_from_is_month_start_check`.

---

## e. Categoría de ingreso — debe fallar

La regla de `type = expense` también es "prohibido estrenar", igual que la de
archivado: se valida en el INSERT y en el UPDATE que cambia `category_id`,
pero un presupuesto histórico que conserva su categoría puede seguir
editándose aunque después la categoría haya pasado a ser de ingreso.

### e.1 INSERT con categoría de ingreso — debe fallar

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

### e.2 UPDATE que cambia hacia una categoría de ingreso — debe fallar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (id, user_id, category_id, period_month, effective_from, amount_minor)
  values ('55555555-5555-5555-5555-555555555555',
          'UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000);

  update public.budgets
  set category_id = 'CAT_INGRESO_A'
  where id = '55555555-5555-5555-5555-555555555555';
rollback;
```

Esperado: `Solo se pueden presupuestar categorías de gasto; la indicada es de
tipo income.`

---

## f. Categoría archivada

La regla no es "prohibido tocar" sino "prohibido estrenar": se deniega
**empezar** a usar una categoría archivada, pero un presupuesto histórico que
ya la usaba se puede seguir corrigiendo.

### f.1 INSERT con categoría archivada — debe fallar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'CAT_ARCHIVADA_A', null, '2026-09-01', 500000);
rollback;
```

Esperado: `No se puede presupuestar una categoría archivada.`

### f.2 UPDATE que cambia hacia una categoría archivada — debe fallar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (id, user_id, category_id, period_month, effective_from, amount_minor)
  values ('11111111-1111-1111-1111-111111111111',
          'UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000);

  update public.budgets
  set category_id = 'CAT_ARCHIVADA_A'
  where id = '11111111-1111-1111-1111-111111111111';
rollback;
```

Esperado: `No se puede presupuestar una categoría archivada.`

### f.3 UPDATE conservando la misma categoría archivada — debe pasar

Simula un presupuesto histórico cuya categoría se archivó después.

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  -- Se crea con la categoría todavía activa
  insert into public.budgets (id, user_id, category_id, period_month, effective_from, amount_minor)
  values ('22222222-2222-2222-2222-222222222222',
          'UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000);

  -- Y después se archiva la categoría
  update public.categories set is_archived = true where id = 'CAT_GASTO_A';

  -- Corregir el monto debe seguir siendo posible
  update public.budgets
  set amount_minor = 650000
  where id = '22222222-2222-2222-2222-222222222222'
  returning amount_minor;
rollback;
```

Esperado: **1 fila actualizada** con `amount_minor = 650000`, sin error.

### f.4 UPDATE conservando una categoría cuyo tipo cambió después — debe pasar

Simula un presupuesto histórico cuya categoría pasó de `expense` a `income`
después de crear el presupuesto.

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  -- Se crea cuando la categoría todavía es de gasto
  insert into public.budgets (id, user_id, category_id, period_month, effective_from, amount_minor)
  values ('44444444-4444-4444-4444-444444444444',
          'UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000);

  -- Y después la categoría se convierte en ingreso
  update public.categories set type = 'income' where id = 'CAT_GASTO_A';

  -- Corregir el monto debe seguir siendo posible
  update public.budgets
  set amount_minor = 520000
  where id = '44444444-4444-4444-4444-444444444444'
  returning amount_minor;
rollback;
```

Esperado: **1 fila actualizada** con `amount_minor = 520000`, sin error. Aunque
la categoría ya no es de gasto, el UPDATE conserva el mismo `category_id`, así
que la validación de `type = expense` no aplica.

### f.5 SELECT y DELETE sobre categoría archivada — deben pasar

```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"UUID_A","role":"authenticated"}';

  insert into public.budgets (id, user_id, category_id, period_month, effective_from, amount_minor)
  values ('33333333-3333-3333-3333-333333333333',
          'UUID_A', 'CAT_GASTO_A', null, '2026-09-01', 500000);

  update public.categories set is_archived = true where id = 'CAT_GASTO_A';

  select count(*) as visibles from public.budgets
  where id = '33333333-3333-3333-3333-333333333333';

  delete from public.budgets
  where id = '33333333-3333-3333-3333-333333333333'
  returning id;
rollback;
```

Esperado: `visibles = 1` y la fila se borra sin error (DELETE no dispara el
trigger y SELECT no pasa por él).

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

## k. Comprobación diferida de la FK — el borrado de la categoría espera al commit

`budgets_category_same_user_fkey` es `deferrable initially deferred`: la
comprobación no ocurre al terminar cada sentencia, sino al commit. Este bloque
la demuestra: borra la categoría **mientras todavía hay un presupuesto que la
referencia** y recién después borra el presupuesto. Con una FK inmediata, el
`delete` de la categoría fallaría ahí mismo; con la comprobación diferida, la
transacción termina bien porque al commit ya no queda ninguna referencia.

Ejecutar **sin impersonar** (como superusuario, para que RLS no oculte nada):

```sql
begin;
  insert into public.categories (id, user_id, name, type)
  values ('a1111111-1111-1111-1111-111111111111',
          'UUID_A', 'Paquete temporal (diferida)', 'expense');

  insert into public.budgets (user_id, category_id, period_month, effective_from, amount_minor)
  values ('UUID_A', 'a1111111-1111-1111-1111-111111111111',
          '2026-12-01', '2026-12-01', 300000);

  -- Aquí el presupuesto todavía referencia a la categoría. Con una FK
  -- NOT DEFERRABLE esto fallaría; con `deferrable initially deferred` la
  -- comprobación se pospone al commit de abajo.
  delete from public.categories
  where id = 'a1111111-1111-1111-1111-111111111111';

  -- Se elimina la referencia pendiente antes del commit
  delete from public.budgets
  where category_id = 'a1111111-1111-1111-1111-111111111111';
commit;

select count(*) as categorias_sobrantes
from public.categories
where id = 'a1111111-1111-1111-1111-111111111111';
```

Esperado: el `commit` no da error y `categorias_sobrantes = 0`.

Contraprueba de que el diferimiento es lo que lo permite: si el bloque anterior
se repite **sin** borrar el presupuesto antes del commit, la transacción falla
con `update or delete on table "categories" violates foreign key constraint
"budgets_category_same_user_fkey"`.

Esto es exactamente lo que necesita la cadena de borrado de un usuario: al
borrar un `auth.users`, la cascada elimina `categories` y `budgets` en la misma
transacción, y la FK compuesta se comprueba recién al commit, cuando ya no
queda ninguna fila.

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
