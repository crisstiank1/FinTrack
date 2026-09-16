# FinTrack — Reglas de moneda

Referencia canónica de cómo FinTrack trata las monedas. Lo que aquí se afirma es
lo que el sistema hace hoy, con la función que lo implementa entre paréntesis
para que cada regla se pueda comprobar.

Las fases de moneda se numeran **M1 a M6** y ya están publicadas. **M7** define
el modelo de moneda de las Hojas (`/sheets`), que todavía no tienen interfaz, y
**M8** hace editables las transferencias sin que ninguna pata cambie de moneda. En
`docs/09-plan-mensual.md` y `docs/10-pruebas-plan.md` los nombres «Migración 1,
2 y 3» se refieren a las migraciones del Plan mensual, que son otra cosa.

Dónde vive el resto: el modelo de datos en `docs/02-base-de-datos.md`, los
textos y el comportamiento de cada pantalla en `docs/03-ui-ux.md`, las fórmulas
del Plan en `docs/09-plan-mensual.md` y el gasto presupuestable en
`docs/06-presupuestos.md`.

---

## 1. Principios

1. **No hay conversión de divisas ni tipos de cambio.** Ningún importe se
   convierte, en ninguna pantalla y en ningún cálculo. Es una decisión de
   producto, no una limitación técnica pendiente.
2. **Un total solo suma cuentas de una misma moneda.** Cuando hay varias, o se
   muestran por separado, o se elige una y se dice qué queda fuera.
3. **`transactions` no guarda moneda propia.** La moneda de un movimiento es la
   `currency_code` de su cuenta (`accounts`). Por eso «filtrar por moneda» es
   siempre «filtrar por las cuentas de esa moneda».
4. **Todo importe se muestra con su código de moneda**, por ejemplo `USD 1.250`,
   también en ejes de gráficos y filas del Libro.
5. **El formato numérico es siempre `es-CO`**, sin decimales; lo único que
   cambia entre monedas es el código que precede a la cifra
   (`formatAmount`, `src/lib/currency.ts`).
6. **Los importes se guardan en unidades mínimas enteras** y FinTrack los trata
   con exponente 0: `COP 15.000` y `USD 15.000` se guardan como `15000`.

---

## 2. Catálogo y moneda principal

- **Seleccionables:** COP, USD y ARS. Son las que se ofrecen al crear una cuenta
  y durante el onboarding (`SELECTABLE_CURRENCY_CODES`).
- **Heredadas:** EUR y MXN. Se siguen formateando y aparecen como opción al
  editar una cuenta que ya las tiene, para poder guardarla sin perder su moneda;
  no se ofrecen para cuentas nuevas (`currencyOptions`).
- **Moneda principal del perfil** (`profiles.currency_code`): COP, USD o ARS,
  con COP por defecto. Se elige en el onboarding y, desde M12, también se puede
  cambiar desde Ajustes (ver «Ajustes»).
- **Moneda de cada cuenta** (`accounts.currency_code`): se elige al crearla, con
  la principal preseleccionada. Cambiarla después está bloqueado si la cuenta ya
  tiene movimientos; sin movimientos, se permite.

---

## 3. Moneda de presentación

Es la moneda en la que una pantalla muestra sus cifras agregadas
(`resolvePresentationCurrency`, `src/lib/currency.ts`):

1. la **moneda principal** del perfil, si el usuario tiene alguna cuenta en ella;
2. si no, la moneda de la **primera cuenta** (activas primero, luego por fecha de
   creación);
3. sin cuentas, la moneda principal y, como último recurso, `COP`.

**Antes de mostrar cifras se espera a que llegue la moneda principal.** El
Dashboard, el Plan y los Presupuestos muestran su estado de carga hasta
entonces, en vez de enseñar un instante cifras con la moneda equivocada.

Cuando hay varias monedas a la vista, se ordenan con la principal primero y
luego COP, USD, ARS, EUR, MXN (`sortCurrencyCodes`).

---

## 4. Pantalla por pantalla

### Dashboard

- Las cifras van en la moneda de presentación. Debajo del saldo se lee «Otras
  monedas: USD 1.395 · ARS 0», y una nota explica: «Cifras en COP. Tus cuentas en
  USD y ARS no se suman: su saldo aparece aparte, sin convertir.»
