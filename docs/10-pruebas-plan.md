# FinTrack — Pruebas SQL del Plan mensual

> Suite manual para el editor SQL de Supabase. Fase 8.7.

## Estado

Las tres migraciones de la fase están **aplicadas** y el historial de
migraciones está **sincronizado**: `LOCAL` y `REMOTE` coinciden en las seis
versiones.

| Migración | Versión | Estado |
| --- | --- | --- |
| M1 — `ampliar_tipos_de_cuenta` | `20260909032514` | Aplicada |
| M2 — `crear_clasificacion_categorias` | `20260909231843` | Aplicada |
| M3 — `crear_plan_mensual` | `20260910015311` | Aplicada |

**Qué se ha verificado de M3:**

- **Ensayo completo** del archivo dentro de `begin; … rollback;` contra el
  esquema real, sin errores, y con las cinco tablas todavía inexistentes
  después del rollback.
- **Auditoría estructural** posterior a la aplicación: **21 de 21 controles en
  `OK`** — cinco tablas, RLS en las cinco, veinte políticas, nueve CHECK, nueve
  UNIQUE, dos únicos parciales, catorce claves foráneas, tres funciones, siete
  triggers, y `prosecdef = false` con `search_path=""` en las tres funciones.

**Ejecución funcional — completada.** El preflight P.1–P.4 y los bloques 0 a 4
se ejecutaron contra el proyecto real con dos identidades de prueba dedicadas,
vía `supabase db query --linked` (80 ejecuciones, cada una en su propia
transacción con `rollback`). Verificación de limpieza posterior: conteo de
filas reales en las ocho tablas involucradas para ambas identidades → 0 en
todas. Resultado: 77 de 80 coinciden exactamente con lo documentado. Tres
discrepancias quedaron registradas en «Hallazgos de la ejecución», ninguna
bloqueante — el esquema rechaza y permite lo que debe en los tres casos; lo
que difiere es el mecanismo que rechaza primero o el canal de ejecución usado
para probarlo.

## Hallazgos de la ejecución

Tres discrepancias entre lo documentado y el comportamiento observado. En
los tres, la fila inválida sigue rechazada y la válida sigue aceptada: lo que
difiere es el mecanismo, el mensaje exacto, o la cobertura alcanzable con los
datos que el propio bloque crea.

### H1 — 1.7 y el patrón `UNION ALL` con literales sin tipar

La sentencia de 1.7, copiada tal cual, falla contra el proyecto real vía
`supabase db query --linked`:

```
ERROR: 42804: column "user_id" is of type uuid but expression is of type text
```

El error ocurre en la resolución de tipos del `UNION ALL`, antes de llegar a
`plan_allocations_plan_month_id_budget_group_key` (U5), que es lo que el caso
quiere probar. Con un cast explícito (`'<UUID_A>'::uuid`, y `::date` para
`period_month` si el `UNION ALL` también combina fechas) la sentencia sí llega
a la restricción y falla exactamente como se predice. No se determinó si la
SQL Editor de Supabase resuelve el tipo de otra forma; el hallazgo es
específico del canal `supabase db query --linked`.

**Acción recomendada:** añadir `::uuid` (y `::date` donde aplique) a los
literales de cualquier bloque de esta guía que combine dos `select` con
`UNION ALL`, para que la suite sea reproducible sin importar el canal.

### H2 — 1.8-c, 1.8-e y 3.3: el trigger antecede al CHECK del eje cuando ambos son `null`

Documentado como fallo de `plan_lines_category_axis_check` (C5). El error
real es el de `validate_plan_line()`:

| Caso | Mensaje real |
| --- | --- |
| 1.8-c | `Tipo de línea medido por cuenta no contemplado: bill.` |
| 1.8-e | `La cuenta indicada no existe o no pertenece al usuario.` |
| 3.3 | `La cuenta indicada no existe o no pertenece al usuario.` |

En los tres, `category_id` llega `null` a la fila (en 3.3, porque la
categoría es de `<UUID_B>` y RLS la oculta) y `account_id` también es `null`.
El trigger `BEFORE` evalúa el eje cuenta antes de que el CHECK declarativo del
eje categoría tenga oportunidad de dispararse — mismo patrón de precedencia
que ya documentan 0.2 y 0.8-b para `category_classifications`, pero no
anotado aquí para `plan_lines`. La fila sigue rechazada en los tres casos.

**Acción recomendada:** anotar esta precedencia junto a la tabla de 1.8, igual
que se hizo para el Bloque 0, y ajustar el mensaje esperado de 3.3 a uno de
los dos anteriores según corresponda.

### H3 — 1.13-c: cobertura parcial, prevista por la propia guía

El bloque de 1.13-c nunca crea la categoría `M3 ingreso B` para `<UUID_B>`.
Al ejecutarlo tal cual, `validate_income_source_category()` rechaza la fila
por categoría inexistente antes de llegar a `SET CONSTRAINTS`, así que la FK
diferida `plan_income_source_categories_source_same_user_fkey` queda sin
ejercitar en esta pasada. La propia guía anticipa este desenlace («si el
`INSERT` falla antes por política, el caso queda parcialmente cubierto:
anótalo y sigue»), así que no se trató como bloqueante.

**Acción recomendada:** si se quiere cobertura directa de F4b, añadir al
bloque la creación previa de `M3 ingreso B` para `<UUID_B>` antes del cambio
de identidad.

## Reglas de seguridad de la suite

1. **Identidades dedicadas.** Los bloques usan `<UUID_A>` y `<UUID_B>`, creadas
   expresamente para pruebas desde *Authentication > Add user*. **No deben
   ejecutarse contra datos reales** ni contra una identidad que los contenga.
2. **Restricciones diferibles.** Todo caso que dependa de una clave foránea o
   de un trigger `deferrable initially deferred` debe ejecutar
   `set constraints … immediate;` **antes del `rollback;`**, tanto si el caso
   debe fallar como si debe pasar. Sin esa línea la comprobación no llega a
   dispararse y la prueba no demuestra nada.
3. **Borrado de usuario.** El caso 4.12, el único que toca `auth.users`, es
   **opcional** y solo debe ejecutarse en un entorno de prueba aislado. Si el
   rol del editor no tiene permiso, se omite y se anota; no se elevan
   privilegios.

## Requisitos previos

1. **Dos identidades de prueba dedicadas**, creadas desde *Authentication > Add
   user*: `<UUID_A>` y `<UUID_B>`. **No usar una identidad existente con datos
   reales**, ni elevar privilegios en ningún caso.
2. Cada bloque es **autocontenido**: crea sus propias filas de apoyo, las usa y
   las revierte. Pueden ejecutarse en cualquier orden y repetirse.
3. **Todos terminan en `rollback;`.** Ninguno deja rastro.
4. Los identificadores se resuelven por subconsulta sobre nombres deterministas,
   así que no hay que pegar ids a mano: solo sustituir `<UUID_A>` y `<UUID_B>`.

