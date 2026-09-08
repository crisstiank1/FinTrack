# FinTrack — Pruebas SQL de Hojas de cálculo

> 31 casos para ejecutar en el editor SQL de Supabase **después** de aplicar
> `20260907221059_crear_hojas.sql`. Ninguno depende de datos reales.

## Requisitos previos

1. Dos usuarios de prueba creados desde *Authentication > Add user*. **No uses
   cuentas ni datos financieros reales.**
2. Sustituye `<UUID_A>` y `<UUID_B>` por sus UUID.
3. Ejecuta los bloques en orden.

Cada bloque simula el JWT del usuario con `request.jwt.claims`, que es lo que
lee `auth.uid()` dentro de las políticas RLS y dentro de la función. Es el
método que recomienda Supabase para probar políticas sin pasar por el flujo
completo de autenticación.

Los casos destructivos van dentro de `begin; … rollback;` y no dejan rastro.

---

## Preparación

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.accounts (user_id, name, type, initial_balance_minor)
values ('<UUID_A>', 'Cuenta hojas A', 'cash', 100000);

insert into public.categories (user_id, name, type)
values ('<UUID_A>', 'Gasto hojas A', 'expense'),
       ('<UUID_A>', 'Ingreso hojas A', 'income');

insert into public.sheets (user_id, name, columns)
values (
  '<UUID_A>',
  'Hoja A',
  '[{"id":"medio_pago","label":"Medio de pago","type":"text","position":0}]'::jsonb
);

commit;
```

Y la hoja equivalente del usuario B, que hará falta en el grupo de aislamiento:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

insert into public.sheets (user_id, name) values ('<UUID_B>', 'Hoja B');

commit;
```

---

## Aislamiento entre usuarios (1-4)

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

-- 1. B no ve las hojas de A. Debe devolver 0.
select count(*) as deberia_ser_cero from public.sheets where name = 'Hoja A';

-- 2. B no ve los borradores de A. Debe devolver 0.
select count(*) as deberia_ser_cero
from public.sheet_drafts d
join public.sheets s on s.id = d.sheet_id
where s.name = 'Hoja A';

commit;
```

**3.** B no puede colgar un borrador de la hoja de A. Como B no ve esa hoja,
sustituye `<SHEET_A>` por su UUID leído como A. Debe fallar por
`sheet_drafts_sheet_same_user_fkey`, aunque el `user_id` sea el suyo:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

insert into public.sheet_drafts (user_id, sheet_id, position)
values ('<UUID_B>', '<SHEET_A>', 0);   -- debe fallar al hacer commit

commit;
```

**4.** B no puede apropiarse de una hoja de A. Debe afectar a 0 filas:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

update public.sheets set user_id = '<UUID_B>' where name = 'Hoja A';

rollback;
```

---

## Restricciones estructurales (5-10)

Todos con el JWT de A. **Cada `insert` debe fallar**, salvo donde se indique.

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

-- 5. columns no es un array.
insert into public.sheets (user_id, name, columns)
values ('<UUID_A>', 'X', '{"id":"x"}'::jsonb);

-- 6a. 21 columnas: falla.
insert into public.sheets (user_id, name, columns)
select '<UUID_A>', 'X',
       jsonb_agg(jsonb_build_object('id', 'c' || i, 'label', 'C', 'type', 'text', 'position', i))
from generate_series(1, 21) as i;

-- 6b. 20 columnas: pasa.
insert into public.sheets (user_id, name, columns)
select '<UUID_A>', 'Veinte',
       jsonb_agg(jsonb_build_object('id', 'c' || i, 'label', 'C', 'type', 'text', 'position', i))
from generate_series(1, 20) as i;

-- 7. cells no es un objeto.
insert into public.sheet_drafts (user_id, sheet_id, position, cells)
values ('<UUID_A>', '<SHEET_A>', 0, '[]'::jsonb);

-- 8. custom_fields no es un objeto. Requiere que A tenga al menos un
-- movimiento; si no, el update afecta a 0 filas y no demuestra nada.
update public.transactions set custom_fields = '"texto"'::jsonb where user_id = '<UUID_A>';

-- 9. position negativa.
insert into public.sheet_drafts (user_id, sheet_id, position)
values ('<UUID_A>', '<SHEET_A>', -1);

-- 10. name vacío o solo espacios: falla. 80 caracteres: pasa. 81: falla.
insert into public.sheets (user_id, name) values ('<UUID_A>', '   ');
insert into public.sheets (user_id, name) values ('<UUID_A>', repeat('a', 80));
insert into public.sheets (user_id, name) values ('<UUID_A>', repeat('a', 81));

rollback;
```