- **Al elegir una cuenta en el selector, todas las cifras pasan a la moneda de
  esa cuenta** y desaparecen tanto la nota como los saldos aparte.
- Las transferencias no entran en «Ingresos del mes», «Gastos del mes», «Ahorro
  neto» ni «Tasa de ahorro».
- El panel «Presupuestos» es la excepción al selector de cuenta: sus barras y
  alertas van siempre en la moneda de los presupuestos. La alerta global
  («Gastaste … más de lo que ingresaste») sí sigue la moneda de la vista.

### Movimientos y Libro financiero

- **Cada fila se muestra en la moneda de su cuenta.** Una cuenta que ya no
  existe cae en la moneda de presentación.
- **Selector «Moneda»** (M3): ofrece «Todas las monedas» y solo las monedas que
  el usuario tiene en sus cuentas, archivadas incluidas y con EUR o MXN si las
  hay. Se oculta con una sola moneda. Es estado local: no va en la URL
  (`resolveCurrencyFilter`).
- Elegir una moneda **acota el selector de cuenta** a las cuentas de esa moneda y
  limpia una cuenta que no le corresponda. Si la moneda elegida se queda sin
  cuentas, se vuelve a «Todas».
- El **resumen del Libro** muestra una línea por moneda en Ingresos, Gastos y
  Balance. Filtrando una moneda sin movimientos, los ceros salen en esa moneda.
- El **saldo acumulado** solo se calcula cuando todas las cuentas del alcance
  comparten moneda, es decir, filtrando por una moneda o por una cuenta. Si no,
  la columna muestra «—» y se explica: «El saldo acumulado solo se calcula con
  cuentas de una misma moneda. Filtra por una moneda o una cuenta para verlo.»
- El **CSV** exporta cada fila con su importe y su columna «Moneda». No hay
  columnas de contraparte: el «Grupo de transferencia» basta para emparejar.

### Cuentas y onboarding

- Cada cuenta muestra su saldo en su propia moneda; nunca se suman entre sí.
- En el onboarding, si una cuenta queda en otra moneda que la principal, debajo
  de su selector se lee: «Esta cuenta no se sumará a tus totales en {principal}:
  su saldo aparecerá aparte».

### Ajustes

Ajustes permite cambiar la moneda principal (M12), además de gestionar
categorías y su clasificación:

- **Solo COP, USD y ARS.** Las mismas opciones que en el onboarding
  (`SELECTABLE_CURRENCY_CODES`). EUR y MXN son solo lectura y no se ofrecen.
- **No migra cuentas.** Se escribe únicamente `profiles.currency_code`; cada
  cuenta conserva su moneda y sus totales aparecen en ella, como en el resto de
  la app (`resolvePresentationCurrency`).
- **Advertencia antes de confirmar.** Si hay cuentas en la moneda actual, el
  diálogo de confirmación lo dice con el número de cuentas que conservarán su
  moneda. Sin cuentas en ella, la advertencia desaparece y solo confirma el
  cambio de la moneda de los totales.

### Hojas (M7)

`/sheets` no tiene interfaz todavía; estas son las reglas con las que se
construirá. Modelo completo en `docs/07-hojas.md`.

- **Una hoja no tiene moneda propia.** Cada fila lleva la de la cuenta escrita
  en su celda `account_id`, igual que en Movimientos y en el Libro.
- **Una misma hoja puede mezclar monedas.** Una hoja es captura, no agregado: no
  suma nada, así que mezclarlas no descuadra ninguna cifra.
  `register_sheet_draft` no valida la moneda y no tiene ningún código de error
  para ella.
- **Una fila sin cuenta muestra su importe sin código de moneda.** Es el único
  lugar de la app donde un importe aparece sin código, y es deliberado: todavía
  no hay moneda que mostrar. Enseñar la principal o la de presentación afirmaría
  algo que puede resultar falso en cuanto el usuario elija cuenta.
- **Cambiar la cuenta de un borrador no convierte el importe.** `15000` sigue
  siendo `15000` y solo cambia el código que lo precede. No se bloquea ni se
  pide confirmación.
- **La hoja no muestra totales.** Si se añadieran, sería una línea por moneda,
  nunca un total consolidado.
- **Registrar no plantea ninguna pregunta de moneda:** la fila pasa a
  `transactions` y desde ahí rigen las reglas de cada pantalla, incluida la
  exclusión del Plan y de los presupuestos si la cuenta está en otra moneda.
