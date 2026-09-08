# FinTrack — Hojas de cálculo

> Modelo de datos y reglas de registro. Paso 1: esquema.

---

## Qué es una hoja

Una rejilla editable donde se escriben gastos e ingresos antes de registrarlos.
Mientras una fila es **borrador no existe para las finanzas**: no mueve saldos,
ni el dashboard, ni los presupuestos, ni aparece en el Libro. Solo al
registrarla se convierte en un movimiento real.

Esa frontera es la idea central del modelo, y es deliberada: escribir en una
hoja tiene que poder hacerse sin miedo, corrigiendo y dejándolo a medias, sin
que cada tecla altere las cifras del mes.

| Tabla | Contiene |
| --- | --- |
| `sheets` | Hoja con nombre y su definición de columnas |
| `sheet_drafts` | Filas a medio escribir. Se borran al registrarse |
| `transactions.custom_fields` | Valores de las columnas propias, junto al movimiento |

Una fila registrada **desaparece de la rejilla** y pasa a estar en Movimientos y
en el Libro. En esta fase la hoja contiene únicamente borradores: no muestra ni
edita movimientos reales.

---

## Columnas

Siete predeterminadas, que son los campos que un movimiento necesita:

`transaction_date`, `description`, `account_id`, `category_id`, `type`,
`amount_minor`, `notes`.

Sobre ellas, hasta **20 columnas propias** por hoja, de texto libre. Se guardan
en `sheets.columns` como un array de objetos:

```json
{ "id": "medio_pago", "label": "Medio de pago", "type": "text", "position": 0 }
```

`id` es la clave con la que se guarda el valor y **es estable**: renombrar la
columna cambia `label`, nunca `id`. Si la clave fuese el nombre visible,
renombrar una columna perdería todo lo escrito en ella.

### Qué valida la base de datos y qué no

La base de datos comprueba solo la forma exterior:

| Restricción | Qué garantiza |
| --- | --- |
| `sheets_columns_is_array_check` | `columns` es un array |
| `sheets_columns_max_check` | Como mucho 20 columnas |
| `sheet_drafts_cells_is_object_check` | `cells` es un objeto |
| `transactions_custom_fields_is_object_check` | `custom_fields` es un objeto |

Las reglas internas quedan en la capa de aplicación, con Zod, y se
implementan en el **paso 2**:

1. `id` presente, de tipo texto, con formato de slug y **único** dentro de la hoja.
2. `label` presente, de tipo texto, con longitud válida.
3. `type` exactamente `'text'`.
4. `position` numérica, sin huecos ni repetidos.
5. `id` fuera de la lista de reservados: `transaction_date`, `description`,
   `account_id`, `category_id`, `type`, `amount_minor`, `notes`.
6. `id` estable entre renombrados.

Expresarlas en SQL exigiría recorrer el array con SQL/JSON path dentro de un
CHECK, lo que produce una expresión larga, difícil de leer y peor de mantener
que la misma regla escrita en TypeScript con pruebas.

### Una definición inválida no puede contaminar `transactions`

Aunque `columns` acabara mal formada —una fila escrita fuera de la app, un
cliente manipulado—, `register_sheet_draft` no confía en ella. Reconstruye
`custom_fields` recorriendo la definición y quedándose **solo** con entradas
cuyo `id` sea texto, cuyo `type` sea `'text'` y cuyo slug no sea uno de los
campos financieros. Lo que no pasa ese filtro no llega a `transactions`.

Además, el contenido se toma de la definición y no de las claves de `cells`:
una clave que nadie declaró no se cuela como campo fantasma.

---

## Registrar una fila

`register_sheet_draft(p_draft_id uuid) returns jsonb`

Tres resultados posibles:

```json
{ "status": "registered", "draft_id": "…", "transaction_id": "…" }
{ "status": "invalid", "draft_id": "…", "errors": [{ "field": "…", "code": "…" }] }
{ "status": "not_found", "draft_id": "…" }
```

**Los fallos de validación se devuelven, no se lanzan.** Lanzarlos abortaría la
transacción y obligaría al cliente a interpretar textos en español, que es
exactamente el punto frágil del mapeo de errores de presupuestos. Los fallos
inesperados —violación de clave foránea, el trigger de `transactions`, un
permiso ausente— sí se propagan como excepción y abortan.

### Códigos por campo

| Campo | Códigos |
| --- | --- |
| `transaction_date` | `required`, `invalid_date` |
| `description` | `required`, `description_too_long` |
| `notes` | `notes_too_long` |
| `account_id` | `required`, `invalid_uuid`, `account_not_found` |
| `category_id` | `required`, `invalid_uuid`, `category_not_found`, `type_mismatch` |
| `type` | `required`, `invalid_type`, `transfer_not_allowed` |
| `amount_minor` | `required`, `invalid_amount`, `not_positive` |
| `custom_fields.<slug>` | `custom_field_too_long` |

`invalid_type` es un valor que no es ninguno de los tres conocidos;
`transfer_not_allowed` es exactamente `'transfer'`, y se distinguen porque la
interfaz dirá cosas distintas. Ningún código expone SQLSTATE, nombres de
índices, de políticas ni de restricciones: la traducción a mensajes es cosa de
la interfaz.