---

## Las dos reglas de ejecución

### Identidad

Cada bloque simula el JWT del usuario con `request.jwt.claims`, que es lo que
lee `auth.uid()` dentro de las políticas y de las funciones. Es el método que
recomienda Supabase para probar políticas sin pasar por el flujo completo de
autenticación, y el mismo que usan `docs/05-pruebas-budgets.md` y
`docs/08-pruebas-hojas.md`:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';
```

### `SET CONSTRAINTS` es obligatorio

Las claves foráneas de propiedad y el trigger T4 son `deferrable initially
deferred`: solo se comprueban al commit. En un bloque que termina en `rollback;`
ese momento **nunca llega**, así que la comprobación no se dispara y la prueba
pasaría siempre sin haber probado nada.

Por eso, toda prueba que dependa de una restricción diferida fuerza la
comprobación antes de revertir, **tanto si el caso debe fallar como si debe
pasar**:

```sql
set constraints all immediate;
```

Cuando ayuda al diagnóstico se nombra la restricción concreta, sin prefijo de
esquema:

```sql
set constraints check_plan_allocations_sum_trigger immediate;
set constraints plan_income_source_categories_source_same_user_fkey immediate;
set constraints plan_income_sources_plan_month_id_position_key deferred;
```

Un `SET CONSTRAINTS ... DEFERRED` debe ejecutarse **antes** del DML que necesita
el estado temporalmente duplicado.

### Cuando el caso está diseñado para fallar en `SET CONSTRAINTS`

- **El error aparece en `SET CONSTRAINTS`**, no en el `INSERT`/`UPDATE`/`DELETE`.
  El DML se acepta sin protestar; la violación emerge al forzar la comprobación.
- **Después del error la transacción queda abortada.** Cualquier sentencia
  posterior devuelve `current transaction is aborted, commands ignored until end
  of transaction block`.
- **El cierre seguro es `rollback;`.** Hay que ejecutarlo igualmente.

### Etiquetas

| Etiqueta | Dónde salta el error |
| --- | --- |
| **[RLS]** | En la sentencia, por política de seguridad a nivel de fila |
| **[Inmediata]** | En la sentencia, por restricción no diferible |
| **[Trigger]** | En la sentencia, por función de validación `BEFORE` |
| **[Diferida]** | **En `SET CONSTRAINTS`** |

### Qué no admite `SET CONSTRAINTS`

`U10` y `U11` —`plan_lines_plan_month_id_category_id_key` y
`plan_lines_plan_month_id_account_id_key`— son **índices únicos parciales**, no
restricciones: una restricción única no admite cláusula `WHERE`. Por tanto no
pueden nombrarse en `SET CONSTRAINTS` ni diferirse, y sus violaciones saltan
siempre en la propia sentencia. Nombrarlos daría `constraint ... does not exist`.

---

## Qué no se prueba aquí

La aritmética del Plan mensual —reparto por mayor resto, exclusión de
transferencias entre cuentas del mismo tipo, identidades de las dos particiones
del gasto, convención de diferencia favorable— es **lógica pura** y se prueba
con Vitest en el paso 2 de la fase. Duplicarla en SQL crearía dos definiciones
de la misma regla, que acabarían divergiendo.

Tampoco se prueba aquí que una transferencia registrada hacia una cuenta
`credit_card` quede fuera de todos los agregados: es una consecuencia de las
consultas, no una garantía de la base de datos.

---

# Preflight de fixtures

Se ejecuta **antes de aplicar M3** y **antes de cualquier bloque**. Confirma que
el rol `authenticated` puede crear y leer las filas de apoyo que los bloques dan
por hechas, con las columnas que realmente usan.

No toca ninguna tabla del Plan mensual: solo `categories` y `accounts`, que ya
existen desde la Fase 2. Por eso puede ejecutarse hoy, con M3 todavía sin
aplicar.

Cada apartado va por separado y termina en `rollback;`.

## Columnas obligatorias, verificadas contra el esquema

`public.categories` y `public.accounts` exigen únicamente `user_id`, `name` y
`type`. El resto tiene valor predeterminado: `is_system` y `is_archived` a
`false`, `initial_balance_minor` a `0`, `currency_code` a `'COP'`, y las marcas
de tiempo a `now()`.

Las fixtures pasan `initial_balance_minor` de forma explícita en las cuentas,
siguiendo el patrón de `docs/08-pruebas-hojas.md`, aunque tenga valor
predeterminado.

## Por qué el recuento importa

**Ni `categories` ni `accounts` tienen una restricción única sobre
`(user_id, name)`.** Los bloques resuelven los identificadores con subconsultas
del tipo:

```sql
(select id from public.categories
  where user_id = '<UUID_A>' and name = 'M3 gasto')
```

Si la identidad de prueba ya tuviera una fila con ese mismo nombre, la
subconsulta devolvería dos y PostgreSQL abortaría con
`more than one row returned by a subquery used as an expression`.

Por eso cada apartado del preflight comprueba que el `SELECT` devuelve
**exactamente una fila**, y P.4 verifica de antemano que ninguno de los nombres
de fixture colisiona con datos ya existentes. Si alguno colisiona, hay que
renombrar la fixture en los bloques; no hay bypass ni hace falta ninguno.

---

## P.1 — Categorías de `<UUID_A>`

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M3 preflight category', 'expense')
returning id, user_id, name, type;

select id, user_id, name, type
from public.categories
where user_id = '<UUID_A>'
  and name = 'M3 preflight category';

rollback;
```

**Esperado:** el `returning` devuelve 1 fila con `type = 'expense'` y el
`user_id` de A; el `select` devuelve **exactamente 1 fila**, la misma.

Si el `select` devolviera 0 filas, la política de `SELECT` sobre `categories` no
estaría dejando leer lo recién escrito y **ningún bloque funcionaría**.

## P.2 — Categorías de `<UUID_B>`

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_B>', 'M3 preflight category B', 'expense')
returning id, user_id, name, type;

select id, user_id, name, type
from public.categories
where user_id = '<UUID_B>'
  and name = 'M3 preflight category B';

rollback;
```

**Esperado:** igual que P.1, con el `user_id` de B. Nombre distinto a propósito:
los casos cruzados necesitan distinguir de quién es cada fila sin mirar el
`user_id`.

## P.3 — Cuentas de `<UUID_A>`, los cuatro tipos que usan los bloques

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.accounts (user_id, name, type, initial_balance_minor, is_archived)
values ('<UUID_A>', 'M3 preflight savings',    'savings',    0, false),
       ('<UUID_A>', 'M3 preflight investment', 'investment', 0, false),
       ('<UUID_A>', 'M3 preflight checking',   'checking',   0, false),
       ('<UUID_A>', 'M3 preflight archived',   'savings',    0, true)
returning id, user_id, name, type, is_archived;

select name, type, is_archived
from public.accounts
where user_id = '<UUID_A>'
  and name like 'M3 preflight%'
order by name;

rollback;
```

