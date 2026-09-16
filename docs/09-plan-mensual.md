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

### Líneas de aporte en la interfaz

Las líneas `savings` e `investment` **sí** llevan cifra: su importe planeado
vive en la propia línea. En `/plan` se gestionan desde la tarjeta de su tipo en
el bloque «Ahorro e inversión», y solo con plan del mes:

- **Crear.** El botón fija el tipo. El formulario pide nombre (obligatorio, sin
  valor por defecto), cuenta e importe planeado. El selector ofrece solo cuentas
  del tipo, sin archivar y sin aporte este mes: exactamente lo que T3 y U11
  aceptan. Una cuenta tiene como mucho un aporte al mes; varias líneas del mismo
  tipo exigen cuentas distintas.
- **Editar.** Solo nombre e importe. Ni la cuenta ni el tipo: T3 los trata como
  estrenar el destino, y cambiar de cuenta cambiaría qué transferencias se
  miden. Corregirlos es borrar la línea y crear otra. El importe se puede
  corregir aunque la cuenta se haya archivado después.
- **Borrar.** «Se eliminará el aporte planeado. La cuenta y sus movimientos no se
  tocan.»
- **Importe 0.** Válido: se muestra «COP 0» y suma 0 a Asignado; nunca «Sin
  aportes planeados».
- **Efecto.** `ahorroPlan` e `inversionPlan` suben al momento, y con ellos
  Asignado, Por asignar, el Restante planeado, «Planificado por cuenta» de la
  reconciliación y las filas Ahorro e Inversión del cuadro.
- **Errores.** U11 y los mensajes de T3 sobre la cuenta se traducen como errores
  de cuenta («Esa cuenta ya tiene un aporte planeado este mes…», «No se puede
  planificar un aporte sobre una cuenta archivada.»), nunca como errores de
  categoría.

- **Moneda (M5).** El selector ofrece solo cuentas en la moneda del Plan. Una
  línea que ya exista sobre una cuenta en otra moneda —creada antes de M5, o
  porque la cuenta cambió de moneda sin tener movimientos— se marca «Cuenta en
  USD: su aporte real no se cuenta». Su importe planeado sigue contando, porque
  es una cifra escrita en la moneda del Plan.

Límites conocidos de esta entrega: cada fila muestra solo lo planeado, porque
el real se mide por tipo de cuenta y no por cuenta ni por línea; y si una
cuenta cambia de tipo después de crear su aporte, la línea sigue contando por
su `kind` mientras el real deja de medir esa cuenta.

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

### Moneda del Plan (M5)

FinTrack no convierte divisas, así que el Plan va entero en **una sola moneda**:
la de presentación, que es la principal del perfil si el usuario tiene alguna
cuenta en ella y, si no, la de la primera cuenta (`resolvePresentationCurrency`,
el mismo criterio del Dashboard y del Libro). Ninguna tabla del Plan ni
`budgets` guarda moneda: sus importes se entienden en esa. Las reglas generales
de moneda, con ejemplos y limitaciones, están en `docs/11-reglas-de-moneda.md`.

Todas las fórmulas de abajo se calculan **solo** con movimientos de cuentas en
esa moneda. El recorte se hace una sola vez, antes de cualquier cifra
(`scopePlanMonthToCurrency`), para que ingresos, gastos, líneas, reparto, aportes
y Restante no puedan descuadrarse entre sí:

- Ingresos y gastos de cuentas en otra moneda quedan fuera de todas las cifras.
- Un movimiento cuya cuenta no se conoce se queda dentro, como en el Libro.
- Aportes: ver «Las tres cifras de ahorro».
- No hay desglose por moneda. Lo excluido se cuenta y se avisa encima del Plan:
  «3 movimientos en otras monedas (USD, ARS) no se incluyen en este Plan.» En
  singular, «1 movimiento en otra moneda (USD) no se incluye en este Plan.» Sin
  aviso si no falta nada. Cuentan ingresos, gastos y aportes excluidos (uno por
  transferencia); las demás transferencias no, porque el Plan nunca las usa.

Con una sola moneda, nada cambia respecto a antes de M5.

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
dato de contexto en el bloque «Ahorro e inversión», **al cierre del mes
consultado** y con las cuentas archivadas incluidas (se indica cuántas), y
**nunca** entra en el cuadro Presupuesto vs. Actual ni en el Restante: mezclar
un stock con flujos es el error clásico de estas plantillas.

Contar solo la pata entrante es lo que impide sumar dos veces el mismo
movimiento, ya que una transferencia son dos filas. Excluir el caso en que el
origen tiene el mismo tipo que el destino es lo que impide que mover dinero
entre dos cuentas de ahorro cuente como ahorrar de nuevo.

Estas transferencias son registros que el usuario tecleó. Leerlas no las
ejecuta ni las origina.

