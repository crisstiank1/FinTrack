# FinTrack — Plan mensual

> Modelo de datos, fórmulas y reglas de cálculo. Fase 8.7.
> Paso 1 de la fase: diseño. Los «pasos» numeran entregables dentro de la
> Fase 8.7; no son fases del roadmap de `docs/00-master-prompt.md`.

---

## Qué es

Una pantalla mensual de planificación y comparación. El usuario define planes,
presupuestos, clasificaciones y objetivos; **los valores reales se calculan
desde `transactions` y no se pueden editar**.

Esa asimetría es la idea central del modelo. No es una regla de interfaz que se
pueda saltar: ninguna de las seis tablas nuevas tiene una columna donde guardar
un importe real. No hay dónde escribirlo.

De ahí se derivan las demás reglas:

- Las transferencias no son ingreso ni gasto consolidado.
- Todo cálculo usa `amount_minor` y aritmética entera. Nunca coma flotante.
- Todo queda aislado por `user_id` y protegido por RLS.

## Qué no es

`/plan` es una pantalla de **lectura, análisis y configuración de la
planificación**. No es un medio para pagar.

FinTrack no inicia, ejecuta, autoriza ni procesa movimientos de dinero. Una
transacción de tipo `transfer` es un **registro**: describe algo que el usuario
ya hizo en su banco y que teclea aquí. No es una operación que la aplicación
realice.

Esto importa en dos puntos concretos de este documento, y conviene tenerlo
presente al leerlos:

- Los aportes a ahorro e inversión se miden leyendo transferencias
  **registradas manualmente**. Contarlas no es ejecutarlas.
- El tipo de cuenta `credit_card` existe como etiqueta descriptiva, pero
  **ninguna fórmula, consulta, restricción ni trigger de esta fase lo
  consulta**. No hay pagos de tarjeta, cupos, intereses, fechas de corte ni
  pagos mínimos, ni aquí ni en ninguna parte de la aplicación.

Ver `docs/00-master-prompt.md`, «Qué no es FinTrack».

---

## Frontera con las otras pantallas

| Pantalla | Qué hace | Qué **no** hace |
| --- | --- | --- |
| `/transactions` | Registro cotidiano | No planifica |
| `/ledger` | Historial financiero: consulta movimiento a movimiento | No planifica |
| `/budgets` | **Fuente de verdad** del presupuesto por categoría | No reparte el ingreso |
| `/sheets` | Borradores estructurados previos al registro | No toca el plan |
| `/plan` | Planifica el mes y lo compara con lo ocurrido | **No guarda ningún importe real** |

`/plan` no crea una segunda cifra presupuestada por categoría: lee `budgets`
con la misma `resolveBudget` de la Fase 8 y escribe por su capa de mutación.
Ver `docs/06-presupuestos.md`.

---

## Los dos ejes de medición

Es la decisión de la que cuelga todo el modelo, y la que hace estructuralmente
imposible el doble conteo.

Una línea de plan se mide **o por categoría, o por cuenta**, nunca por las dos.
Y **el eje determina de dónde sale el importe planeado**:

| Eje | `kind` | Cómo se mide lo real | De dónde sale lo planeado |
| --- | --- | --- | --- |
| **Categoría** | `bill`, `variable` | Gastos de esa categoría en el mes | `budgets` |
| **Cuenta** | `savings`, `investment` | Transferencias registradas que entran a esa cuenta | La propia línea |

El `kind` determina el eje por completo, así que las restricciones lo atan
directamente:

```
C5:  (kind in ('bill','variable'))       =  (category_id is not null)
C6:  (kind in ('savings','investment'))  =  (account_id is not null)
C7:  (planned_minor is null)             =  (category_id is not null)
```

C5 y C6 juntas **implican** que solo hay un eje por línea: no hace falta
declararlo aparte, es una consecuencia. C7 ata el importe al eje, de modo que
una categoría **no puede** tener presupuesto en `budgets` y además un importe
propio en la línea. La duplicación no se evita al consultar: no se puede
escribir.

La razón de que el eje cuenta necesite importe propio es que `budgets` solo
cubre categorías de gasto, y una transferencia no puede tener categoría —el
CHECK `transactions_transfer_consistency_check` lo impide—. Sin
`planned_minor` no habría forma de planificar un aporte.

### La deuda no tiene línea propia

La deuda externa —préstamos, cuotas, intereses— se registra como un gasto
`expense` en una categoría normal. Esa categoría se clasifica como `debt` en
`category_classifications`, y ahí termina el modelo:

