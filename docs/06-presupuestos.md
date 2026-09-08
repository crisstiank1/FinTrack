# FinTrack — Presupuestos

> Modelo de datos y reglas de cálculo. Fase 8.

---

## Modelo histórico

Un presupuesto no se sobrescribe: se versiona. Editar el presupuesto de una
categoría crea una versión nueva vigente desde el mes actual y deja intactas
las anteriores, para que **el progreso de un mes ya cerrado nunca cambie de
forma retroactiva**.

La tabla `budgets` guarda dos tipos de fila, distinguidos por `period_month`:

| Tipo | `period_month` | `effective_from` | Significado |
| --- | --- | --- | --- |
| Plantilla | `NULL` | primer día del mes | Vigente desde ese mes en adelante |
| Excepción | primer día del mes | igual a `period_month` | Sobrescribe la plantilla solo en ese mes |

Ambas fechas se validan contra su propio truncado a mes, así que siempre caen
en el día 1. Sin eso, `2026-09-15` y `2026-09-01` serían dos valores distintos
para los índices únicos y una categoría podría acabar con dos presupuestos en
el mismo septiembre.

---

## Resolución del presupuesto vigente

Para una categoría `C` y un mes `M`:

1. **La excepción exacta de `M`**, si existe.
2. Si no, **la plantilla más reciente cuyo `effective_from` no sea posterior a
   `M`**.
3. Si no existe ninguna, **`C` no tiene presupuesto en `M`**.

`amount_minor = 0` es una decisión explícita: *"no presupuestar esta categoría
durante este mes"*. La resolución lo devuelve tal cual, sin convertirlo en
"sin presupuesto", porque distinguir un 0 deliberado de una categoría que
nunca se configuró le sirve a la interfaz. Es el cálculo de progreso el que
traduce ese 0 a `unbudgeted`.

### Ejemplo

Plantillas de "Alimentación": `2026-08` → 100.000, `2026-10` → 300.000.
Excepción: `2026-09` → 0.

| Mes | Resuelve | Origen | Motivo |
| --- | --- | --- | --- |
| 2026-07 | sin presupuesto | — | Ninguna plantilla vigente todavía |
| 2026-08 | 100.000 | plantilla | Única vigente |
| 2026-09 | 0 | excepción | La excepción manda sobre la plantilla |
| 2026-10 | 300.000 | plantilla | Versión nueva ya vigente |
| 2026-11 | 300.000 | plantilla | Sigue siendo la más reciente |

Crear la versión de octubre **no cambió** agosto ni septiembre.

Implementación: [`resolveBudget`](../src/features/budgets/resolution.ts).

---

## Gasto presupuestable

Solo consumen presupuesto los movimientos de tipo `expense` de esa categoría en
ese mes.

- **Las transferencias no cuentan.** Mover dinero entre cuentas propias no es
  gasto; además el esquema les impide tener categoría.
- **Los ingresos no cuentan.** Filtrar por tipo los excluye, y la base de datos
  ya impide presupuestar una categoría de ingreso.

Implementación: [`calculateBudgetableSpending`](../src/features/budgets/progress.ts).

---

## Progreso y umbrales

| Campo | Valor |
| --- | --- |
| `budgetMinor` | Presupuesto vigente, o `null` si no hay o es 0 |
| `spentMinor` | Gasto presupuestable del mes |
| `remainingMinor` | `budgetMinor − spentMinor`; negativo si se superó, `null` sin presupuesto |
| `ratio` | Proporción gastada (1 = 100%), `null` sin presupuesto |
| `status` | Umbral alcanzado |
| `source` | `exception`, `template` o `null` |

Sin presupuesto, `ratio` y `remainingMinor` son `null` en vez de `NaN` o
`Infinity`: nunca se divide entre cero.

### Un solo umbral por presupuesto

Al superar el 90% también se cruzan el 70% y el 100%, así que emitir todos
produciría tres avisos por la misma categoría. Se devuelve **solo el más
alto**:

| `status` | Condición |
| --- | --- |
| `over` | gasto > presupuesto |
| `warning_90` | gasto ≥ 90% y gasto ≤ presupuesto |
| `warning_70` | gasto ≥ 70% y gasto < 90% |
| `ok` | gasto < 70% |
| `unbudgeted` | sin presupuesto, o presupuesto 0 |

El 100% exacto es `warning_90`, no `over`: superado significa estrictamente
gastar **más** que el presupuesto.

Las comparaciones se hacen con enteros (`10·gasto ≥ 9·presupuesto`) en vez de
dividir, porque ni 0,7 ni 0,9 son exactos en coma flotante y un gasto justo en
el umbral podría clasificarse mal.

---

## Alerta global

Una sola: **ahorro neto negativo**.

El prompt maestro pide "ahorro neto negativo" y "gastos mayores que ingresos"
como alertas separadas, pero son la misma condición — el ahorro neto es
exactamente `ingresos − gastos`. Emitir ambas incumpliría el criterio de
"alertas claras y no duplicadas", así que se emite una.