**Esperado:** 4 filas insertadas y 4 leídas, una por tipo. La fila
`investment` es además la confirmación en contexto de que M1 está aplicada: si
`accounts_type_check` no tuviera ese valor, el `INSERT` fallaría aquí.

## P.4 — Colisión de nombres de fixture

Lectura pura, sin escribir nada. Ejecutar con cada identidad.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

select 'categories' as tabla, name, count(*) as filas
from public.categories
where user_id = '<UUID_A>'
  and name in ('M2 gasto A', 'M2 gasto viejo', 'M2 ingreso A',
               'M3 gasto', 'M3 ingreso', 'M3 gasto viejo',
               'M3 preflight category')
group by name
union all
select 'accounts', name, count(*)
from public.accounts
where user_id = '<UUID_A>'
  and name in ('M3 ahorro', 'M3 inversion', 'M3 banco', 'M3 ahorro viejo',
               'M3 preflight savings', 'M3 preflight investment',
               'M3 preflight checking', 'M3 preflight archived')
group by name
order by tabla, name;

rollback;
```

**Esperado:** **0 filas.** Cualquier fila devuelta indica que ese nombre ya
existe en la identidad de prueba y que la subconsulta por nombre del bloque
correspondiente fallaría o resolvería la fila equivocada. En ese caso hay que
renombrar la fixture en los bloques, no eliminar el dato existente.

Repetir con `<UUID_B>` y sus nombres: `'M2 gasto B'`,
`'M3 preflight category B'`, `'M3 ingreso B'`.

---

## De qué depende cada bloque

| Bloque | Depende de | Qué usa |
| --- | --- | --- |
| **0** — `category_classifications` | **P.1, P.2, P.4** | Categorías `expense`, `income` y archivada de A. B solo para 0.1 |
| **1** — Integridad y RLS | **P.1, P.3, P.4** | Una categoría `expense` y una cuenta `savings` de A para 1.8–1.11. Categoría `income` de A para 1.13. Identidad de B para 1.1, 1.2 y 1.13-c |
| **2** — `validate_income_source_category` | **P.1, P.2, P.4** | Categorías `income` y `expense` de A; una categoría de B para 2.3 |
| **3** — `validate_plan_line` | **P.1, P.3, P.2, P.4** | El bloque más dependiente: tres categorías y cuatro cuentas de A, más una categoría y una cuenta de B para 3.3 y 3.7 |
| **4** — T4 | **ninguno** | Solo `plan_months` y `plan_allocations`, que crea él mismo. No toca `categories` ni `accounts` |

Consecuencia práctica: **si el preflight falla, el bloque 4 sigue siendo
ejecutable.** Es el único que no depende de fixtures externas, y por eso es el
que puede correrse primero si hay dudas sobre las identidades.

## Qué significa cada fallo del preflight

| Fallo | Diagnóstico | Qué hacer |
| --- | --- | --- |
| P.1 o P.2: el `INSERT` es denegado | La identidad no existe, o `request.jwt.claims` no se está aplicando | Revisar el UUID; sin esto no funciona ninguna prueba |
| P.1 o P.2: el `INSERT` pasa pero el `SELECT` devuelve 0 | La política de `SELECT` sobre `categories` no deja leer lo propio | Detenerse: sería un fallo de la Fase 2, no de M3 |
| P.3: falla la fila `investment` | M1 no está aplicada, o `accounts_type_check` no la incluye | Detenerse y reauditar M1 |
| P.4: devuelve alguna fila | Colisión de nombres con datos existentes | Renombrar la fixture en los bloques afectados |

En ningún caso se resuelve borrando datos de la identidad de prueba, elevando
privilegios ni desactivando controles.

---

# Bloque 0 — `category_classifications` (M2)

Valida el comportamiento de la tabla de M2: RLS, la restricción única y el
trigger `validate_category_classification`. M2 se aplicó manualmente y se
verificó por auditoría del esquema —que comprueba que las reglas *existen*—;
este bloque comprueba que *funcionan*.

## Orden de precedencia — leer antes de interpretar los resultados

En un `INSERT`, PostgreSQL evalúa en este orden:

1. **Triggers `BEFORE ROW`** → `validate_category_classification`
2. Restricciones `CHECK` y `NOT NULL`
3. **Política RLS `WITH CHECK`**
4. Índices únicos → `category_classifications_user_id_category_id_key`
5. **Claves foráneas** → diferidas al commit o a `SET CONSTRAINTS`

Ese orden tiene una consecuencia que conviene tener presente: **el trigger es
más estricto que la política y que la clave foránea para las rutas que
involucran otro usuario**, porque su `SELECT` sobre `categories` es
`security invoker` y RLS ya le oculta las categorías ajenas. Resultado: nunca
encuentra la categoría, y aborta antes de que la política o la clave lleguen a
evaluarse.

No es un defecto: son tres barreras independientes y la más externa gana. Lo
que sí es importante es **no confundir cuál rechazó**. Los casos afectados —0.2
y 0.8— lo indican explícitamente.

**No se eleva ningún privilegio, no se desactiva RLS y no se busca ninguna vía
para saltarse los controles.** Si una barrera resulta inalcanzable por estar
protegida por otra, se documenta y se deja así.

---

## 0.1 Usuario A no puede leer clasificaciones de B · **[RLS]**

**Mecanismo esperado:** la política `category_classifications_select_own`.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_B>', 'M2 gasto B', 'expense');

insert into public.category_classifications (user_id, category_id, budget_group)
select '<UUID_B>',
       (select id from public.categories
         where user_id = '<UUID_B>' and name = 'M2 gasto B'),
       'needs';

set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

select count(*) as deberia_ser_cero
from public.category_classifications
where user_id = '<UUID_B>';

set constraints all immediate;
rollback;
```

**Esperado:** `0`. La fila existe en la tabla; A simplemente no la ve.
`SET CONSTRAINTS` pasa sin error.

---

## 0.2 Usuario A no puede insertar con el `user_id` de B · **[Trigger]**

> **Precedencia.** El caso está pensado como prueba de RLS, pero **quien lo
> rechaza es el trigger**, no la política. Con la identidad de A, el `SELECT`
> del trigger sobre `categories` está sujeto a RLS y no encuentra ninguna
> categoría cuyo `user_id` sea el de B, así que aborta en el paso 1. La
> política `category_classifications_insert_own` sería la segunda barrera —
> `auth.uid() = user_id` es falso—, pero nunca llega a evaluarse.

**Mecanismo esperado:** `validate_category_classification`. Barrera de reserva:
la política de `INSERT`.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M2 gasto A', 'expense');

insert into public.category_classifications (user_id, category_id, budget_group)
select '<UUID_B>',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M2 gasto A'),
       'needs';

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `INSERT` con
`La categoría indicada no existe o no pertenece al usuario.`