- Su presupuesto sale de `budgets`, como el de cualquier otra categoría.
- Su valor real sale de los gastos de esa categoría en el mes.
- Aparece como grupo `debt` del reparto y como fila de Deuda del cuadro
  Presupuesto vs. Actual.

No existe `kind = 'debt'`. Una línea de deuda sería estructuralmente idéntica a
una `variable` —eje categoría, presupuesto desde `budgets`, sin importe
propio—, y lo único que la distinguiría es la clasificación de su categoría,
que ya está guardada en otra tabla. Ese dato duplicado podría desincronizarse:
bastaría reclasificar la categoría para que la línea dijera una cosa y el
reparto otra. Al no existir, no puede desincronizarse.

---

## Modelo de datos

Seis tablas nuevas, más una modificación incremental de `accounts`.

### `accounts` — modificación

| Cambio | Motivo |
| --- | --- |
| Ampliar `accounts_type_check` con `'investment'` | Sin él la inversión no es identificable: la categoría predeterminada «Inversiones» es de tipo `income` y no puede recibir gastos |
| Añadir `unique (id, user_id)` | Requisito de la clave foránea compuesta de `plan_lines` |

`investment` sirve únicamente para que el usuario registre manualmente una
cuenta de destino y los aportes que ya hizo. No implica conectar brokers, abrir
productos, comprar activos ni operar dinero, y no se almacena ninguna
credencial ni dato de terceros.

`credit_card` se conserva como estaba, y **ninguna regla de esta fase lo
consulta**.

### `category_classifications`

Clasifica cada categoría de gasto en un grupo del reparto.

| Columna | Tipo | Nulo | Notas |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `user_id` | uuid | no | → `auth.users(id) on delete cascade` |
| `category_id` | uuid | no | |
| `budget_group` | text | no | `needs`, `wants` o `debt` |
| `created_at` / `updated_at` | timestamptz | no | |

Se llama `budget_group` y no `group` porque `GROUP` es palabra reservada y
obligaría a entrecomillarla en cada consulta.

Solo tres valores. `savings` e `investment` se miden por transferencias
registradas hacia cuentas del tipo correspondiente, no por categorías:
admitirlos aquí abriría una segunda vía de cálculo y con ella un camino al
doble conteo.

**Esta tabla es el único lugar donde vive la noción de deuda.**

### `plan_months`

Cabecera del plan de un mes.

| Columna | Tipo | Nulo | Notas |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `user_id` | uuid | no | → `auth.users(id) on delete cascade` |
| `period_month` | date | no | Primer día del mes |
| `created_at` / `updated_at` | timestamptz | no | |

**Snapshot por mes.** A diferencia de `budgets`, aquí no hay plantillas,
excepciones ni resolución: un mes es una fila y nada apunta hacia atrás. Un mes
cerrado es inmutable por construcción, no por una regla que haya que respetar.

Copiar el plan de un mes a otro será una acción de interfaz en una fase
posterior, no una regla de resolución. Corregir un mes cerrado queda como
decisión pendiente: hoy no hay mecanismo y no se improvisará uno.

### `plan_allocations`

Los porcentajes del reparto.

| Columna | Tipo | Nulo | Notas |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `user_id` | uuid | no | |
| `plan_month_id` | uuid | no | |
| `budget_group` | text | no | `needs`, `wants`, `savings`, `investment`, `debt` |
| `percent_bp` | integer | no | Puntos base, entre 0 y 10000 |
| `created_at` / `updated_at` | timestamptz | no | |

Cinco valores aquí y tres en `category_classifications`: el reparto distribuye
el ingreso hacia cinco destinos; la clasificación solo etiqueta categorías de
gasto.

Puntos base, no decimales: 50% es `5000`. Un porcentaje en coma flotante haría
imposible garantizar que la suma sea exactamente 100%.

### `plan_income_sources`

Fuentes de ingreso planeadas.

| Columna | Tipo | Nulo | Notas |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `user_id` | uuid | no | |
| `plan_month_id` | uuid | no | |
| `name` | text | no | 1 a 80 caracteres sobre `btrim` |
| `planned_minor` | bigint | no | `>= 0` |
| `position` | integer | no | `>= 0` |
| `created_at` / `updated_at` | timestamptz | no | |

### `plan_income_source_categories`

Puente entre una fuente y las categorías de ingreso que la alimentan. Una
fuente puede vincularse a varias categorías.

| Columna | Tipo | Nulo | Notas |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `user_id` | uuid | no | |
| `plan_month_id` | uuid | no | **Desnormalizado a propósito** |
| `plan_income_source_id` | uuid | no | |
| `category_id` | uuid | no | Categoría de tipo `income` |
| `created_at` | timestamptz | no | |