Empatar ingresos y gastos **no** dispara la alerta: no es gastar de más.

Implementación: [`buildGlobalBudgetAlert`](../src/features/budgets/progress.ts).

---

## Categorías archivadas

La lógica pura no consulta el estado de la categoría, así que archivar una
categoría **no rompe** la consulta de meses ya cerrados: sus presupuestos
históricos se siguen resolviendo y calculando.

La restricción vive en la base de datos y solo impide *estrenar* una categoría
archivada: se deniega insertar un presupuesto con ella o cambiar un presupuesto
existente hacia ella, pero se permite seguir corrigiendo uno que ya la usaba, y
consultarlo o borrarlo.

La regla de tipo se comporta igual: solo se exige `expense` al insertar o al
cambiar de categoría. Un presupuesto histórico conserva su categoría original y
sigue siendo editable aunque después esa categoría se haya archivado o se le
haya cambiado el tipo.

`buildBudgetProgressList` recibe la lista de categorías a evaluar en vez de
deducirla, precisamente para que quien llama decida si incluir las archivadas
(necesario al consultar meses pasados) o solo las activas.

---

## Reglas de escritura

Guardar un presupuesto exige declarar **qué se está haciendo**. No se deduce
del mes ni del importe, porque las tres operaciones producen filas distintas y
obedecen reglas distintas.

| Intención | Fila que produce | Meses permitidos |
| --- | --- | --- |
| `template` | Plantilla vigente desde ese mes en adelante | Mes actual o futuro |
| `exception` | Excepción de un único mes | Pasado, actual o futuro |
| `correction` | Cambia el importe de una fila concreta | Cualquiera |

**Versionar hacia atrás está prohibido.** Una plantilla con `effective_from`
anterior al mes actual reescribiría el progreso de meses ya cerrados, que es
justo lo que el modelo histórico promete que no ocurre. Ni el CHECK ni el
trigger lo impiden —ninguno sabe en qué mes estamos—, así que el invariante
vive en `planBudgetWrite`. Para ajustar un mes ya cerrado se usa una excepción,
o una corrección sobre la fila concreta.

**Poner un mes a cero no es una operación aparte**: es una excepción con
`amountMinor: 0`.

**Una corrección solo cambia el importe.** Nunca `category_id`, `period_month`
ni `effective_from`. Conservar la categoría no es cosmético: es lo que hace que
el trigger permita corregir un presupuesto cuya categoría se archivó o cambió
de tipo después.

### INSERT o UPDATE

`budgets_template_unique_idx` cubre `(user_id, category_id, effective_from)
where period_month is null`. Editar dos veces la plantilla dentro del mismo mes
reutiliza el mismo `effective_from`, así que un INSERT ciego chocaría con el
índice. Un `upsert` tampoco vale: PostgREST no puede expresar el predicado
`where period_month is null` que PostgreSQL necesita para inferir un índice
único **parcial** en el `ON CONFLICT`.

Por eso `planBudgetWrite` decide entre INSERT y UPDATE mirando las filas ya
conocidas: si existe la plantilla de ese mes exacto, o la excepción de ese mes,
actualiza; si no, inserta. Reescribir la versión que empieza en el mes actual o
en uno futuro no es retroactivo, porque esa versión todavía no gobierna ningún
mes cerrado.

Implementación: [`planBudgetWrite`](../src/features/budgets/mutations.ts).

### Conflictos entre pestañas

El plan se calcula sobre una lista que puede estar obsoleta. Si otra pestaña
escribió antes, el INSERT choca con el índice único y PostgreSQL devuelve un
error de duplicado.

Ese caso **no se reintenta como UPDATE**: hacerlo pisaría en silencio el
importe que la otra pestaña acaba de guardar. Lo único automático es refrescar
la lista de presupuestos. Quien llama recibe un error de conflicto, ve el valor
actualizado y decide si vuelve a guardar.

### Errores

La capa de datos no deja escapar errores crudos de PostgreSQL. Todo sale como
un error de dominio con un código estable, para que la interfaz decida mirando
el código y no parseando texto, y para que ningún mensaje muestre códigos SQL o
nombres de índices al usuario.

| Origen | Código de dominio |
| --- | --- |
| Trigger: categoría de ingresos | `category_not_expense` |
| Trigger: categoría archivada | `category_archived` |
| Trigger o clave foránea: categoría ausente | `category_missing` |
| Índice único violado | `conflict` |
| Plantilla con mes pasado | `past_month_template` |
| Importe no entero o negativo | `invalid_amount` |
| RLS, permisos o sesión caducada | `forbidden` |
| Sin conexión | `network` |