Si en su lugar apareciera `new row violates row-level security policy for table
"category_classifications"`, significaría que el trigger dejó pasar la fila:
**anotarlo**, porque cambiaría la conclusión sobre cuál es la barrera efectiva.

---

## 0.3 `UNIQUE (user_id, category_id)` rechaza la doble clasificación · **[Inmediata]**

**Mecanismo esperado:**
`category_classifications_user_id_category_id_key`. El trigger pasa —la
categoría es de A, de gasto y activa—, la política pasa, y la violación aparece
en el índice único.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M2 gasto A', 'expense');

insert into public.category_classifications (user_id, category_id, budget_group)
select '<UUID_A>',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M2 gasto A'),
       v.grupo
from (values ('needs'), ('wants')) as v(grupo);

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `INSERT` —
`duplicate key value violates unique constraint
"category_classifications_user_id_category_id_key"`.

**Variante permitida:** la misma categoría clasificada por dos usuarios
distintos es válida, porque la clave incluye `user_id`. Requiere que cada
usuario use su propia categoría, así que en la práctica queda cubierto por 0.1.

---

## 0.4 Rechaza una categoría `income` al insertar · **[Trigger]**

**Mecanismo esperado:** `validate_category_classification`, rama del tipo.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M2 ingreso A', 'income');

insert into public.category_classifications (user_id, category_id, budget_group)
select '<UUID_A>',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M2 ingreso A'),
       'needs';

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `INSERT` —
`Solo se pueden clasificar categorías de gasto; la indicada es de tipo income.`

---

## 0.5 Rechaza una categoría archivada al insertar · **[Trigger]**

**Mecanismo esperado:** `validate_category_classification`, rama de
`is_archived`. Es la mitad «prohibido estrenar» de la regla.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.categories (user_id, name, type, is_archived)
values ('<UUID_A>', 'M2 gasto viejo', 'expense', true);

insert into public.category_classifications (user_id, category_id, budget_group)
select '<UUID_A>',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M2 gasto viejo'),
       'needs';

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `INSERT` —
`No se puede clasificar una categoría archivada.`

---

## 0.6 Rechaza cambiar `user_id` en un `UPDATE` · **[Trigger]**

**Mecanismo esperado:** `validate_category_classification`, primera
comprobación. Es la única que no depende de la categoría, y por eso funciona
aunque la escritura no pase por RLS.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M2 gasto A', 'expense');

insert into public.category_classifications (user_id, category_id, budget_group)
select '<UUID_A>',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M2 gasto A'),
       'needs';

update public.category_classifications
set user_id = '<UUID_B>'
where user_id = '<UUID_A>';

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `UPDATE` —
`No se puede cambiar el propietario de una clasificación.`

---

## 0.7 Permite editar solo `budget_group` si la categoría cambió después · **[Trigger]**

**Mecanismo esperado:** **ninguno debe rechazar.** Es la mitad «no prohibido
conservar»: el `SELECT` sobre `categories` vive dentro de
`if v_category_is_new`, así que un `UPDATE` que no toca `category_id` ni
siquiera consulta la categoría.

### 0.7-a — la categoría se archivó después

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M2 gasto A', 'expense');

insert into public.category_classifications (user_id, category_id, budget_group)
select '<UUID_A>',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M2 gasto A'),
       'needs';

update public.categories set is_archived = true
where user_id = '<UUID_A>' and name = 'M2 gasto A';

update public.category_classifications set budget_group = 'wants'
where user_id = '<UUID_A>';

select budget_group from public.category_classifications
where user_id = '<UUID_A>';

set constraints all immediate;
rollback;
```

**Esperado:** el segundo `UPDATE` **pasa**, el `SELECT` devuelve `wants`, y
`SET CONSTRAINTS` no falla.

### 0.7-b — la categoría pasó a ser de ingreso después

Igual que 0.7-a, sustituyendo el `UPDATE` intermedio por:

```sql
update public.categories set type = 'income'
where user_id = '<UUID_A>' and name = 'M2 gasto A';
```

**Esperado:** el `UPDATE` de `budget_group` **pasa** igualmente.

Este par es el que garantiza que archivar o reclasificar una categoría **no
bloquee la corrección de los meses ya cerrados**. Si alguno fallara, la regla
habría dejado de ser *prohibido estrenar* para convertirse en *prohibido tocar*.

---

## 0.8 La clave foránea compuesta de propiedad · **[Diferida]**

`category_classifications_category_same_user_fkey` es
`(category_id, user_id) → categories (id, user_id)`, `on delete no action
deferrable initially deferred`.

### 0.8-a — la clave existe, es nombrable y es diferible

**Mecanismo esperado:** ninguno debe rechazar. Lo que se prueba es que
`SET CONSTRAINTS` acepta el nombre y que una fila válida sobrevive a la
comprobación forzada. Un error de nombre daría `constraint ... does not exist`,
y una fila inválida fallaría aquí.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M2 gasto A', 'expense');

insert into public.category_classifications (user_id, category_id, budget_group)
select '<UUID_A>',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M2 gasto A'),
       'needs';

set constraints category_classifications_category_same_user_fkey immediate;
rollback;
```

**Esperado:** `SET CONSTRAINTS` pasa sin error.

### 0.8-b — el caso cruzado no llega a la clave

> **Precedencia.** Para que la clave foránea rechace algo haría falta una fila
> cuyo `category_id` pertenezca a un usuario y cuyo `user_id` sea otro. Esa fila
> **no se puede insertar por la vía normal**: el trigger aborta antes, porque su
> `SELECT` es `security invoker` y RLS ya le oculta la categoría ajena.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M2 gasto A', 'expense');

-- Intento de fila cruzada: categoría de A, propietario declarado B.
insert into public.category_classifications (user_id, category_id, budget_group)
select '<UUID_B>',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M2 gasto A'),
       'needs';