`plan_month_id` está desnormalizado porque sin él no se puede expresar «una
categoría de ingreso alimenta una sola fuente del mes». Su coherencia con la
fuente no queda al aire: la garantiza una clave foránea compuesta, no la
confianza en el cliente.

### `plan_lines`

Facturas, gastos variables, ahorro e inversión, en una sola tabla.

| Columna | Tipo | Nulo | Notas |
| --- | --- | --- | --- |
| `id` | uuid | no | PK |
| `user_id` | uuid | no | |
| `plan_month_id` | uuid | no | |
| `period_month` | date | no | **Desnormalizado**, atado por clave foránea |
| `kind` | text | no | `bill`, `variable`, `savings`, `investment` |
| `name` | text | no | 1 a 80 caracteres sobre `btrim` |
| `category_id` | uuid | **sí** | Eje categoría |
| `account_id` | uuid | **sí** | Eje cuenta |
| `planned_minor` | bigint | **sí** | Solo en el eje cuenta |
| `due_date` | date | **sí** | Solo `kind = 'bill'` |
| `position` | integer | no | `>= 0` |
| `created_at` / `updated_at` | timestamptz | no | |

Una tabla y no varias: los bloques comparten columnas casi idénticas, y
separarlos multiplicaría políticas RLS, índices y superficie de consulta sin
ganar nada semánticamente.

`period_month` está desnormalizado para que la regla «la fecha esperada cae
dentro del mes del plan» sea una restricción de fila y no un trigger. La
columna no puede desviarse: una clave foránea compuesta contra
`plan_months (id, period_month)` la ata.

**No hay columna de estado.** El estado de pago y el de progreso se derivan
siempre de `transactions` y de la fecha. Almacenarlos crearía un valor capaz de
quedar desincronizado de la verdad, que es justo lo que este modelo evita.

---

## Contrato de `plan_lines`

| `kind` | `category_id` | `account_id` | `planned_minor` | `due_date` | Importe planeado | Tipo de cuenta |
| --- | --- | --- | --- | --- | --- | --- |
| `bill` | obligatorio | nulo | **nulo** | opcional | `budgets` | — |
| `variable` | obligatorio | nulo | **nulo** | nulo | `budgets` | — |
| `savings` | nulo | obligatorio | obligatorio, `>= 0` | nulo | La línea | `savings` |
| `investment` | nulo | obligatorio | obligatorio, `>= 0` | nulo | La línea | `investment` |

Las líneas `bill` y `variable` son **descriptivas**: aportan nombre,
agrupación, fecha esperada y estado. No aportan una cifra. La cifra está en
`budgets` y solo ahí.

---

## Restricciones

### De fila

| Id | Tabla | Regla |
| --- | --- | --- |
| C1 | `plan_months` | `period_month` es el primer día del mes |
| C2 | `plan_lines` | `period_month` es el primer día del mes |
| C3 | `plan_lines` | `due_date` solo con `kind = 'bill'` |
| C4 | `plan_lines` | `due_date` cae dentro de `period_month` |
| C5 | `plan_lines` | `(kind in ('bill','variable')) = (category_id is not null)` |
| C6 | `plan_lines` | `(kind in ('savings','investment')) = (account_id is not null)` |
| C7 | `plan_lines` | `(planned_minor is null) = (category_id is not null)` |
| C8 | `plan_lines` | `planned_minor` nulo o `>= 0` |
| C9 | `plan_allocations` | `percent_bp` entre 0 y 10000 |
| C10 | `category_classifications` | `budget_group` en `needs`, `wants`, `debt` |

C1, C2 y C4 comparan la fecha contra su propio truncado a mes con un cast
explícito a `timestamp`. El cast no es decorativo: con un argumento `date`,
PostgreSQL resuelve `date_trunc` hacia la variante `timestamptz`, que es STABLE
por depender de la zona horaria, y una restricción CHECK exige funciones
IMMUTABLE. Sin el cast la migración fallaría al crearse. Es el mismo motivo
documentado en la migración de `budgets`.

### Índices únicos

