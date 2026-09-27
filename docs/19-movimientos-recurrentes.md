# Movimientos recurrentes: plantillas y proyección mensual

> Migración `20260927120000_crear_plantillas_recurrentes.sql`. Código en
> `src/features/recurring/`. Pruebas SQL en `supabase/tests/db/`.

## Principio

**FinTrack no crea movimientos reales automáticamente.** Una plantilla se
proyecta a borradores de Hojas cuando el usuario pulsa el botón del Dashboard;
cada borrador se revisa, se ajusta o se elimina, y se registra a mano con el
flujo existente (`register_sheet_draft`). No hay CRON, Edge Function
programada ni inserción mensual en `transactions`.

## Modelo real (verificado antes de migrar)

| Pieza          | Realidad del repositorio                                                     |
| -------------- | ---------------------------------------------------------------------------- |
| Borradores     | `sheet_drafts` (celdas en `jsonb`) dentro de `sheets`                        |
| Registro       | `register_sheet_draft`: atómico por fila, **borra el borrador** al registrar |
| Transferencias | Dos filas en `transactions` con `transfer_group_id`; Hojas las rechaza       |
| Archivado      | `is_archived` en `accounts` y `categories`                                   |
| Montos         | `bigint`, unidad mínima de la moneda de la cuenta (COP 0, USD/ARS 2)         |
| Fechas         | `transaction_date` es `date`; en las celdas, texto `YYYY-MM-DD`              |
| Propiedad      | `accounts_id_user_id_key`, `categories_id_user_id_key` para FK compuestas    |

## Esquema

### `recurring_templates`

`id`, `user_id`, `type` (`income` | `expense`), `amount_minor` (`bigint` > 0),
`account_id`, `category_id`, `description` (1–250), `day_of_month` (1–31),
`is_active`, `created_at`, `updated_at`.

- **Sin transferencias.** Un borrador de Hojas no puede representar las dos
  patas, y proyectar una sola crearía una transferencia inconsistente. Se
  rechaza por `check` y se documenta en vez de implementarla a medias.
- **Categoría obligatoria.** Registrar un borrador la exige, y el formulario de
  movimientos también.
- **Sin moneda propia:** la hereda de la cuenta, como un movimiento.
- **Propiedad** por claves foráneas compuestas `(account_id, user_id)` y
  `(category_id, user_id)`: una plantilla no puede apuntar a una cuenta o
  categoría ajena ni siquiera saltándose RLS.
- **Trigger `validate_recurring_template`:** tipo de categoría igual al de la
  plantilla, y cuenta/categoría no archivadas **al estrenarse** (insert o cambio
  de destino). Si se archivan después, la plantilla sigue existiendo y la
  proyección la omite.
- **RLS:** `select`, `insert`, `update`, `delete` con `auth.uid() = user_id`.

### `recurring_template_projections`

`(template_id, generated_for_month)` como clave primaria, más `user_id` y
`created_at`. Es **la autoridad de la idempotencia**.

Por qué hace falta: `register_sheet_draft` borra el borrador al registrarlo.
Una unicidad solo sobre `sheet_drafts` dejaría de existir tras registrar, y la
plantilla se volvería a proyectar: el movimiento acabaría duplicado. El registro
de proyección sobrevive al registro y al borrado del borrador (si el usuario
elimina un borrador que no quería, tampoco reaparece).

RLS: `select`, `insert`, `delete` propios; sin `update`. Borrar una proyección
es la forma explícita de permitir volver a proyectar ese mes.

### `sheet_drafts`

Gana `source_template_id` y `generated_for_month` (los dos o ninguno), para
trazabilidad, y un **índice único parcial**:

```sql
create unique index sheet_drafts_template_month_key
  on public.sheet_drafts (user_id, source_template_id, generated_for_month)
  where source_template_id is not null;
```

Los borradores manuales (`source_template_id` nulo) quedan fuera del índice.
En PostgreSQL los `NULL` no chocan en un índice único normal, pero el parcial
deja explícita la intención y es el destino exacto del `on conflict` de la RPC.
Si se borra la plantilla, el borrador queda como borrador normal: la FK hace
`set null` y un trigger anula también el mes.

## RPC `project_recurring_templates(p_month text)`

- `security invoker` y `search_path = ''`: todo pasa por RLS con el usuario del
  JWT; el usuario sale de `auth.uid()`, nunca de un parámetro.
- Solo `YYYY-MM` válido (mes 01–12, años 2000–2100); si no, error `22023`.
- Recorre las plantillas **activas** del usuario y devuelve un estado por cada
  una:

| Estado                      | Significado                                       |
| --------------------------- | ------------------------------------------------- |
| `created`                   | Borrador creado (con `draft_id` y `date`)         |
| `skipped_existing`          | Ya se proyectó ese mes                            |
| `skipped_archived_account`  | Su cuenta está archivada                          |
| `skipped_archived_category` | Su categoría está archivada                       |
| `invalid_template`          | Cuenta o categoría inexistente o de tipo distinto |

- Una plantilla problemática no aborta las demás.
- `on conflict … do nothing` solo sobre la clave primaria de proyecciones y el
  índice parcial de borradores. Cualquier otro error —permisos, restricciones,
  colisión de posición— se propaga y aborta toda la llamada.
- Los borradores van a la hoja `Recurrentes YYYY-MM`, creada con el primer
  borrador que haga falta.
- No inserta en `transactions`. Probado.
- `revoke` a `public` y `anon`; `grant execute` a `authenticated`.

### Fechas

`day_of_month` mayor que el último día del mes se ajusta al **último día
natural**: 31 → 28 en febrero de 2026, 31 → 30 en abril, 29 → 28 en febrero no
bisiesto y 29 en bisiesto. No se usa «último día hábil»: exigiría un calendario
de festivos por país que FinTrack no tiene. Todo se calcula con `make_date`
sobre `YYYY-MM`, sin horas ni zona horaria que puedan mover el día.

El mes que pide la interfaz es el mes actual en `profiles.timezone`
(`monthKeyInTimeZone`), con la zona del navegador como respaldo.

### Concurrencia

Un cerrojo transaccional por usuario y mes (`pg_advisory_xact_lock`) serializa
dos proyecciones simultáneas. La garantía de fondo, sin embargo, es la clave
primaria de `recurring_template_projections`: la segunda sesión espera en la
primera inserción y, cuando la primera confirma, no hace nada. La prueba de
concurrencia (20 sesiones liberadas a la vez con una barrera) da 2 borradores,
2 proyecciones y 1 hoja; también pasa sin el cerrojo, que queda como defensa
adicional.

## Interfaz

- **Formulario de movimiento** (Dashboard y Movimientos, solo al crear): casilla
  «Repetir cada mes», desmarcada por defecto, con la explicación de que se
  creará un borrador cada mes. No aparece al editar ni en transferencias. El
  alta rápida del panel del Dashboard no la ofrece.
- **Creación:** primero el movimiento con el flujo existente; después la
  plantilla (`day_of_month` = día de la fecha). No existe una RPC que haga las
  dos cosas en una transacción, así que si la plantilla falla se muestra un
  aviso persistente —«El movimiento se registró, pero no se pudo programar su
  repetición»— con **Reintentar**, que vuelve a intentar **solo la plantilla**:
  reintentar nunca duplica el movimiento.
- **Dashboard:** aviso solo si hay plantillas activas sin proyección para el mes
  actual. Botón «Proyectar N movimientos recurrentes de este mes»; al terminar
  muestra creados, ya existentes y omitidos con el motivo, e invita a revisar en
  Hojas (`/sheets?sheet=…`).
- **Hojas:** los borradores proyectados se editan (monto, fecha, categoría), se
  eliminan y se registran con el flujo masivo existente.
- **Ajustes → Movimientos recurrentes:** lista de plantillas con monto en la
  moneda de su cuenta, aviso si la cuenta o categoría está archivada, y botones
  para desactivar/activar o eliminar.

## Pruebas

| Dónde                                                | Qué                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/tests/db/10-recurring-templates.sql`       | RLS y aislamiento, cuenta/categoría ajena, transferencias, inactiva, creada, idempotencia, registrar/borrar no reproyecta, otro mes, 31→28/30, bisiesto, archivadas omitidas sin bloquear, sin `transactions`, USD en centavos, borradores manuales, mes inválido, sin sesión, `anon` |
| `supabase/tests/db/20-concurrency.sh`                | 20 proyecciones simultáneas; 40 consumos de cuota del Coach con límite 15                                                                                                                                                                                                             |
| `src/features/recurring/*.test.ts(x)`                | Pendientes por mes, zona horaria, plantilla desde movimiento, resultado de la RPC, banner, reintento                                                                                                                                                                                  |
| `transaction-form.test.tsx`, `Transactions.test.tsx` | Casilla desmarcada, oculta al editar, orden movimiento → plantilla, fallo del movimiento                                                                                                                                                                                              |

`scripts/test-db.sh` aplica todas las migraciones en una base vacía y ejecuta
las pruebas SQL. En CI corre en el job `validar-base-de-datos` con
PostgreSQL 16.

## Aplicación en producción

La migración **no se ha aplicado** al proyecto remoto. Requiere instrucción
explícita. Después de aplicarla, regenerar `src/types/database.types.ts` desde
el proyecto y comprobar que coincide con los tipos añadidos a mano.
