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

`buildBudgetProgressList` recibe la lista de categorías a evaluar en vez de
deducirla, precisamente para que quien llama decida si incluir las archivadas
(necesario al consultar meses pasados) o solo las activas.