| Id | Tabla | Índice | Impide |
| --- | --- | --- | --- |
| U1 | `category_classifications` | `(user_id, category_id)` | **Doble clasificación de una categoría** |
| U2 | `plan_months` | `(user_id, period_month)` | Dos planes del mismo mes |
| U3 | `plan_months` | `(id, period_month)` | — soporte de clave foránea |
| U4 | `plan_months` | `(id, user_id)` | — soporte de clave foránea |
| U5 | `plan_allocations` | `(plan_month_id, budget_group)` | Grupo repetido |
| U6 | `plan_income_sources` | `(id, plan_month_id)` | — soporte de clave foránea |
| U7 | `plan_income_sources` | `(id, user_id)` | — soporte de clave foránea |
| U8 | `plan_income_sources` | `(plan_month_id, position)` diferible | Posiciones repetidas |
| U9 | `plan_income_source_categories` | `(plan_month_id, category_id)` | **Una categoría de ingreso en dos fuentes** |
| U10 | `plan_lines` | `(plan_month_id, category_id)` parcial | **Dos líneas sobre la misma categoría** |
| U11 | `plan_lines` | `(plan_month_id, account_id)` parcial | Dos líneas sobre la misma cuenta |
| U12 | `plan_lines` | `(plan_month_id, position)` diferible | Posiciones repetidas |

U11 no necesita incluir el `kind`: el tipo de la cuenta ya determina qué `kind`
puede apuntar a ella, así que dos líneas sobre una misma cuenta serían
forzosamente del mismo tipo.

U8 y U12 son diferibles porque reordenar intercambia posiciones y el estado
intermedio tiene duplicados aunque el final sea válido. Es el mismo patrón de
`sheet_drafts`.

### Claves foráneas

| Id | Origen | Destino |
| --- | --- | --- |
| F1 | `category_classifications (category_id, user_id)` | `categories (id, user_id)` |
| F2 | `plan_allocations (plan_month_id, user_id)` | `plan_months (id, user_id)` |
| F3 | `plan_income_sources (plan_month_id, user_id)` | `plan_months (id, user_id)` |
| F4 | `plan_income_source_categories (plan_income_source_id, plan_month_id)` | `plan_income_sources (id, plan_month_id)` |
| F5 | `plan_income_source_categories (category_id, user_id)` | `categories (id, user_id)` |
| F6 | `plan_lines (plan_month_id, user_id)` | `plan_months (id, user_id)` |
| F7 | `plan_lines (plan_month_id, period_month)` | `plan_months (id, period_month)` |
| F8 | `plan_lines (category_id, user_id)` | `categories (id, user_id)` |
| F9 | `plan_lines (account_id, user_id)` | `accounts (id, user_id)` |

F4 es lo que impide que el puente apunte a una fuente de otro mes. F7 es lo que
sostiene C4.

Las claves hacia tablas padre son `deferrable initially deferred` y `no action`
en vez de `restrict`. El motivo es el ya documentado en `budgets`: al borrar un
usuario, las cascadas corren dentro de la misma sentencia y en el punto
intermedio una fila puede referenciar otra ya borrada, aunque al final no quede
ninguna referencia. Diferida al commit, la comprobación solo ve el estado final.
`restrict` comprueba de inmediato y no admite diferimiento.

### Triggers

| Id | Tabla | Regla |
| --- | --- | --- |
| T1 | `category_classifications` | La categoría es de tipo `expense` y no está archivada **al estrenar** |
| T2 | `plan_income_source_categories` | La categoría es de tipo `income` y no está archivada al estrenar |
| T3 | `plan_lines` | `bill` y `variable`: categoría `expense` no archivada al estrenar. `savings`: cuenta `type='savings'` no archivada al estrenar. `investment`: cuenta `type='investment'` no archivada al estrenar |
| T4 | `plan_allocations` | La suma de `percent_bp` del mes es exactamente 10000 |
| T5 | Las cinco tablas con `updated_at` | `set_updated_at()`, reutilizando la función existente |

T1, T2 y T3 siguen la semántica de `validate_budget()`: **prohibido estrenar,
no prohibido conservar**. Se deniega apuntar hacia una categoría o cuenta
archivada o de tipo incorrecto; se permite seguir editando una línea histórica
que ya la usaba. Un mes cerrado nunca deja de poder consultarse porque después
se archivara una categoría.

Son triggers y no funciones RPC porque un trigger no se puede esquivar: se
ejecuta en cualquier INSERT o UPDATE, venga de donde venga. Una RPC solo protege
a quien decide llamarla.

Todos son `security invoker` con `search_path` vacío y nombres calificados: su
SELECT queda sujeto a RLS, de modo que la función no puede convertirse en una
vía para leer datos ajenos, y un `search_path` manipulado no puede desviar las
consultas a un esquema suplantado.

T4 es un **constraint trigger diferido al commit**, por la misma razón que las
claves foráneas: reasignar porcentajes toca varias filas y el estado intermedio
es inválido aunque el final no lo sea.

Ningún trigger de esta fase consulta `accounts.type = 'credit_card'`.

### RLS

Las seis tablas con RLS activa y cuatro políticas explícitas —SELECT, INSERT,
UPDATE y DELETE— sobre `auth.uid() = user_id`, con `WITH CHECK` en INSERT y
UPDATE. La pertenencia cruzada la garantizan las claves foráneas compuestas, no
las políticas.