**Moneda (M5).** Un aporte cuenta en el Plan **solo si la cuenta de destino está
en la moneda del Plan**. Las transferencias a cuentas de ahorro o inversión en
otra moneda quedan registradas con su importe en esa moneda, pero el Plan no las
suma ni las convierte.
Se usa el importe de la pata entrante, que ya va en la moneda de destino (M4),
así que la moneda de origen no importa: un aporte desde una cuenta en USD a una
cuenta de ahorro en COP cuenta, y en COP. Un aporte a una cuenta de ahorro en USD
queda fuera y entra en el aviso de movimientos excluidos.

`saldoEnAhorro` y `saldoEnInversion` suman solo las cuentas en la moneda del
Plan. Las del tipo en otra moneda se dicen aparte («1 cuenta en otra moneda no
se suma»); si todas lo están, no se muestra «Sin cuentas» sino esa nota.

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
`0`. En Ahorro e Inversión la ausencia es de aportes planeados y se etiqueta
«Sin aportes planeados», en planeado y en diferencia. La etiqueta se escribe
**en texto**; el color solo acompaña.

Una fila agregada cuyo presupuesto es todo 0 se muestra «Sin presupuesto»: el
0 explícito no se compara como objetivo, y la fila no puede enunciarlo
categoría por categoría.

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

Bloque plegable de **solo lectura**. En `/plan` aparece después del reparto
50/30/20 y del aviso de gasto sin clasificar, y **antes de Facturas y gastos
variables**: explica qué parte del presupuesto por categorías ya describen las
líneas y qué parte todavía no, así que se lee antes que las propias líneas.

```
Presupuesto por categorías
  Descrito en facturas
  Descrito en gastos variables
  Sin línea descriptiva

Planificado por cuenta
  Aportes a ahorro planeados
  Aportes a inversión planeados

Asignado
Ingreso planeado
Por asignar
```

Reglas de presentación:

- La suma de las tres sublíneas del presupuesto por categorías es siempre
  exacta. No es una validación: es la identidad que garantiza U10.
- «Asignado» es la misma cifra que la tarjeta «Presupuesto asignado» del
  resumen: presupuesto por categorías más los aportes planeados por cuenta. El
  reparto 50/30/20 no se usa como sustituto de esos aportes.
- El presupuesto de la deuda está dentro de estas tres sublíneas, según tenga
  línea descriptiva o no. No lleva fila propia aquí.
- **«Sin línea descriptiva» no es un error.** Tono neutro, sin rojo y sin icono
  de alerta.
- Si vale 0, la fila se muestra igualmente, con una marca discreta de plan
  completo. Ocultarla haría creer que la reconciliación no existe.
- Al desplegarla se listan las categorías con presupuesto y sin línea, con su
  importe, y las líneas cuya categoría no tiene presupuesto efectivo ese mes.
  Una línea sin presupuesto **es válida**: solo no suma a lo asignado.
- Un presupuesto resuelto en 0 se dice «Presupuesto en COP 0», nunca «Sin
  presupuesto»: es una decisión explícita del usuario, no una ausencia.
- El formulario de líneas dice «Ahora mismo: Presupuesto en COP 0» para un 0
  explícito, y «Sin presupuesto este mes» cuando no hay ninguno.
- Si todos los presupuestos por categoría del mes son 0, «Presupuesto por
  categorías» dice «Sin presupuesto», y una categoría en 0 sin línea no aparece
  en ningún listado del bloque.
- Sin líneas de ahorro o inversión, esas filas dicen «Sin aportes planeados».
  No son presupuestos por categoría, así que no se dice «Sin presupuesto».
- «Por asignar» negativo se etiqueta **«Sobreasignado»** en texto, explicando
  que se ha asignado más que el ingreso planeado.
- Sin fuentes de ingreso se dice «Sin ingreso planeado». Una fuente explícita
  de 0 **sí** es ingreso planeado: se compara contra COP 0.
- Nota fija bajo el bloque: «Por asignar» compara planes, no dinero disponible.
- El bloque nace plegado en móvil y en escritorio, con el titular «Asignado X
  de Y» —o «Sobreasignado por X»— visible también plegado.

### Alcance de la primera entrega

La primera entrega de la reconciliación es **de solo lectura**:

- Puede enlazar a Presupuestos (`/budgets?month=YYYY-MM`), con un enlace por
  grupo y no uno por fila, porque esa pantalla no navega a una categoría
  concreta. Una categoría archivada no recibe invitación a completar su
  presupuesto: no admite presupuestos nuevos.
- Puede explicar qué categorías tienen presupuesto sin una línea descriptiva,
  pero **no abre formularios, no crea líneas y no preselecciona categorías**.
- No crea ni modifica presupuestos, líneas, clasificaciones ni movimientos.

La acción de crear una factura o un gasto variable desde una categoría
presupuestada sin línea —«Completar», con la categoría ya seleccionada— queda
**aplazada a una entrega posterior**.

---

## Clasificación de categorías