Los errores se emiten **todos a la vez** y en orden de columna: primero los
siete campos financieros, después las columnas propias en el orden en que
aparecen en la definición de la hoja. Quien corrige una fila quiere ver de una
vez lo que le falta, no descubrirlo de uno en uno.

### La fecha solo se acepta en ISO

`transaction_date` debe cumplir `^[0-9]{4}-[0-9]{2}-[0-9]{2}$` **antes** de
intentar el cast, y esa comprobación no es cosmética: PostgreSQL acepta bastante
más que ISO según el `DateStyle` de la sesión, y `'07/09/2026'` se interpretaría
como julio o como septiembre según cómo esté configurado el servidor. Un gasto
guardado en el mes equivocado es un error silencioso, y en una app de finanzas
sale caro.

| Entrada | Resultado |
| --- | --- |
| `2026-09-07` | Válida |
| `07/09/2026` | `invalid_date` — ambigua |
| `2026-2-7` | `invalid_date` — sin ceros a la izquierda |
| `2026-02-31` | `invalid_date` — tiene la forma correcta pero no existe |

El último caso es el que justifica que además del patrón haya un cast dentro de
`begin … exception`: la expresión regular no sabe cuántos días tiene febrero.

### Topes de longitud

`text` en PostgreSQL no tiene límite, así que una celda pegada desde otro sitio
podría guardar megabytes. La RPC los impone y los informa como cualquier otro
error:

| Campo | Tope |
| --- | --- |
| `description` | 250 caracteres, tras `btrim` |
| `notes` | 1000 caracteres, si está presente |
| Cada columna propia | 1000 caracteres |

Un valor de columna propia que se pase **no se recorta ni se descarta en
silencio**: se devuelve como `{"field":"custom_fields.<slug>","code":"custom_field_too_long"}`
y el borrador no se registra. Descartarlo sin avisar perdería datos que el
usuario cree haber guardado.

### Reglas de registro

- **`category_id` es obligatoria para registrar**, aunque la columna admita
  nulos y aunque un borrador pueda estar sin ella. Mismo criterio que el
  formulario de movimientos.
- **Solo `income` y `expense`.** Una transferencia necesita dos cuentas y el
  esquema le prohíbe tener categoría. Se rechaza en la RPC, no solo en la
  interfaz, para que un cliente manipulado tampoco pueda crearla.
- **El borrador se borra solo tras una inserción correcta**, en la misma
  transacción.

### Por qué el bloqueo de fila

La lectura del borrador es `select … for update`. Sin él, dos llamadas
simultáneas —dos pestañas, un doble clic, el registro por lotes de un paso
posterior— leen el mismo borrador, ambas insertan y una borra: **el gasto queda
registrado dos veces**. La atomicidad de la función no lo evita, porque son dos
transacciones distintas y cada una es coherente por separado.

Con el bloqueo, la segunda espera; cuando la primera confirma, el borrador ya
no está y la segunda devuelve `not_found`.

### Duplicación intencionada con el trigger

Las comprobaciones de pertenencia de cuenta y categoría, y la de compatibilidad
de tipo, ya las garantiza `validate_transaction` desde la migración inicial. **La
autoridad sigue siendo el trigger**, que no se puede esquivar; la RPC las repite
solo para poder devolver un código por campo.

El riesgo conocido es la divergencia: si algún día cambia una regla en el
trigger y no en la RPC, los códigos mentirán aunque los datos sigan a salvo. El
caso de prueba 24 lo detectaría.

---

## Seguridad

`register_sheet_draft` es **`security invoker`**: se ejecuta con los permisos de
quien llama, así que sus consultas quedan sujetas a RLS y la función no puede
convertirse en una vía para leer o escribir datos ajenos. Con `security definer`
habría que replicar a mano el control de acceso, que es justo donde suelen
aparecer los agujeros.

`search_path = ''` con todos los nombres calificados impide que un `search_path`
manipulado desvíe las consultas a un esquema suplantado. El trigger
`validate_transaction`, que se dispara al insertar, hereda ese `search_path`
vacío y funciona porque sus consultas ya están calificadas con `public.`.

Permisos: `revoke all … from public` —imprescindible, porque PostgreSQL concede
`EXECUTE` a `PUBLIC` por defecto—, `revoke all … from anon` como documentación
viva, y `grant execute … to authenticated`.

> **`SECURITY INVOKER` es una expectativa, no un hecho verificado.** Los casos
> SQL 16 a 20 existen para demostrar que bajo RLS funcionan el
> `SELECT … FOR UPDATE` del propio borrador, el `INSERT` de la propia
> transacción y el `DELETE` del propio borrador, que un usuario ajeno recibe
> `not_found` y que `anon` no puede ejecutar la función.
>
> **Si alguna de esas operaciones falla, hay que detenerse y reportar el error
> exacto. No se cambia a `SECURITY DEFINER` sin aprobación explícita.**

RLS completo sobre `sheets` y `sheet_drafts`: cuatro políticas por tabla sobre
`auth.uid() = user_id`.