- **No hay puente entre las Hojas y el Plan**, ni de importación ni de
  exportación. Lo único que las conecta es `transactions`, y solo después de
  registrar.

---

## 5. Transferencias

- Una transferencia son **dos movimientos**, uno por cuenta, unidos por
  `transfer_group_id`. **Cada pata guarda su propio importe, en la moneda de su
  cuenta** (M4).
- **Misma moneda:** el formulario pide un solo «Monto» y las dos patas llevan el
  mismo importe. Un monto recibido distinto se rechaza; una comisión se registra
  como gasto aparte.
- **Monedas distintas:** pide «Monto enviado (COP)» y, obligatorio, «Monto
  recibido (USD)», con la nota «FinTrack no convierte divisas: registra cuánto
  salió y cuánto entró». El texto «Equivale a» usa la moneda de cada cuenta.
- Cada pata muestra su **contraparte**: `→ Cuenta USD · + USD 25` en la que sale
  y `← Ahorros · − COP 100.000` en la que entra. Es información de la fila, no
  una fila más: el conteo, la paginación y el orden no cambian.
- **Duplicar** una transferencia conserva el importe de cada pata y la fecha de
  hoy. **Eliminar** borra las dos.
- **Editar (M8):** el botón abre la transferencia entera —las dos cuentas, los
  dos importes, la fecha y la descripción— y guarda las dos patas juntas, en una
  sola escritura. Con la misma moneda se sigue pidiendo un solo monto; con
  monedas distintas, uno por pata.
- **Editar no cambia la moneda de ninguna pata.** Cada selector ofrece solo
  cuentas de la moneda que esa pata ya tiene: mover una pata a otra moneda
  convertiría su importe sin tocar la cifra, que es justo lo que FinTrack no
  hace. Para cambiar de moneda se elimina la transferencia y se vuelve a crear.
- Al cambiar importes o cuentas, el formulario avisa: «Al guardar se actualizan
  las dos patas y cambian los saldos de las cuentas implicadas.» Cambiar solo la
  fecha o la descripción no mueve dinero y no lo muestra.
- El botón de editar **solo aparece cuando se conoce la otra pata**. Un grupo que
  no tenga dos patas opuestas no se edita: escribir sobre él lo dejaría peor.
- Una transferencia entre monedas distintas **no conserva el saldo consolidado**
  de cada moneda por separado: sale de una y entra en la otra, sin convertir.

---

## 6. Plan mensual y Presupuestos

- **Una sola moneda, la de presentación.** Ni `budgets` ni las tablas del Plan
  guardan moneda: sus importes se entienden en ella.
- **Solo cuentan los movimientos de cuentas en esa moneda.** El recorte se hace
  una vez, antes de cualquier cifra (`scopePlanMonthToCurrency`), para que
  ingresos, gastos, líneas, reparto, aportes y Restante no puedan descuadrarse.
- Un movimiento cuya **cuenta no se conoce** se queda dentro, en la moneda de la
  pantalla, igual que en el Libro.
- **No hay desglose por moneda.** Lo excluido se cuenta y se avisa:
  - en el Plan, encima de todo: «3 movimientos en otras monedas (USD, ARS) no se
    incluyen en este Plan.», y en singular «1 movimiento en otra moneda (USD) no
    se incluye en este Plan.»;
  - en `/budgets`, encima de la lista: «2 gastos en otras monedas (USD) no
    cuentan para estos presupuestos.», y en singular «1 gasto en otra moneda
    (USD) no cuenta para estos presupuestos.»
  - Cuentan ingresos, gastos y aportes excluidos, uno por transferencia. Las
    demás transferencias no, porque el Plan nunca las usa.
- **Aportes a ahorro e inversión:** cuentan **solo si la cuenta de destino está
  en la moneda del Plan**, con el importe de la pata entrante. La moneda de
  origen no importa.
- **Saldos en cuentas de ahorro o inversión:** suman solo las cuentas en esa
  moneda y dicen cuántas quedan fuera («1 cuenta en otra moneda no se suma»). Si
  todas están en otra moneda, se muestra esa nota en vez de «Sin cuentas».