---

## Fórmulas

Todo en `bigint`, unidades mínimas, aritmética entera. `M` es el rango de fechas
del mes del plan.

### Ingreso

```
ingresoPlaneado  = Σ plan_income_sources.planned_minor de M
ingresoActual    = Σ amount_minor donde type = 'income' y fecha ∈ M
ingresoActual(f) = Σ amount_minor donde type = 'income', fecha ∈ M
                     y category_id ∈ categorías vinculadas a la fuente f
```

### Presupuesto y asignado

```
presupuestoCategorias = Σ budgetEfectivo(c, M) sobre todas las categorías con
                          presupuesto efectivo no nulo en M
ahorroPlan    = Σ planned_minor de plan_lines kind = 'savings'
inversionPlan = Σ planned_minor de plan_lines kind = 'investment'

asignado   = presupuestoCategorias + ahorroPlan + inversionPlan
porAsignar = ingresoPlaneado − asignado
```

`presupuestoCategorias` cuenta **todos** los presupuestos del mes, tengan o no
una línea descriptiva. La deuda entra por aquí, no se suma aparte: su categoría
tiene presupuesto en `budgets` como cualquier otra.

`porAsignar` compara planes. **No es dinero disponible**, y la interfaz debe
decirlo de forma fija.

### Reconciliación del presupuesto

```
presupuestoFacturas  = Σ budgetEfectivo(cat(l), M) para l con kind = 'bill'
presupuestoVariables = Σ budgetEfectivo(cat(l), M) para l con kind = 'variable'
presupuestoSinLinea  = presupuestoCategorias − presupuestoFacturas
                       − presupuestoVariables
```

`presupuestoSinLinea >= 0` **siempre**, y no por convención: U10 hace que los
conjuntos de categorías de facturas y variables sean disjuntos, y ambos son
subconjuntos de las categorías con presupuesto. La identidad se cumple por
esquema.

### Gastos

```
gastoActual         = Σ amount_minor donde type = 'expense' y fecha ∈ M
facturasActual      = Σ gastos de M con categoría de una línea bill
variablesActual     = Σ gastos de M con categoría de una línea variable
noPlaneadoActual    = gastoActual − facturasActual − variablesActual
gastosTotalesActual = gastoActual
gastosTotalesPlan   = presupuestoFacturas + presupuestoVariables
```

Identidad garantizada por esquema:

```
facturasActual + variablesActual + noPlaneadoActual = gastoActual
```

Un movimiento sin línea asociada **no se reparte**: aparece en «No planeado»,
que es una fila visible, no un residuo escondido.

### Deuda

```
deudaPlaneado = Σ budgetEfectivo(c, M) sobre categorías clasificadas 'debt'
deudaActual   = Σ gastos de M con categoría clasificada 'debt'
```

`deudaActual` **ya está incluida** en `gastoActual`: es un gasto como cualquier
otro. No se suma ni se resta aparte en ningún sitio.

La fila de Deuda del cuadro Presupuesto vs. Actual es un **indicador**, no un
componente del desglose de Gastos totales. Una categoría clasificada `debt`
puede además tener una línea `bill` o `variable`, en cuyo caso su gasto aparece
también en Facturas o en Variables. No es doble conteo: son dos lecturas
distintas del mismo total, y nunca se suman entre sí. Ver «Las dos
particiones».

### Las tres cifras de ahorro

Tres cosas distintas con tres nombres distintos. Nunca «Total ahorrado».

```
ahorroNeto    = ingresoActual − gastoActual              (puede ser negativo)

aportesAhorro = Σ amount_minor de t donde
                  t.type = 'transfer' y t.transfer_direction = 'incoming'
                  y t.account_id es una cuenta type = 'savings'
                  y fecha ∈ M
                  y la pata saliente del mismo transfer_group_id está en una
                    cuenta con type distinto de 'savings'

saldoEnAhorro = Σ sobre cuentas type = 'savings' de
                  initial_balance_minor + ingresos + entrantes
                  − gastos − salientes
```

`saldoEnAhorro` es un saldo acumulado, no un flujo del mes. Se muestra como
dato de contexto y **nunca** entra en el cuadro Presupuesto vs. Actual ni en el
Restante: mezclar un stock con flujos es el error clásico de estas plantillas.

Contar solo la pata entrante es lo que impide sumar dos veces el mismo
movimiento, ya que una transferencia son dos filas. Excluir el caso en que el
origen tiene el mismo tipo que el destino es lo que impide que mover dinero
entre dos cuentas de ahorro cuente como ahorrar de nuevo.