**No hay siembra automática.** Ni siquiera desde la partición entre gastos
esenciales y flexibles de `docs/03-ui-ux.md`, que se le parece mucho. Una
clasificación equivocada en silencio falsea el mes entero; una fila «Sin
clasificar» visible no falsea nada.

La primera entrega de clasificación de categorías **no siembra, no
preclasifica y no presenta sugerencias preseleccionadas**. Las categorías de
gasto empiezan sin grupo presupuestario. La persona asigna explícitamente
«Necesidades», «Deseos» o «Deuda» desde Ajustes. FinTrack no deduce el grupo a
partir del nombre de la categoría, del importe, del historial de movimientos ni
del presupuesto de esa categoría.

Las sugerencias confirmables no quedan descartadas para siempre, pero son una
entrega independiente y con sus propias pruebas. Si alguna vez se implementan,
se mostrarían sin selección previa, exigirían una confirmación explícita por
categoría y no escribirían nada antes de ella. Ninguna versión de esa función
puede modificar automáticamente datos ya existentes.

**La clasificación pertenece a la categoría, no al mes.** No hay
`plan_month_id` en `category_classifications`, y no es un descuido: clasificar
«Vivienda» como `needs` cambia la lectura de todos los meses, cerrados
incluidos.

**La edición vive en Ajustes**, junto a las categorías, y por ese mismo motivo:
una pantalla cuya cabecera dice «Septiembre 2026» daría a entender que la
decisión solo alcanza a septiembre.

**`/plan` muestra el resultado y enlaza al editor.** Cuando queda gasto sin
clasificar, el bloque del reparto dice cuánto es y lleva a Ajustes. No ofrece un
segundo editor: dos superficies para la misma decisión acabarían divergiendo.

**Las categorías de ingreso no se clasifican.** El reparto distribuye el
ingreso, no lo clasifica. Una categoría de ingreso sin clasificar no aparece en
el panel de clasificación.

**Las categorías archivadas conservan su clasificación** y siguen valiendo para
meses cerrados. Una clasificación existente sigue siendo editable aunque su
categoría se archive o cambie de tipo después, y lo editable es **solo el
grupo**: cambiar la categoría de una clasificación es estrenarla, y entonces
vuelven a aplicarse todas las reglas. Una categoría archivada que no tenga
clasificación no puede recibir una nueva; el panel no se la ofrece, en vez de
ofrecer un botón que el servidor va a rechazar.

**Las categorías sin clasificar nunca se adivinan.** Se acumulan en una fila
«Sin clasificar» visible, con un aviso en la cabecera del mes. Asignarlas en
silencio a «Necesidades» falsearía el mes entero.

**La deuda se declara aquí y solo aquí.** Clasificar una categoría como `debt`
es lo único que hace que sus gastos cuenten como deuda. No hay línea, tabla ni
importe separado que pueda contradecirlo.

---

## Migraciones previstas

Aplicadas. Tres migraciones, en este orden. Se numeran «Migración 1, 2 y 3»
aquí y en `docs/10-pruebas-plan.md`: «M1» a «M5» son las fases de moneda
(`docs/11-reglas-de-moneda.md`), que no tienen relación con estas.

| Orden | Migración | Contenido | Depende de |
| --- | --- | --- | --- |
| Migración 1 | `ampliar_tipos_de_cuenta` | Recrear `accounts_type_check` con `'investment'` y añadir `unique (id, user_id)` en `accounts` | — |
| Migración 2 | `crear_clasificacion_categorias` | `category_classifications` con U1, F1, RLS y T1 | — |
| Migración 3 | `crear_plan_mensual` | Las cinco tablas restantes, con C1 a C9, U2 a U12, F2 a F9, RLS y T2, T3, T4 | Migración 1 |

Las migraciones 1 y 2 son independientes entre sí. Las cinco tablas de la
migración 3 van juntas porque
sus claves foráneas compuestas son mutuamente dependientes y separarlas dejaría
estados intermedios inválidos.

**Sin backfill:** las seis tablas nacen vacías.

**Las tres son solo forward.** Ninguna incluye SQL de reversión dentro del
archivo de migración. Un rollback copiable, listo para ejecutar, invita a
ejecutarse sin leer sus guardas; revertir un esquema es una decisión
deliberada, no un paso más de un procedimiento.

**Paso obligatorio tras la migración 1:** regenerar `database.types.ts`.

### Rollback manual de la migración 1

La migración 1 hace dos cosas, y ambas se deshacen a mano en orden inverso:

1. **Eliminar la restricción `accounts_id_user_id_key`.** Solo es posible si
   ninguna clave foránea la usa como destino, es decir, únicamente antes de
   aplicar la migración 3 o después de haberla revertido.
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

### Rollback manual de las migraciones 2 y 3

Se revierten borrando sus tablas y funciones de trigger en orden inverso al de
creación. La migración 3 antes que la 2 si ambas están aplicadas, y la 1 solo
después de la 3, porque F9 apunta a `accounts_id_user_id_key`.

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