set constraints category_classifications_category_same_user_fkey immediate;
rollback;
```

**Esperado:** falla en el `INSERT` con
`La categoría indicada no existe o no pertenece al usuario.` **El error aparece
en el `INSERT`, no en `SET CONSTRAINTS`.**

**Conclusión que hay que registrar:** la clave foránea es una **segunda barrera
declarativa**, no la primera. Protege contra escrituras que no pasen por el
trigger —una migración futura, una corrección manual, un `security definer` mal
escrito—, y por eso tiene valor aunque hoy sea inalcanzable desde el cliente. Su
existencia y diferibilidad quedan probadas por 0.8-a.

**No se intenta forzarla** desactivando el trigger, elevando privilegios ni
saltándose RLS. Si se quisiera cobertura directa, el sitio correcto sería una
instancia de prueba desechable donde deshabilitar el trigger sea inocuo; queda
anotado como pendiente, no como omisión silenciosa.

---

## Resumen del bloque

| Caso | Etiqueta | Mecanismo que rechaza o permite |
| --- | --- | --- |
| 0.1 | **[RLS]** | Política `category_classifications_select_own` |
| 0.2 | **[Trigger]** | `validate_category_classification` — **precede a RLS** |
| 0.3 | **[Inmediata]** | `category_classifications_user_id_category_id_key` |
| 0.4 | **[Trigger]** | Rama del tipo de categoría |
| 0.5 | **[Trigger]** | Rama de `is_archived` |
| 0.6 | **[Trigger]** | Prohibición de cambiar `user_id` |
| 0.7-a/b | **[Trigger]** | Ninguno: debe **permitir** |
| 0.8-a | **[Diferida]** | Ninguno: la clave acepta la fila válida |
| 0.8-b | **[Trigger]** | `validate_category_classification` — **precede a la clave** |

Nueve ejecuciones, ocho casos. Dos —0.2 y 0.8-b— documentan una **precedencia**
en vez de la barrera que su nombre sugiere; es información sobre el sistema, no
un fallo de la prueba.

---

# Bloque 1 — Integridad, constraints y RLS

## 1.1 Aislamiento entre usuarios · **[RLS]**

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01');

set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

select
  (select count(*) from public.plan_months
     where period_month = '2026-09-01')                       as meses,
  (select count(*) from public.plan_allocations)              as allocations,
  (select count(*) from public.plan_income_sources)           as fuentes,
  (select count(*) from public.plan_income_source_categories) as puente,
  (select count(*) from public.plan_lines)                    as lineas;

set constraints all immediate;
rollback;
```

**Esperado:** los cinco recuentos a `0`; `SET CONSTRAINTS` pasa sin error.

## 1.2 Escritura con `user_id` ajeno · **[RLS]**

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01');

set constraints all immediate;
rollback;
```

**Esperado:** el `INSERT` falla — `new row violates row-level security policy for
table "plan_months"`.

## 1.3 El rol `anon` no lee nada · **[RLS]**

```sql
begin;
set local role anon;

select
  (select count(*) from public.plan_months)                   as meses,
  (select count(*) from public.plan_allocations)              as allocations,
  (select count(*) from public.plan_income_sources)           as fuentes,
  (select count(*) from public.plan_income_source_categories) as puente,
  (select count(*) from public.plan_lines)                    as lineas;

rollback;
```

**Esperado:** los cinco a `0`.

## 1.4 C1 — `period_month` debe ser el día 1 · **[Inmediata]**

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-15');

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `INSERT` —
`plan_months_period_month_is_month_start_check`.

## 1.5 U2 — un plan por usuario y mes · **[Inmediata]**

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01'), ('<UUID_A>', '2026-09-01');

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `INSERT` — `plan_months_user_id_period_month_key`.

## 1.6 C9 — `percent_bp` fuera de rango · **[Inmediata]**

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

with m as (
  insert into public.plan_months (user_id, period_month)
  values ('<UUID_A>', '2026-09-01')
  returning id
)
insert into public.plan_allocations (user_id, plan_month_id, budget_group, percent_bp)
select '<UUID_A>', m.id, 'needs', 10001 from m;

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `INSERT`, por el CHECK de `percent_bp`. Repetir con
`-1`.

## 1.7 U5 — un grupo por mes · **[Inmediata]**

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

with m as (
  insert into public.plan_months (user_id, period_month)
  values ('<UUID_A>', '2026-09-01')
  returning id
)
insert into public.plan_allocations (user_id, plan_month_id, budget_group, percent_bp)
select '<UUID_A>', m.id, 'needs', 5000 from m
union all
select '<UUID_A>', m.id, 'needs', 5000 from m;

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `INSERT` —
`plan_allocations_plan_month_id_budget_group_key`.

## 1.8 C5, C6 y C7 — el eje y el importe · **[Inmediata]**

Plantilla completa. Solo cambia el `INSERT` final según la variante.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01');

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M3 gasto', 'expense');

insert into public.accounts (user_id, name, type, initial_balance_minor)
values ('<UUID_A>', 'M3 ahorro', 'savings', 0);

-- VARIANTE (a): bill con planned_minor
insert into public.plan_lines
  (user_id, plan_month_id, period_month, kind, name,
   category_id, account_id, planned_minor, position)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       '2026-09-01', 'bill', 'Arriendo',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M3 gasto'),
       null, 500000, 0;

set constraints all immediate;
rollback;
```

Variantes: sustituir las cuatro últimas expresiones del `select`
(`category_id`, `account_id`, `planned_minor`, `position`) y el `kind`.

| Var | `kind` | `category_id` | `account_id` | `planned_minor` | Esperado |
| --- | --- | --- | --- | --- | --- |
| a | `bill` | categoría | `null` | `500000` | falla: `plan_lines_planned_minor_follows_axis_check` |
| b | `savings` | `null` | cuenta | `null` | falla: `plan_lines_planned_minor_follows_axis_check` |
| c | `bill` | `null` | cuenta | `null` | falla: `plan_lines_category_axis_check` |
| d | `savings` | categoría | `null` | `500000` | falla: `plan_lines_account_axis_check` |
| e | `bill` | `null` | `null` | `null` | falla: `plan_lines_category_axis_check` |
| f | `bill` | categoría | `null` | `null` | **1 fila insertada** |
| g | `savings` | `null` | cuenta | `0` | **1 fila insertada** |

Expresión de la cuenta, para las variantes que la usan:

```sql
(select id from public.accounts
  where user_id = '<UUID_A>' and name = 'M3 ahorro')
```

## 1.9 C3 y C4 — la fecha esperada · **[Inmediata]**

Misma plantilla que 1.8, añadiendo `due_date` a la lista de columnas.

| Var | `kind` | `due_date` | Esperado |
| --- | --- | --- | --- |
| a | `variable` | `'2026-09-10'` | falla: `plan_lines_due_date_only_bill_check` |
| b | `bill` | `'2026-10-10'` | falla: `plan_lines_due_date_within_period_check` |
| c | `bill` | `'2026-09-10'` | **1 fila insertada** |

## 1.10 F7 — `period_month` no puede desviarse · **[Inmediata]**

Misma plantilla que 1.8, variante (f), cambiando el literal `'2026-09-01'` del
`period_month` de la línea por `'2026-10-01'`, sin tocar el `plan_month_id`.

**Esperado:** falla en el `INSERT` — `plan_lines_plan_month_period_fkey`. Es la
clave que sostiene C4: sin ella, `period_month` sería un dato libre.

## 1.11 U10 y U11 — una línea por categoría y por cuenta · **[Inmediata]**

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01'), ('<UUID_A>', '2026-10-01');

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M3 gasto', 'expense');

-- (a) dos líneas sobre la misma categoría y el mismo mes
insert into public.plan_lines
  (user_id, plan_month_id, period_month, kind, name, category_id, position)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       '2026-09-01', 'bill', v.nombre,
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M3 gasto'),
       v.pos