---

## Orden de filas (11-13)

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.sheet_drafts (user_id, sheet_id, position)
values ('<UUID_A>', '<SHEET_A>', 0), ('<UUID_A>', '<SHEET_A>', 1);

-- 11. Posición repetida en la misma hoja: falla.
insert into public.sheet_drafts (user_id, sheet_id, position)
values ('<UUID_A>', '<SHEET_A>', 0);

rollback;
```

**12.** La misma posición en hojas distintas es válida (crea antes una segunda
hoja de A y usa su UUID como `<SHEET_A2>`):

```sql
insert into public.sheet_drafts (user_id, sheet_id, position)
values ('<UUID_A>', '<SHEET_A>', 0), ('<UUID_A>', '<SHEET_A2>', 0);
```

**13.** Intercambiar dos posiciones. **Esta prueba demuestra una capacidad del
esquema, no un flujo que la interfaz ejecute**: en esta fase no hay
reordenamiento, y cuando lo haya vivirá dentro de una RPC transaccional, nunca
en el cliente (ver [docs/07-hojas.md](07-hojas.md)).

Parte de dos borradores de la misma hoja: `<DRAFT_P0>` en la posición 0 y
`<DRAFT_P1>` en la 1. El intercambio son dos `update`, y el estado entre ambos
tiene las dos filas en la misma posición.

```sql
-- 13a. Sin diferir: el primer update ya falla, aunque el estado final
-- sería válido.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

update public.sheet_drafts set position = 1 where id = '<DRAFT_P0>';   -- falla

rollback;

-- 13b. Diferida: el estado intermedio tiene duplicados y aun así pasa,
-- porque solo se comprueba el resultado final, al hacer commit.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';
set constraints public.sheet_drafts_sheet_position_key deferred;

update public.sheet_drafts set position = 1 where id = '<DRAFT_P0>';
update public.sheet_drafts set position = 0 where id = '<DRAFT_P1>';

commit;
```

---

## Cascadas de borrado (14-15)

**14.** Borrar una hoja se lleva sus borradores y **no** toca los movimientos ya
registrados desde ella:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

select count(*) as movimientos_antes from public.transactions where user_id = '<UUID_A>';

delete from public.sheets where id = '<SHEET_A>';

select count(*) as borradores_deberia_ser_cero
from public.sheet_drafts where sheet_id = '<SHEET_A>';

select count(*) as movimientos_despues from public.transactions where user_id = '<UUID_A>';
-- movimientos_antes debe ser igual a movimientos_despues.

rollback;
```

**15.** Borrar el usuario completo. Es la prueba de que la clave foránea
diferida no falla a mitad de la cascada. Se ejecuta como `postgres`, porque
`auth.users` no es accesible para `authenticated`, y **siempre con `rollback`**:

```sql
begin;

delete from auth.users where id = '<UUID_A>';

select count(*) as hojas_deberia_ser_cero from public.sheets where user_id = '<UUID_A>';
select count(*) as borradores_deberia_ser_cero from public.sheet_drafts where user_id = '<UUID_A>';

rollback;
```

Si la FK compuesta no estuviera diferida, el `delete` fallaría antes de llegar a
los `select`.

---

## `register_sheet_draft` y `SECURITY INVOKER` (16-20)

**16.** Registro correcto. Demuestra de una vez que bajo RLS funcionan el
`SELECT … FOR UPDATE` del propio borrador, el `INSERT` de la propia transacción
y el `DELETE` del propio borrador:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

insert into public.sheet_drafts (user_id, sheet_id, position, cells)
values (
  '<UUID_A>', '<SHEET_A>', 10,
  jsonb_build_object(
    'transaction_date', '2026-09-07',
    'description', 'Mercado',
    'account_id', '<ACCOUNT_A>',
    'category_id', '<CATEGORY_EXPENSE_A>',
    'type', 'expense',
    'amount_minor', '120000',
    'medio_pago', 'Efectivo'
  )
) returning id;   -- guarda el id como <DRAFT_OK>