- **Líneas de aporte:** el formulario ofrece solo cuentas en la moneda del Plan.
  Si no queda ninguna cuenta del tipo en esa moneda pero sí en otra, el bloque lo
  dice nombrándola: «Necesitas una cuenta de ahorro en COP para planificar un
  aporte.» (M10).
  Una línea que ya exista sobre una cuenta en otra moneda **se marca** («Cuenta
  en USD: su aporte real no se cuenta») y **su importe planeado sigue contando**,
  porque es una cifra escrita en la moneda del Plan.

Con una sola moneda, el Plan y los Presupuestos se comportan igual que antes de
M5: sin avisos, sin marcas y con las mismas cifras.

---

## 7. Tres ejemplos

### Una sola moneda

El usuario tiene tres cuentas, todas en COP. No aparece el selector de moneda en
Movimientos ni en el Libro, no hay avisos en el Plan ni en Presupuestos, y
ninguna cifra cambia respecto a un FinTrack sin monedas múltiples.

### COP y USD en el Plan

Moneda principal COP. En septiembre hay un salario de COP 3.000.000, un gasto de
COP 800.000, un ingreso de USD 500 y un gasto de USD 120.

| Pantalla | Qué muestra |
| --- | --- |
| Plan · Ingreso total | COP 3.000.000 |
| Plan · Total gastado | COP 800.000 |
| Plan · aviso | «2 movimientos en otras monedas (USD) no se incluyen en este Plan.» |
| Libro con «Todas» | Ingresos «COP 3.000.000 / USD 500», Gastos «COP 800.000 / USD 120» |
| Libro filtrando USD | Solo las dos filas en USD, con su resumen en USD |

Los USD no desaparecen: se ven en el Libro, en Movimientos y en el saldo aparte
del Dashboard. Lo que no ocurre es que se sumen a las cifras en COP.

### Aportes entre monedas

Moneda del Plan, COP.

| Transferencia | ¿Cuenta como aporte? | Por qué |
| --- | --- | --- |
| USD 120 desde una cuenta USD → COP 480.000 a una cuenta de ahorro COP | **Sí**, COP 480.000 | La pata entrante ya está en la moneda del Plan |
| COP 50.000 desde una cuenta COP → USD 12 a una cuenta de ahorro USD | **No** | El destino está en otra moneda; suma 1 al aviso de movimientos excluidos |

---

## 8. Limitaciones conocidas

Cada una con su estado. Ninguna tiene fecha comprometida.

| Limitación | Alcance | Estado |
| --- | --- | --- |
| Cambiar la moneda de una cuenta no comprueba si tiene líneas de aporte en el Plan | `/accounts` | Abierta. Desde M5 el Plan marca esas líneas y no deja crear aportes sobre cuentas en otra moneda |
| Las transferencias entre monedas creadas antes de M4 pueden tener el mismo importe en las dos patas | Datos existentes | Abierta. Se corrige a mano: eliminar la transferencia y volver a crearla |
| Editar una transferencia no puede cambiar la moneda de ninguna pata | `/transactions`, `/ledger` | Por diseño (M8): para cambiar de moneda se elimina y se vuelve a crear |
| Una fila de hoja sin cuenta muestra su importe sin código de moneda | `/sheets`, sin implementar | Por diseño (M7): hasta que la fila tenga cuenta no hay moneda que mostrar. Reglas en `docs/07-hojas.md` |
| El Plan y los presupuestos guardan importes sin moneda persistida | `budgets`, tablas del Plan | Consecuencia aceptada del modelo: si la moneda de presentación cambiara, esos importes se leerían en la nueva |

### Resueltas

| Limitación | Alcance | Estado |
| --- | --- | --- |
| `fetchTransactions` no pagina: un mes con más de 1000 movimientos truncaba las cifras del Plan y de Presupuestos sin avisar | `/plan`, `/budgets`, `/transactions` | **Resuelta en M11**. La lectura pagina por dentro en ventanas de 1000 (`range` de PostgREST) hasta agotar el conjunto y aborta si una página falla; un mes con más de 1000 movimientos llega entero a las cifras |
| La moneda principal se elegía solo en el onboarding y no se podía cambiar desde Ajustes | `/settings` | **Resuelta en M12**. Se cambia desde Ajustes, solo entre COP, USD y ARS, con confirmación explícita y aviso de las cuentas que conservan su moneda; no migra cuentas |