from (values ('Arriendo', 0), ('Internet', 1)) as v(nombre, pos);

set constraints all immediate;
rollback;
```

**Esperado (a):** falla en el `INSERT` —
`plan_lines_plan_month_id_category_id_key`.

**Variante (b):** la segunda línea sobre `'2026-10-01'` con
`period_month = '2026-10-01'` → **permitido**. Confirma que el índice es por mes
y no global.

**Variante (c):** dos líneas `savings` sobre la misma cuenta y el mismo mes →
falla: `plan_lines_plan_month_id_account_id_key`.

Los tres saltan en la sentencia: son índices parciales y no admiten
`SET CONSTRAINTS`.

## 1.12 U8 y U12 — intercambio de posiciones · **[Diferida]**

Sin diferir, debe fallar:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01');

insert into public.plan_income_sources
  (user_id, plan_month_id, name, planned_minor, position)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       v.nombre, 0, v.pos
from (values ('Salario', 0), ('Freelance', 1)) as v(nombre, pos);

update public.plan_income_sources set position = 1
where user_id = '<UUID_A>' and name = 'Salario';

set constraints all immediate;
rollback;
```

**Esperado:** falla en el `UPDATE` —
`plan_income_sources_plan_month_id_position_key`.

Difiriendo antes del DML, debe pasar:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';
set constraints plan_income_sources_plan_month_id_position_key deferred;

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01');

insert into public.plan_income_sources
  (user_id, plan_month_id, name, planned_minor, position)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       v.nombre, 0, v.pos
from (values ('Salario', 0), ('Freelance', 1)) as v(nombre, pos);

update public.plan_income_sources set position = 1
where user_id = '<UUID_A>' and name = 'Salario';
update public.plan_income_sources set position = 0
where user_id = '<UUID_A>' and name = 'Freelance';

set constraints all immediate;
rollback;
```

**Esperado:** ambos `UPDATE` pasan y `SET CONSTRAINTS` **no** falla. Repetir con
`plan_lines_plan_month_id_position_key`.

## 1.13 U9, F4 y F4b — el puente de ingresos

| Caso | Etiqueta | Acción | Esperado |
| --- | --- | --- | --- |
| a | **[Inmediata]** | La misma categoría de ingreso en dos fuentes del mismo mes | falla en el `INSERT`: `plan_income_source_categories_plan_month_id_category_id_key` |
| b | **[Inmediata]** | Puente cuyo `plan_month_id` no es el de su fuente | falla en el `INSERT`: `plan_income_source_categories_source_month_fkey` |
| c | **[Diferida]** | Puente cuyo `user_id` difiere del de su fuente | **falla en `SET CONSTRAINTS`** |

Caso c, con el nombre concreto para diagnóstico:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01');

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M3 ingreso', 'income');

insert into public.plan_income_sources
  (user_id, plan_month_id, name, planned_minor, position)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       'Salario', 3000000, 0;

-- El puente con el user_id de B: la clave foránea diferida es la que debe
-- rechazarlo. Requiere la identidad de B para poder insertarlo.
set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

insert into public.plan_income_source_categories
  (user_id, plan_month_id, plan_income_source_id, category_id)
select '<UUID_B>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       (select id from public.plan_income_sources
         where user_id = '<UUID_A>' and name = 'Salario'),
       (select id from public.categories
         where user_id = '<UUID_B>' and name = 'M3 ingreso B');

set constraints plan_income_source_categories_source_same_user_fkey immediate;
rollback;
```

**Esperado:** el error aparece en `SET CONSTRAINTS`, no en el `INSERT`. La
transacción queda abortada; cerrar con `rollback;`. Es el caso que justifica la
clave añadida: sin ella, ese puente se insertaría.

> Requiere que `<UUID_B>` tenga una categoría de ingreso llamada
> `M3 ingreso B` y visibilidad sobre el mes de A, que RLS le niega. Si el
> `INSERT` falla antes por política, el caso queda **parcialmente cubierto**:
> anótalo y sigue. La clave sigue siendo correcta; simplemente RLS la protege
> antes.

## 1.14 Longitud de `name` · **[Inmediata]**

| Var | Valor | Esperado |
| --- | --- | --- |
| a | `'   '` | falla: CHECK de longitud |
| b | 81 caracteres — `repeat('a', 81)` | falla: CHECK de longitud |
| c | 80 caracteres — `repeat('a', 80)` | **1 fila insertada** |

Probar en `plan_income_sources.name` y en `plan_lines.name`.

---

# Bloque 2 — `validate_income_source_category` · **[Trigger]**

Todos los errores de este bloque aparecen en el `INSERT`/`UPDATE`: son de
trigger `BEFORE`, no de restricción diferida.

Plantilla de fixtures:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01');

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M3 ingreso', 'income'),
       ('<UUID_A>', 'M3 gasto',   'expense');

insert into public.plan_income_sources
  (user_id, plan_month_id, name, planned_minor, position)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       'Salario', 3000000, 0;

-- ← acción del caso

set constraints all immediate;
rollback;
```

Acción base, que se reutiliza cambiando el nombre de la categoría:

```sql
insert into public.plan_income_source_categories
  (user_id, plan_month_id, plan_income_source_id, category_id)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       (select id from public.plan_income_sources
         where user_id = '<UUID_A>' and name = 'Salario'),
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M3 gasto');
```

| # | Acción | Esperado |
| --- | --- | --- |
| 2.1 | La acción base, con `M3 gasto` | `Una fuente de ingreso solo puede vincularse a categorías de ingreso; la indicada es de tipo expense.` |
| 2.2 | `update public.categories set is_archived = true where user_id = '<UUID_A>' and name = 'M3 ingreso';` y después la acción base con `M3 ingreso` | `No se puede vincular una categoría archivada.` |
| 2.3 | La acción base apuntando a una categoría de `<UUID_B>` | `La categoría indicada no existe o no pertenece al usuario.` |
| 2.4 | Puente válido y después `update public.plan_income_source_categories set user_id = '<UUID_B>';` | `No se puede cambiar el propietario de un vínculo de ingreso.` |

## 2.5 Prohibido estrenar, no prohibido conservar

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01');

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'M3 ingreso', 'income');

insert into public.plan_income_sources
  (user_id, plan_month_id, name, planned_minor, position)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       'Salario', 3000000, 0;

insert into public.plan_income_source_categories
  (user_id, plan_month_id, plan_income_source_id, category_id)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       (select id from public.plan_income_sources
         where user_id = '<UUID_A>' and name = 'Salario'),
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M3 ingreso');

update public.categories set is_archived = true
where user_id = '<UUID_A>' and name = 'M3 ingreso';

-- Editar el puente SIN cambiar category_id.
update public.plan_income_source_categories
set plan_income_source_id = plan_income_source_id
where user_id = '<UUID_A>';

set constraints all immediate;
rollback;
```