Estas transferencias son registros que el usuario tecleó. Leerlas no las
ejecuta ni las origina.

### Inversión

```
aportesInversion = igual que aportesAhorro, con type = 'investment'
                   (excluye investment → investment)
```

### Restante

```
restanteActual   = ingresoActual − gastoActual − aportesAhorro − aportesInversion
restantePlaneado = ingresoPlaneado − asignado
```

`deudaActual` **no** se resta por separado: es un gasto y ya está dentro de
`gastoActual`. Restarla otra vez la contaría dos veces.

`restantePlaneado` y `porAsignar` son **el mismo número**: todo lo planeado que
sale es exactamente `asignado`. La interfaz muestra una sola cifra, con un solo
nombre.

### Reparto 50/30/20

Porcentajes en puntos base, con suma exactamente 10000.

```
base[g]  = (ingresoPlaneado × percent_bp[g]) ÷ 10000     división entera
resto[g] = (ingresoPlaneado × percent_bp[g]) mod 10000
sobrante = ingresoPlaneado − Σ base[g]
```

Reparto del sobrante por **mayor resto**: se ordenan los grupos por `resto[g]`
descendente y se suma una unidad mínima a los primeros `sobrante`. Los empates
se rompen con el orden fijo `needs, wants, savings, investment, debt`.

Garantiza que `Σ grupoPlaneado = ingresoPlaneado` exactamente, de forma
determinista y sin coma flotante en ningún punto.

```
grupoActual[needs]      = Σ gastos de M con categoría clasificada 'needs'
grupoActual[wants]      = Σ gastos de M con categoría clasificada 'wants'
grupoActual[debt]       = deudaActual
grupoActual[savings]    = aportesAhorro
grupoActual[investment] = aportesInversion
sinClasificar           = Σ gastos de M con categoría sin clasificación
```

`sinClasificar` es una fila propia, **fuera** de los cinco grupos.

La suma de los cinco grupos **no coincide** con Gastos totales, porque ahorro e
inversión son transferencias registradas y no gastos. No es un error de cuadre:
son magnitudes distintas. El reparto mide destinos del ingreso; Gastos totales
mide solo `type = 'expense'`. La interfaz los separa visualmente y lo explica.

### Las dos particiones del gasto

El gasto del mes se descompone de dos maneras distintas, cada una exacta por su
propio índice único. **No se cruzan ni se suman entre sí.**

| Partición | Criterio | Disjunta por | Identidad |
| --- | --- | --- | --- |
| Desglose | Qué línea describe la categoría | U10 | `facturas + variables + noPlaneado = gastoActual` |
| Reparto | Cómo está clasificada la categoría | U1 | `needs + wants + debt + sinClasificar = gastoActual` |

En el cuadro Presupuesto vs. Actual, las filas Facturas, Gastos variables y No
planeado pertenecen al desglose y suman Gastos totales. Las filas Ahorro,
Inversión y Deuda son indicadores y **no** forman parte de esa suma. La
interfaz debe distinguirlo visualmente.

### Diferencia

| Filas | Fórmula | Positivo significa |
| --- | --- | --- |
| Ingresos, Ahorro, Inversión | `actual − planeado` | Favorable |
| Gastos, Facturas, Variables, Deuda | `planeado − actual` | Favorable |

La igualdad exacta es **«En objetivo»**, ni favorable ni desfavorable. Es
coherente con el criterio de `docs/06-presupuestos.md`, donde el 100% exacto es
`warning_90` y no `over`: superado significa estrictamente gastar más.

Sin presupuesto, la diferencia es nula y se etiqueta «Sin presupuesto», nunca
`0`. La etiqueta se escribe **en texto**; el color solo acompaña.

### Estados

Dos ejes distintos, no uno.

**Progreso**, en cualquier fila con presupuesto. Se reutiliza el vocabulario y
los umbrales de `docs/06-presupuestos.md` para que la aplicación tenga un solo
lenguaje de estado: `ok`, `warning_70`, `warning_90`, `over`, `unbudgeted`, con
las comparaciones hechas con enteros.

**Pago**, solo en `kind = 'bill'`:

| Estado | Condición |
| --- | --- |
| `pagada` | actual >= planeado |
| `parcial` | 0 < actual < planeado |
| `pendiente` | actual = 0 y `due_date` es hoy o posterior |
| `vencida` | actual = 0 y `due_date` ya pasó |
| `no_aplica` | sin presupuesto |

«Pagada» describe lo que el usuario registró, no una acción de la aplicación:
FinTrack no paga nada. «Hoy» se evalúa en la zona horaria del perfil
(`profiles.timezone`).