select public.register_sheet_draft('<DRAFT_OK>');
-- Debe devolver status registered con transaction_id.

select description, amount_minor, custom_fields
from public.transactions where id = '<TRANSACTION_ID>';
-- custom_fields debe ser {"medio_pago": "Efectivo"}.

select count(*) as borrador_deberia_ser_cero
from public.sheet_drafts where id = '<DRAFT_OK>';

rollback;
```

**17.** B ejecutando sobre un borrador de A. Debe devolver `not_found`, sin
excepción que delate su existencia:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_B>", "role": "authenticated"}';

select public.register_sheet_draft('<DRAFT_OK>');

rollback;
```

**18.** `anon` no puede ejecutar la función. Debe fallar por permisos:

```sql
begin;
set local role anon;

select public.register_sheet_draft('<DRAFT_OK>');

rollback;
```

**19.** Concurrencia. **Requiere dos sesiones SQL distintas**, porque dentro de
una sola no hay dos transacciones a la vez:

| Sesión 1 | Sesión 2 |
| --- | --- |
| `begin;` + JWT de A | |
| `select public.register_sheet_draft('<DRAFT_OK>');` → `registered` | |
| | `begin;` + JWT de A |
| | `select public.register_sheet_draft('<DRAFT_OK>');` → **espera** |
| `commit;` | |
| | devuelve `not_found` |

Al terminar debe haber **un solo** movimiento con esa descripción:

```sql
select count(*) as deberia_ser_uno
from public.transactions where description = 'Mercado' and user_id = '<UUID_A>';
```

**20.** Doble clic: dos llamadas seguidas en la misma sesión. La segunda debe
devolver `not_found` y no debe haber duplicado.

---

## Validación estructurada (21-26)

Todos con el JWT de A, y en todos **el borrador debe seguir existiendo** al
terminar.

**21.** Borrador vacío: `invalid` con `required` en los seis campos, en el orden
`transaction_date`, `description`, `account_id`, `category_id`, `type`,
`amount_minor`.

```sql
insert into public.sheet_drafts (user_id, sheet_id, position, cells)
values ('<UUID_A>', '<SHEET_A>', 20, '{}'::jsonb) returning id;

select public.register_sheet_draft('<DRAFT_VACIO>');
```

**22.** Todo completo menos `category_id`: un único error,
`{"field":"category_id","code":"required"}`.

**23.** Tipos rechazados:

| `cells.type` | Código esperado |
| --- | --- |
| `transfer` | `transfer_not_allowed` |
| `ingreso` | `invalid_type` |

**24.** Categoría de tipo `income` con `type = 'expense'` → `type_mismatch` en
`category_id`. Debe ser el código de la RPC, **no** un `P0001` del trigger
`validate_transaction`.

**25.** Cuenta o categoría del usuario B → `account_not_found` /
`category_not_found`. Nunca se inserta nada.

**26.** Valores mal formados, ninguno debe lanzar excepción:

| Campo y valor | Código esperado |
| --- | --- |
| `amount_minor` = `'abc'` | `invalid_amount` |
| `amount_minor` = `'1200.5'` | `invalid_amount` |
| `amount_minor` = `'0'` | `not_positive` |
| `amount_minor` = `'-5'` | `not_positive` |
| `account_id` = `'no-es-uuid'` | `invalid_uuid` |

---

## Filtrado de `custom_fields` (27-28)

**27.** Una clave de `cells` que no está declarada en `columns` no llega al
movimiento:

```sql
-- cells incluye "color_favorito": "azul", que no está en columns.
select public.register_sheet_draft('<DRAFT_CLAVE_NO_DECLARADA>');

select custom_fields from public.transactions where id = '<TRANSACTION_ID>';
-- No debe contener color_favorito.
```

**28.** Una definición de columna corrupta no contamina `transactions`. Con una
hoja cuyo `columns` sea, por ejemplo:

```json
[
  { "id": "medio_pago", "label": "Medio de pago", "type": "text", "position": 0 },
  { "label": "Sin id", "type": "text", "position": 1 },
  { "id": "calculada", "label": "Calculada", "type": "formula", "position": 2 },
  { "id": "type", "label": "Secuestro", "type": "text", "position": 3 }
]
```

y un `cells` que traiga valores para las cuatro, el movimiento resultante debe
tener `custom_fields` con **solo** `medio_pago`: la entrada sin `id` se
descarta, la de `type = 'formula'` también, y `type` está en la lista de
reservados, así que no puede pisar el campo financiero.

---

---

## Fechas: solo ISO (29)

Los cuatro escenarios que justifican validar el patrón **antes** del cast. El
resto de la fila es válido en todos, para que el único error sea el de la fecha.

| `cells.transaction_date` | Esperado | Por qué |
| --- | --- | --- |
| `'2026-09-07'` | `registered` | ISO correcta |
| `'07/09/2026'` | `invalid_date` | Ambigua: julio o septiembre según el `DateStyle` del servidor |
| `'2026-2-7'` | `invalid_date` | Sin ceros a la izquierda |
| `'2026-02-31'` | `invalid_date` | Tiene la forma correcta y no existe |

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

-- Repetir con cada valor de la tabla.
insert into public.sheet_drafts (user_id, sheet_id, position, cells)
values (
  '<UUID_A>', '<SHEET_A>', 30,
  jsonb_build_object(
    'transaction_date', '07/09/2026',
    'description', 'Fecha ambigua',
    'account_id', '<ACCOUNT_A>',
    'category_id', '<CATEGORY_EXPENSE_A>',
    'type', 'expense',
    'amount_minor', '1000'
  )
) returning id;

select public.register_sheet_draft('<DRAFT_FECHA>');
-- {"status":"invalid","errors":[{"field":"transaction_date","code":"invalid_date"}]}

rollback;
```

El caso `2026-02-31` es el que demuestra que el patrón por sí solo no basta:
una expresión regular no sabe cuántos días tiene febrero. Y `07/09/2026` es el
que más importa en la práctica, porque sin la comprobación **se registraría sin
error, en el mes equivocado**.

---

## Topes de longitud (30-31)

**30.** Campos financieros largos:

| Campo | Valor | Esperado |
| --- | --- | --- |
| `description` | `repeat('a', 250)` | Válido |
| `description` | `repeat('a', 251)` | `description_too_long` |
| `notes` | `repeat('a', 1000)` | Válido |
| `notes` | `repeat('a', 1001)` | `notes_too_long` |

```sql
insert into public.sheet_drafts (user_id, sheet_id, position, cells)
values (
  '<UUID_A>', '<SHEET_A>', 31,
  jsonb_build_object(
    'transaction_date', '2026-09-07',
    'description', repeat('a', 251),
    'account_id', '<ACCOUNT_A>',
    'category_id', '<CATEGORY_EXPENSE_A>',
    'type', 'expense',
    'amount_minor', '1000'
  )
) returning id;

select public.register_sheet_draft('<DRAFT_LARGO>');
-- {"field":"description","code":"description_too_long"}
```

**31.** Columna propia demasiado larga. Con la hoja de la preparación, que
declara `medio_pago`, y `cells.medio_pago = repeat('a', 1001)`:

```json
{
  "status": "invalid",
  "draft_id": "…",
  "errors": [{ "field": "custom_fields.medio_pago", "code": "custom_field_too_long" }]
}
```

Y al terminar, **el borrador debe seguir existiendo y no debe haberse creado
ningún movimiento**. Es el punto importante: un valor de columna propia que se
pasa de largo no se recorta ni se descarta en silencio, porque el usuario cree
haberlo guardado. Con 1000 caracteres exactos, en cambio, el registro sale bien
y `custom_fields.medio_pago` los conserva.

---

---

## Limpieza

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<UUID_A>", "role": "authenticated"}';

delete from public.sheets where user_id = '<UUID_A>';
delete from public.transactions where user_id = '<UUID_A>';
delete from public.categories where user_id = '<UUID_A>';
delete from public.accounts where user_id = '<UUID_A>';

commit;
```

Repite con `<UUID_B>`. Borrar las hojas se lleva sus borradores por cascada.