**Esperado:** el último `UPDATE` **pasa** y `SET CONSTRAINTS` tampoco falla. Es
el caso que distingue las dos semánticas y el que garantiza que archivar una
categoría no bloquee los meses ya cerrados.

---

# Bloque 3 — `validate_plan_line` · **[Trigger]**

Todos los errores aparecen en el `INSERT`/`UPDATE`.

Plantilla de fixtures:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01');

insert into public.categories (user_id, name, type, is_archived)
values ('<UUID_A>', 'M3 gasto',       'expense', false),
       ('<UUID_A>', 'M3 ingreso',     'income',  false),
       ('<UUID_A>', 'M3 gasto viejo', 'expense', true);

insert into public.accounts (user_id, name, type, initial_balance_minor, is_archived)
values ('<UUID_A>', 'M3 ahorro',       'savings',    0, false),
       ('<UUID_A>', 'M3 inversion',    'investment', 0, false),
       ('<UUID_A>', 'M3 banco',        'checking',   0, false),
       ('<UUID_A>', 'M3 ahorro viejo', 'savings',    0, true);

-- ← acción del caso

set constraints all immediate;
rollback;
```

Acción para el eje categoría:

```sql
insert into public.plan_lines
  (user_id, plan_month_id, period_month, kind, name, category_id, position)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       '2026-09-01', 'bill', 'Prueba',
       (select id from public.categories
         where user_id = '<UUID_A>' and name = 'M3 ingreso'),
       0;
```

Acción para el eje cuenta:

```sql
insert into public.plan_lines
  (user_id, plan_month_id, period_month, kind, name,
   account_id, planned_minor, position)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       '2026-09-01', 'savings', 'Prueba',
       (select id from public.accounts
         where user_id = '<UUID_A>' and name = 'M3 banco'),
       100000, 0;
```

| # | Caso | Esperado |
| --- | --- | --- |
| 3.1 | `bill` con `M3 ingreso` | `Una línea de plan solo puede apuntar a categorías de gasto; la indicada es de tipo income.` |
| 3.2 | `variable` con `M3 gasto viejo` | `No se puede planificar sobre una categoría archivada.` |
| 3.3 | `bill` con una categoría de `<UUID_B>` | `La categoría indicada no existe o no pertenece al usuario.` |
| 3.4 | `savings` sobre `M3 banco` | `Una línea de ahorro requiere una cuenta de tipo savings; la indicada es de tipo checking.` |
| 3.5 | `investment` sobre `M3 ahorro` | `Una línea de inversión requiere una cuenta de tipo investment; la indicada es de tipo savings.` |
| 3.6 | `savings` sobre `M3 ahorro viejo` | `No se puede planificar sobre una cuenta archivada.` |
| 3.7 | `savings` sobre una cuenta de `<UUID_B>` | `La cuenta indicada no existe o no pertenece al usuario.` |
| 3.8 | Línea válida y después `update public.plan_lines set user_id = '<UUID_B>';` | `No se puede cambiar el propietario de una línea de plan.` |
| 3.9 | `savings` sobre `M3 ahorro` | **1 fila insertada** |
| 3.10 | `investment` sobre `M3 inversion` | **1 fila insertada** |

## 3.11 Cambiar `kind` revalida el destino

```sql
-- Tras insertar una línea 'savings' sobre 'M3 ahorro':
update public.plan_lines set kind = 'investment'
where user_id = '<UUID_A>' and name = 'Prueba';
```

**Esperado:** `Una línea de inversión requiere una cuenta de tipo investment; la
indicada es de tipo savings.` Confirma que el `kind` entra en la detección de
«estrena destino», no solo la categoría y la cuenta.

## 3.12 Prohibido estrenar, no prohibido conservar

```sql
-- Tras insertar una línea 'bill' sobre 'M3 gasto':
update public.categories set is_archived = true
where user_id = '<UUID_A>' and name = 'M3 gasto';

update public.plan_lines set name = 'Renombrada'
where user_id = '<UUID_A>' and name = 'Prueba';
```

**Esperado:** el segundo `UPDATE` **pasa.** El destino no se estrena, así que no
se revalida.

---

# Bloque 4 — T4, la suma del reparto · **[Diferida]**

**Todo este bloque depende del constraint trigger diferido.** Sin
`SET CONSTRAINTS` antes del `rollback;`, los casos 4.3, 4.5, 4.6 y 4.9 —los que
deben fallar— parecerían pasar.

Plantilla:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01'), ('<UUID_A>', '2026-10-01');

-- ← fixtures de allocations y acción del caso

set constraints check_plan_allocations_sum_trigger immediate;
rollback;
```

Atajo para insertar un reparto en septiembre:

```sql
insert into public.plan_allocations (user_id, plan_month_id, budget_group, percent_bp)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       v.grupo, v.bp
from (values ('needs', 5000), ('wants', 3000), ('savings', 2000)) as v(grupo, bp);
```

| # | Escenario | Acción | Esperado |
| --- | --- | --- | --- |
| 4.1 | Sin configurar | Crear los meses sin ninguna asignación | **Válido** |
| 4.2 | Suma correcta | El atajo tal cual | **Válido** |
| 4.3 | Suma incorrecta | Solo `('needs', 5000)` | **Falla en `SET CONSTRAINTS`:** `…deben sumar 10000 puntos base; suman 5000.` |
| 4.4 | Intermedio inválido | Atajo, después `needs → 4000` y `wants → 4000`, en ese orden | **Válido.** El intermedio suma 9000 |
| 4.5 | UPDATE que rompe | Atajo, después `needs → 6000` | **Falla en `SET CONSTRAINTS`**, suman 11000 |
| 4.6 | DELETE parcial | Atajo, después borrar `savings` | **Falla en `SET CONSTRAINTS`**, suman 8000 |
| 4.7 | DELETE total | Un único grupo a 10000 y borrarlo | **Válido**, vuelve a «sin configurar» |
| 4.8 | Cascada del mes | Atajo, después `delete from public.plan_months where user_id = '<UUID_A>' and period_month = '2026-09-01';` | **Válido.** Sin la salida por mes inexistente, esto fallaría |
| 4.9 | **Traslado sin compensar** | Ver SQL completo abajo | **Falla en `SET CONSTRAINTS`** |
| 4.10 | **Traslado compensado** | Ver SQL completo abajo | **Válido** |
| 4.11 | UPDATE sin traslado | Atajo, después `needs → 4000` y `wants → 4000` | **Válido** |
| 4.12 | Cascada del usuario | `delete from auth.users where id = '<UUID_A>';` | **Válido, sin error.** *Opcional — ver abajo* |

## 4.9 — traslado sin compensar

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01'), ('<UUID_A>', '2026-10-01');

insert into public.plan_allocations (user_id, plan_month_id, budget_group, percent_bp)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       v.grupo, v.bp
from (values ('needs', 5000), ('wants', 3000), ('savings', 2000)) as v(grupo, bp);