---

## Prevención del doble conteo

Cuatro barreras estructurales. Ninguna depende de la disciplina del usuario ni
de una comprobación en tiempo de consulta.

| # | Barrera | Mecanismo |
| --- | --- | --- |
| 1 | Una categoría, un grupo | U1 |
| 2 | Una categoría, una línea por mes | U10 |
| 3 | El `kind` fija el eje, y el eje fija el origen del importe | C5, C6, C7 |
| 4 | Una transferencia registrada no se suma dos veces | Solo cuenta la pata entrante, y se excluye si origen y destino comparten `type` |

### Matriz de escenarios

| Escenario | Gastos totales | Reparto | Desglose | Duplica |
| --- | --- | --- | --- | --- |
| Gasto normal clasificado, sin línea | Sí | Según clasificación | No planeado | No |
| Factura | Sí | Según clasificación | Facturas | No — U10 |
| Gasto variable | Sí | Según clasificación | Variables | No — U10 |
| Gasto no planeado | Sí | Según clasificación | No planeado | No |
| Pago de deuda externa | Sí | `debt` | Según su línea, o No planeado | No |
| Gasto que el usuario hizo con su tarjeta | Sí, una vez | `needs` o `wants` por su categoría real | Según su línea | No |
| Transferencia registrada hacia una cuenta `credit_card` | No | **Fuera de todo** | — | No |
| Banco → Ahorro | No | `savings` | — | No |
| Ahorro → Ahorro | No | **Excluido** | — | No |
| Ahorro → Banco | No | No es aporte | — | No |
| Banco → Inversión | No | `investment` | — | No |
| Inversión → Inversión | No | **Excluido** | — | No |
| Categoría sin clasificar | Sí | **Sin clasificar**, fila visible | Según su línea | No |
| Categoría archivada con historial | Sí | Conserva su clasificación | Sí | No |
| Categoría con presupuesto y sin línea | Sí | Según clasificación | No planeado | No |

### Un gasto hecho con tarjeta

Se registra como un movimiento `expense` con su categoría real de consumo, y se
cuenta **una sola vez**: en Gastos totales y en el grupo que le corresponda por
esa categoría. El tipo de la cuenta no interviene en ninguna fórmula.

### Transferencia registrada hacia una cuenta `credit_card`

Es una **transferencia no analizada por Plan mensual**. No se incluye en
ingresos, gastos, ahorro, inversión, deuda ni Restante, y no aparece en
`/plan`. Puede existir en `/transactions` y en `/ledger`, porque son registros
manuales del usuario.

No es una excepción inventada para este caso: es la regla general de toda la
aplicación —una transferencia no es ingreso ni gasto y conserva el saldo
consolidado, `docs/02-base-de-datos.md`— aplicada sin más. No hay interfaz
especial, ni indicador de pago de tarjeta, ni nada que la trate distinto.

---

## Reconciliación del presupuesto

Bloque plegable, entre el cuadro Presupuesto vs. Actual y el de facturas.

```
Presupuesto por categorías
  Descrito en facturas
  Descrito en gastos variables
  Sin línea descriptiva            [Completar]

Planificado por cuenta
  Aportes a ahorro
  Aportes a inversión

Asignado
Ingreso planeado
Por asignar
```

Reglas de presentación:

- La suma de las tres sublíneas del presupuesto por categorías es siempre
  exacta. No es una validación: es la identidad que garantiza U10.
- El presupuesto de la deuda está dentro de estas tres sublíneas, según tenga
  línea descriptiva o no. No lleva fila propia aquí.
- **«Sin línea descriptiva» no es un error.** Tono neutro, sin rojo y sin icono
  de alerta. Es una invitación: «Completar» abre la creación de una línea con
  la categoría ya seleccionada.
- Si vale 0, la fila se muestra igualmente, con una marca discreta de plan
  completo. Ocultarla haría creer que la reconciliación no existe.
- Al desplegarla se listan las categorías concretas con su presupuesto y su
  acción de completar.
- «Por asignar» negativo se etiqueta **«Sobreasignado»** en texto, explicando
  que se ha asignado más que el ingreso planeado.
- Nota fija bajo el bloque: «Por asignar» compara planes, no dinero disponible.
- En móvil el bloque nace plegado, con el titular «Asignado X de Y».

---

## Clasificación de categorías

**No hay siembra automática.** Ni siquiera desde la partición entre gastos
esenciales y flexibles de `docs/03-ui-ux.md`, que se le parece mucho. Una
clasificación equivocada en silencio falsea el mes entero; una fila «Sin
clasificar» visible no falsea nada. La siembra es una acción de interfaz con
sugerencias preseleccionadas que el usuario confirma.