Los tres mensajes del trigger llegan con el mismo SQLSTATE genérico `P0001`, así
que distinguirlos exige mirar el texto. Es el punto más frágil del mapeo y es
deliberado: darle a cada regla su propio SQLSTATE exigiría cambiar el trigger.
Si el texto cambia, el error cae en `unknown`, que sigue siendo correcto aunque
menos específico.

Implementación: [`toBudgetError`](../src/features/budgets/errors.ts).

---

## Consultas

| Hook | Clave | Qué trae |
| --- | --- | --- |
| `useBudgets()` | `['budgets', userId]` | Todas las filas del usuario |
| `useBudgetProgress()` | — | Derivación memoizada, sin caché propia |

La resolución por mes y categoría ocurre en memoria: son pocas filas y así
cambiar de mes no dispara una consulta. `fetchBudgets` tampoco pagina, a
diferencia del historial del dashboard, porque la tabla crece como mucho una
fila por categoría y mes editado.

El gasto se lee **acotado al mes consultado**, reutilizando
`useTransactions({ month, type: 'expense' })`, que filtra por rango de fechas y
por tipo en el servidor. No se reutiliza `useAllTransactions` del dashboard:
ese descarga el historial completo paginado porque necesita acumular saldos
desde el saldo inicial de cada cuenta, y colgar los presupuestos de él los haría
depender de que el dashboard se hubiera visitado antes.

`user_id` procede siempre de la sesión autenticada y actúa como filtro de
alcance y rendimiento. **La frontera de seguridad son las políticas RLS**, que
el servidor aplica aunque ese filtro faltase.

---

## Interfaz

### Las intenciones no se enseñan; se traducen

`template`, `exception` y `correction` son precisas, pero nadie piensa su
presupuesto en esos términos. El formulario pregunta por el efecto, no por el
mecanismo:

| Lo que ve el usuario | Intención |
| --- | --- |
| «Desde este mes en adelante» | `template` |
| «Solo este mes» | `exception` |
| «Corregir monto», dentro del historial | `correction` |

En un **mes ya cerrado la primera opción no se ofrece**: versionar hacia atrás
reescribiría meses pasados. La interfaz lo explica en vez de dejar que el
usuario descubra el error al guardar, pero `planBudgetWrite` sigue rechazándolo
igualmente — la restricción no puede depender de que la pantalla se comporte
bien.

La corrección no aparece en el flujo principal. Vive en el historial de cada
categoría, junto a las versiones que puede corregir, porque solo tiene sentido
sobre una fila concreta.

### Categorías archivadas

Aparecen **solo si tienen un presupuesto resoluble para el mes en pantalla**.
Sin esa condición, un mes pasado mostraría un progreso incompleto; con ella, la
lista del mes actual no se llena de categorías retiradas.

Cuando aparecen llevan la etiqueta «Archivada» y **no ofrecen crear un
presupuesto**: cualquier INSERT con una categoría archivada lo rechaza el
trigger, así que ofrecer el botón sería prometer algo que la base de datos no
va a permitir. Lo que sí conservan es el historial, con corrección y borrado de
sus filas: es exactamente lo que el trigger permite y sin ello los presupuestos
de una categoría retirada quedarían congelados con un error dentro.

Las categorías de ingreso no se listan nunca.

### Alertas

Derivadas, no persistentes: se calculan desde el progreso en cada render. No
hay nada que marcar como leído ni tabla que mantener.

- **Una sola alerta por presupuesto.** `classifyBudgetStatus` ya devuelve un
  único estado, así que el caso de tres avisos por la misma categoría no puede
  darse. Entre categorías se ordenan por gravedad: superado, luego 90%, luego
  70%.
- **Una sola alerta global**, la de ahorro neto negativo.
- En el dashboard cada alerta enlaza a `/budgets?month=YYYY-MM`, con el mes que
  se está viendo. Por eso el mes de esa pantalla vive en la URL: si viviera en
  el estado del componente, el enlace llevaría siempre al mes actual y perdería
  la razón por la que se pulsó.
- **A una categoría archivada no se le propone ajustar nada.** Se informa del
  umbral y se marca como archivada, porque la acción que sugeriría el enlace no
  está disponible para ella.

### Presupuesto de cero

Es una decisión válida, no un campo sin llenar, y la interfaz lo trata en dos
momentos:

- **Al escribirlo**, antes de guardar, aparece la advertencia: *"Un presupuesto
  de COP 0 significa que esta categoría no tendrá presupuesto en el periodo
  elegido"*. El campo del monto es de texto justamente por esto: un campo
  numérico convertiría el vacío en 0 y guardaría una decisión que nadie tomó.
  Vacío es error; 0 es una elección.
- **Al mostrarlo**, no se dibuja barra ni porcentaje. Una barra al 0% junto a un
  gasto real sugeriría "vas bien", que es lo contrario de lo que pasa: no hay
  con qué comparar. En su lugar se dice «Sin presupuesto este mes» —añadiendo
  «excepción de este mes» cuando el 0 fue deliberado para ese mes— y el gasto
  real se muestra aparte.