insert into public.plan_allocations (user_id, plan_month_id, budget_group, percent_bp)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-10-01'),
       v.grupo, v.bp
from (values ('needs', 6000), ('wants', 4000)) as v(grupo, bp);

update public.plan_allocations
set plan_month_id = (select id from public.plan_months
                      where user_id = '<UUID_A>' and period_month = '2026-10-01')
where budget_group = 'savings'
  and plan_month_id = (select id from public.plan_months
                        where user_id = '<UUID_A>' and period_month = '2026-09-01');

set constraints check_plan_allocations_sum_trigger immediate;
rollback;
```

**Esperado:** el `UPDATE` se acepta sin protestar. El error aparece en
`SET CONSTRAINTS`: septiembre queda en 8000 y octubre en 12000, así que salta
por cualquiera de los dos. Lo relevante es que **septiembre ya no pasa
desapercibido**.

## 4.10 — traslado compensado

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.plan_months (user_id, period_month)
values ('<UUID_A>', '2026-09-01'), ('<UUID_A>', '2026-10-01');

insert into public.plan_allocations (user_id, plan_month_id, budget_group, percent_bp)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-09-01'),
       v.grupo, v.bp
from (values ('needs', 5000), ('wants', 3000), ('savings', 2000)) as v(grupo, bp);

insert into public.plan_allocations (user_id, plan_month_id, budget_group, percent_bp)
select '<UUID_A>',
       (select id from public.plan_months
         where user_id = '<UUID_A>' and period_month = '2026-10-01'),
       v.grupo, v.bp
from (values ('needs', 6000), ('wants', 4000)) as v(grupo, bp);

update public.plan_allocations
set plan_month_id = (select id from public.plan_months
                      where user_id = '<UUID_A>' and period_month = '2026-10-01')
where budget_group = 'savings'
  and plan_month_id = (select id from public.plan_months
                        where user_id = '<UUID_A>' and period_month = '2026-09-01');

update public.plan_allocations set percent_bp = 7000
where budget_group = 'needs'
  and plan_month_id = (select id from public.plan_months
                        where user_id = '<UUID_A>' and period_month = '2026-09-01');

update public.plan_allocations set percent_bp = 4000
where budget_group = 'needs'
  and plan_month_id = (select id from public.plan_months
                        where user_id = '<UUID_A>' and period_month = '2026-10-01');

set constraints check_plan_allocations_sum_trigger immediate;
rollback;
```

**Esperado:** **válido.** Septiembre = 7000 + 3000 = 10000; octubre = 4000 +
4000 + 2000 = 10000. Ningún estado intermedio cuadra, y aun así la comprobación
diferida solo mira el final.

**4.9 y 4.10 son el par que justifica la corrección de T4.** Contra una versión
que solo resolviese `new.plan_month_id`, 4.9 pasaría sin error y dejaría
septiembre descuadrado en silencio.

## 4.12 — el único caso que toca `auth.users`

Va sobre `<UUID_A>`, identidad creada expresamente para pruebas, y dentro de una
transacción que revierte: la cuenta sigue existiendo al terminar.

**Si el rol del editor no tiene permiso sobre `auth.users`, omitir el caso y
anotarlo.** No elevar privilegios para forzarlo. La cascada ya está cubierta
indirectamente por 4.8, que ejercita la misma rama del trigger —la salida por
mes inexistente— con el borrado del `plan_months`.

---

# Casos que se omiten sin identidades de prueba seguras

## Si no existe `<UUID_B>`

| Caso | Qué se pierde |
| --- | --- |
| 1.1 | Aislamiento entre usuarios en las cinco tablas |
| 1.2 | Rechazo de escritura con `user_id` ajeno |
| 1.13-c | `plan_income_source_categories_source_same_user_fkey` queda sin probar |
| 2.3 | Categoría de otro usuario en el puente |
| 2.4 | Cambio de propietario del puente |
| 3.3 | Categoría de otro usuario en una línea |
| 3.7 | Cuenta de otro usuario en una línea |
| 3.8 | Cambio de propietario de una línea |

Sigue siendo válido el bloque 4 entero y el resto de 1, 2 y 3.

## Si no hay permiso sobre `auth.users`

| Caso | Qué se pierde |
| --- | --- |
| 4.12 | Cascada completa del borrado de usuario |

Cobertura parcial mediante 4.8.

## Si no existe ninguna identidad de prueba

**No se ejecuta nada.** Todos los bloques insertan filas con un `user_id` real y
las políticas exigen que coincida con `auth.uid()`. Sin identidad, el plan
entero queda pendiente; no hay variante degradada que merezca la pena.

---

# Cobertura

| Bloque | Casos | Cubre |
| --- | --- | --- |
| 0 | 8 | `category_classifications` (M2): RLS, U1, T1 y la FK compuesta |
| 1 | ~28 | RLS, C1–C9, U2, U5, U8–U12, F4, F4b, F7, longitudes |
| 2 | 5 | `validate_income_source_category` |
| 3 | 12 | `validate_plan_line`, ambos tipos de cuenta y el `else` defensivo |
| 4 | 12 | T4 completo, con traslado y cascadas |

## Qué se verificó en cada migración

- **M1** — `accounts_type_check` con los seis valores y
  `accounts_id_user_id_key` creada; comprobado con `pg_constraint`,
  `pg_indexes` y dos inserciones de prueba en transacción revertida: una cuenta
  `investment` aceptada y un tipo inventado rechazado con SQLSTATE 23514.
- **M2** — auditoría remota del esquema antes de registrar la migración en el
  historial: RLS activa, `validate_category_classification()` como
  `security invoker` con `search_path` vacío, y el filtro de pertenencia en su
  `SELECT`. **El comportamiento se ejecutó en el bloque 0: 9/9 coinciden con lo
  documentado**, incluidas las precedencias de 0.2 y 0.8-b.
- **M3** — ensayo completo en transacción revertida y auditoría estructural de
  21 controles, todos en `OK`. **Los bloques 1 a 4 se ejecutaron: 61/64
  coinciden con lo documentado**; las tres discrepancias están en «Hallazgos
  de la ejecución» (H1–H3), ninguna bloqueante.

## Trabajo pendiente

| Pendiente | Dónde |
| --- | --- |
| Aplicar los casts `::uuid`/`::date` de H1 a 1.7 (y a cualquier otro `UNION ALL` con literales) | Este documento |
| Anotar la precedencia trigger/CHECK de H2 junto a 1.8 y 3.3 | Este documento |
| Añadir `M3 ingreso B` al bloque de 1.13-c para cobertura directa de F4b (H3) | Este documento |
| Cobertura directa de la FK compuesta del puente (caso 0.8-b) | Requiere una instancia desechable donde deshabilitar el trigger sea inocuo |

Las expectativas escritas en los bloques son las **previstas**; la sección
«Hallazgos de la ejecución» documenta dónde el texto de esta guía todavía no
coincide con lo observado.