**Las categorías de ingreso no se clasifican.** El reparto distribuye el
ingreso, no lo clasifica.

**Las categorías archivadas conservan su clasificación** y siguen valiendo para
meses cerrados. Solo se deniega estrenar una clasificación nueva con una
categoría archivada.

**Las categorías sin clasificar nunca se adivinan.** Se acumulan en una fila
«Sin clasificar» visible, con un aviso en la cabecera del mes. Asignarlas en
silencio a «Necesidades» falsearía el mes entero.

**La deuda se declara aquí y solo aquí.** Clasificar una categoría como `debt`
es lo único que hace que sus gastos cuenten como deuda. No hay línea, tabla ni
importe separado que pueda contradecirlo.

---

## Migraciones previstas

Sin SQL todavía. Tres migraciones, en este orden:

| Orden | Migración | Contenido | Depende de |
| --- | --- | --- | --- |
| M1 | `ampliar_tipos_de_cuenta` | Recrear `accounts_type_check` con `'investment'` y añadir `unique (id, user_id)` en `accounts` | — |
| M2 | `crear_clasificacion_categorias` | `category_classifications` con U1, F1, RLS y T1 | — |
| M3 | `crear_plan_mensual` | Las cinco tablas restantes, con C1 a C9, U2 a U12, F2 a F9, RLS y T2, T3, T4 | M1 |

M1 y M2 son independientes entre sí. Las cinco tablas de M3 van juntas porque
sus claves foráneas compuestas son mutuamente dependientes y separarlas dejaría
estados intermedios inválidos.

**Sin backfill:** las seis tablas nacen vacías.

**Las tres son solo forward.** Ninguna incluye SQL de reversión dentro del
archivo de migración. Un rollback copiable, listo para ejecutar, invita a
ejecutarse sin leer sus guardas; revertir un esquema es una decisión
deliberada, no un paso más de un procedimiento.

**Paso obligatorio tras M1:** regenerar `database.types.ts`.

### Rollback manual de M1

M1 hace dos cosas, y ambas se deshacen a mano en orden inverso:

1. **Eliminar la restricción `accounts_id_user_id_key`.** Solo es posible si
   ninguna clave foránea la usa como destino, es decir, únicamente antes de
   aplicar M3 o después de haberla revertido.
2. **Recrear `accounts_type_check`** con los cinco valores originales: `cash`,
   `checking`, `savings`, `digital_wallet` y `credit_card`.

**Guarda obligatoria antes del paso 2:** comprobar si existe alguna cuenta con
`type = 'investment'`. Si la hay, **el rollback debe detenerse con un error
explícito** y no continuar.

**Nunca se debe borrar, reasignar, archivar ni modificar automáticamente una
cuenta con `type = 'investment'`** para que el rollback pueda seguir adelante.
Esa cuenta es un dato del usuario, no un obstáculo. Si se intenta recrear el
CHECK estrecho con filas que lo violan, PostgreSQL rechaza la operación: esa
negativa es la señal correcta, no un problema que haya que sortear. Qué hacer
con esas cuentas lo decide el usuario, y se decide **antes** de revertir nada.

Este documento no incluye el SQL del rollback a propósito, por el mismo motivo
por el que la migración tampoco lo lleva.

### Rollback manual de M2 y M3

Se revierten borrando sus tablas y funciones de trigger en orden inverso al de
creación. M3 antes que M2 si ambas están aplicadas, y M1 solo después de M3,
porque F9 apunta a `accounts_id_user_id_key`.

---

## Fuera de alcance

Editar cualquier valor «Actual». Copiar el plan de un mes a otro. Reordenar
líneas. Corregir automáticamente meses cerrados. Vincular un movimiento
concreto a una línea mediante una columna en `transactions`. Metas y aportes a
metas, que dependen de `goals` y son Fase 9. Importación CSV, que es Fase 10.
Absorber `/budgets` dentro de `/plan`.

Tampoco entran, por decisión de producto: inteligencia artificial, integración
bancaria, Open Finance, SMS, lectura de notificaciones, fórmulas libres y
edición masiva.

Y nada relativo a tarjetas como producto: pagos, cupos, intereses, fechas de
corte, pagos mínimos, cobros o automatizaciones. FinTrack no las gestiona.

Sin una columna en `transactions`, una línea se asocia a movimientos por su
categoría. La consecuencia es que varias facturas que comparten categoría —por
ejemplo tres suscripciones dentro de «Suscripciones»— se planifican como una
sola línea y no pueden tener un importe real propio. Es una limitación conocida
y aceptada de este release, no un descuido.