No se añaden `GRANT` de tabla. Las cuatro tablas del esquema inicial se apoyan
en los privilegios por defecto del esquema `public` de Supabase, y RLS es la
barrera real; mantener un solo criterio evita dos modelos de permisos
conviviendo. Si esos privilegios faltasen, las pruebas 16-20 fallarían de forma
ruidosa, no silenciosa.

---

## Integridad y borrado

| Restricción | Definición | Para qué |
| --- | --- | --- |
| `sheets_user_id_fkey` | → `auth.users(id)` `on delete cascade` | Borrar la cuenta borra sus hojas |
| `sheet_drafts_user_id_fkey` | → `auth.users(id)` `on delete cascade` | Borrar la cuenta borra sus borradores |
| `sheet_drafts_sheet_id_fkey` | → `sheets(id)` `on delete cascade` | Borrar una hoja se lleva sus borradores |
| `sheet_drafts_sheet_same_user_fkey` | `(sheet_id, user_id)` → `sheets(id, user_id)`, `no action deferrable initially deferred` | Propiedad declarativa |

Son **dos claves foráneas hacia `sheets`, cada una con un trabajo**. La simple
aporta la cascada; la compuesta aporta la garantía de propiedad y está diferida
al commit porque, al borrar un usuario, las cascadas sobre `sheets` y
`sheet_drafts` corren dentro de la misma sentencia y en el punto intermedio un
borrador puede referenciar una hoja ya borrada. Comprobada al final, solo ve el
estado definitivo. Es `no action` y no `restrict` porque `restrict` comprueba de
inmediato y no admite diferimiento.

Borrar una hoja **no toca los movimientos ya registrados desde ella**: dejaron
de pertenecer a la hoja en el momento en que se registraron.

---

## Orden de las filas

`position` es un entero con `unique (sheet_id, position) deferrable initially
immediate`.

**En esta fase no hay reordenamiento.** La restricción es deferible porque
reordenar intercambia posiciones y el estado intermedio tiene duplicados aunque
el final sea válido, pero esa capacidad todavía no se usa.

Cuando se implemente, **deberá hacerse con una RPC transaccional específica**,
por ejemplo `reorder_sheet_drafts(p_sheet_id uuid, p_ordered_draft_ids uuid[])`,
que:

1. valide `auth.uid()`;
2. valide que la hoja pertenece al usuario;
3. valide que cada borrador pertenece a esa hoja;
4. reasigne todas las posiciones **dentro de una sola transacción**;
5. use la restricción diferible para comprobar solo el estado final.

No se hará desde el cliente enviando `UPDATE` individuales ni manejando
`SET CONSTRAINTS` desde React: una secuencia de escrituras sueltas puede quedarse
a medias y dejar la hoja con posiciones incoherentes, y el cliente no tiene
forma de repararlo.

Coste conocido de la restricción deferible: **no sirve como destino de
inferencia en `ON CONFLICT`**. Aquí no se usa para eso.

---

## Índices

| Índice | Estado |
| --- | --- |
| `sheets (user_id)` | Creado. Listar hojas y sostener la cascada de borrado de usuario |
| `sheet_drafts (user_id)` | Creado. Solo para esa cascada: PostgreSQL no indexa las claves foráneas por su cuenta |
| `(sheet_id, position)` | No se crea aparte: la restricción única ya genera un índice, y ese mismo resuelve la lectura ordenada de los borradores de una hoja |
| GIN sobre `transactions.custom_fields` | **No se crea** |

**Criterio para añadir el GIN:** cuando exista filtrado real por columnas
propias y se conozca el operador. `->>` con igualdad pide un índice de
expresión; `@>` pide `jsonb_path_ops`. Son índices distintos, y elegir antes de
saber cuál se usa encarece cada escritura sin beneficio.

---

## Confirmar el registro en la interfaz

Nota para el paso 4. «Registrar» es el momento en que unas filas de texto pasan
a mover dinero, y el usuario tiene que entenderlo antes de pulsar, no después.
Textos acordados:

**Antes**

> **Registrar movimientos**
> Se registrarán 8 movimientos. 2 borradores incompletos permanecerán en esta
> hoja para que los corrijas.
> `[Cancelar]` `[Registrar 8 movimientos]`

**Después**

> 8 movimientos registrados correctamente. 2 borradores permanecen pendientes
> de completar.
> `[Ver movimientos]` `[Seguir en Hoja]`

Dicen dos cosas a la vez: que registrar sí afecta al saldo, al dashboard, a los
presupuestos y al Libro, y que las filas incompletas no se pierden. Editar un
borrador, en cambio, no tiene ningún efecto financiero hasta ese momento.

---

## Fuera de alcance

Fórmulas, columnas calculadas, tipos de columna más allá de texto, importación
CSV, acciones masivas sobre movimientos ya registrados, reordenamiento, RPC por
lotes y edición de movimientos reales dentro de la hoja.

El registro de varias filas se resolverá desde el cliente con concurrencia
limitada en un paso posterior; no se crea una RPC por lotes todavía.
