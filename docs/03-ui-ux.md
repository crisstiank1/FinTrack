# FinTrack — UI / UX

> Diseño visual, tokens de color, categorías predeterminadas y pantallas.

---

## Temas

Dos preferencias de tema (M17):

- **Claro.**
- **Oscuro.**

El botón de tema alterna entre las dos. No hay opción «Sistema»: quien la tenía
guardada de antes pasa, una sola vez al cargar la app, al tema que su dispositivo
mostraba en ese momento, y esa elección queda guardada como claro u oscuro. Desde
ahí el tema ya no sigue al dispositivo.

La preferencia inicial es **claro** y se persiste inicialmente en `localStorage`. Después se sincronizará con el perfil en Supabase (`profiles.theme_preference`).

## Tema claro (predeterminado)

Estilo: blanco y rosa profesional, limpio, moderno, confiable y no infantil.

| Token                | Valor     |
| -------------------- | --------- |
| `--background`       | `#FFF8FB` |
| `--surface`          | `#FFFFFF` |
| `--surface-elevated` | `#FFF0F6` |
| `--foreground`       | `#2B1720` |
| `--muted-foreground` | `#765362` |
| `--border`           | `#F1D8E2` |
| `--primary`          | `#E83E8C` |
| `--primary-hover`    | `#C2185B` |
| `--primary-soft`     | `#F8BBD0` |
| `--success`          | `#16805B` |
| `--danger`           | `#C62848` |
| `--warning`          | `#B26B00` |

## Tema oscuro

Estilo: negro y morado profesional, alto contraste, especialmente para tablas, montos y gráficos.

| Token                | Valor                    |
| -------------------- | ------------------------ |
| `--background`       | `#0D0712`                |
| `--surface`          | `#17101F`                |
| `--surface-elevated` | `#22162D`                |
| `--foreground`       | `#FAF7FF`                |
| `--muted-foreground` | `#CBB8D9`                |
| `--border`           | `rgba(255,255,255,0.10)` |
| `--primary`          | `#A855F7`                |
| `--primary-hover`    | `#7E22CE`                |
| `--primary-soft`     | `#D8B4FE`                |
| `--success`          | `#4ADE80`                |
| `--danger`           | `#FB7185`                |
| `--warning`          | `#FBBF24`                |

## Reglas visuales

- Implementar los colores con **tokens CSS semánticos o variables CSS**. No hardcodear colores de tema en cada componente.
- Usar rosa/morado como identidad, no como único indicador de significado.
- Mostrar ingresos/valores positivos con texto, signo `+`, icono y color de éxito.
- Mostrar gastos/valores negativos con signo `−`, icono y color de peligro.
- Usar contraste adecuado en ambos temas.
- Tipografía: Inter o alternativa de sistema.
- Usar `tabular-nums` en cifras financieras cuando sea posible.
- Microanimaciones discretas y respeto a `prefers-reduced-motion`.
- Priorizar legibilidad de datos por encima de decoración.
- El Libro financiero debe tener alta densidad, pero seguir siendo legible.

---

## Monedas

FinTrack **no convierte divisas ni usa tipos de cambio.** Las reglas completas
—principios, catálogo, moneda de presentación, filtros, transferencias, Plan,
Presupuestos, ejemplos y limitaciones conocidas— están en
`docs/11-reglas-de-moneda.md`. Aquí queda solo lo que afecta a la presentación:

- **Todo importe se muestra con su código de moneda** (por ejemplo `USD 1.250`),
  incluido en ejes de gráficos y filas del Libro financiero.
- **Los totales solo suman cuentas de una misma moneda.** Cada pantalla elige su
  moneda de presentación: la principal del perfil si el usuario tiene alguna
  cuenta en ella; si no, la de la primera cuenta
  (`resolvePresentationCurrency`). Las cuentas en otras monedas aparecen aparte,
  en su propia moneda.
- **El Dashboard, el Plan y los Presupuestos esperan a conocer la moneda
  principal** antes de mostrar cifras, en vez de enseñarlas un instante en otra
  moneda.
- **Catálogo:** COP, USD y ARS para cuentas nuevas y para el onboarding; EUR y
  MXN solo se conservan al editar una cuenta que ya las tenga (D1 y D2).
- **Moneda principal del perfil:** COP, USD o ARS, con COP por defecto. Se elige
  durante el onboarding (D3) y en Ajustes desde M12.
- **Cambiar la moneda de una cuenta:** bloqueado si la cuenta ya tiene
  movimientos (D6); permitido sin movimientos.
- **Filtro por moneda (M3)**, **transferencias entre monedas (M4)**, **Plan y
  Presupuestos en una sola moneda (M5)**, **Hojas sin moneda propia (M7)** y
  **transferencias editables sin cambiar de moneda (M8)**: cada pantalla resume
  su parte más abajo; el detalle y los textos exactos, en el documento de
  reglas.
- **Limitaciones conocidas** (transferencias antiguas con el mismo importe en
  las dos patas, cambio de moneda de una cuenta con líneas de aporte, y las
  demás): listadas con su estado en el documento de reglas.

---

## Categorías predeterminadas

Durante onboarding, crear las categorías por usuario mediante una estrategia segura y repetible (con `is_system = true` según corresponda).

### Ingresos

- Salario.
- Bono.
- Ventas.
- Inversiones.
- Reembolsos.
- Regalos.
- Otros ingresos.

### Gastos esenciales

- Vivienda.
- Servicios públicos.
- Internet y telefonía.
- Mercado.
- Transporte.
- Salud.
- Educación.
- Seguros.
- Deudas y créditos.

### Gastos flexibles

- Restaurantes.
- Ocio.
- Suscripciones.
- Ropa.
- Gastos hormiga.
- Viajes.
- Mascotas.
- Regalos.
- Otros gastos.

> Nota: **no** crear “Ahorro” como gasto predeterminado. Ahorrar se modela como transferencia a una cuenta de ahorro.

---

## Rutas y pantallas

### Ayuda contextual (M18)

Cada pantalla principal lleva un botón «?» junto a su título, con una o dos
frases sobre para qué sirve. Es el componente compartido `PageTitle`
(`src/components/shared/page-title.tsx`), que usa `HelpHint`; los textos viven
juntos en `src/components/shared/page-help.ts`.

- Se abre al pasar el ratón, al llegar con el teclado y al tocarlo; un toque o un
  clic lo deja fijo hasta volver a tocarlo.
- Escape lo cierra y devuelve el foco al botón; tocar fuera también lo cierra.
- Es un `button` con `aria-expanded`, `aria-controls` y nombre «Ayuda: {pantalla}».
  El panel es una región con el nombre de la pantalla.
- No es modal ni atrapa el foco: con Tab se sale y se cierra.
- El panel se ancla a la fila del título y no al botón, para no salirse por la
  derecha en un teléfono. No se usa ninguna librería de tooltips ni popovers.

| Pantalla         | Texto                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dashboard        | Tu resumen del mes: saldo, ingresos, gastos y presupuestos. Registra movimientos desde el panel de la izquierda; el mes y la cuenta de arriba cambian las cifras y los gráficos. Los presupuestos se muestran en la moneda del Plan. |
| Cuentas          | Tus cuentas de efectivo, banco, ahorro e inversión, cada una en su moneda. El saldo parte del saldo inicial y suma los movimientos registrados.                                                                                      |
| Movimientos      | Registra y corrige ingresos, gastos y transferencias. Una transferencia mueve dinero entre tus cuentas: no cuenta como gasto ni como ingreso.                                                                                        |
| Libro financiero | Todo tu historial en una tabla, con filtros, búsqueda y exportación a CSV.                                                                                                                                                           |
| Hojas            | Borradores que puedes llenar con calma. No afectan tus cifras hasta que los registras como movimientos.                                                                                                                              |
| Presupuestos     | Cuánto quieres gastar por categoría en el mes y cuánto llevas. Puedes aplicar un presupuesto desde este mes en adelante o solo a este mes.                                                                                           |
| Plan mensual     | Planea tus ingresos y cómo repartirlos, y compáralo con lo que pasó. Las cifras reales se calculan solas desde tus movimientos.                                                                                                      |
| Ajustes          | Tu nombre, tu moneda principal y tus categorías.                                                                                                                                                                                     |

### Separación de superficies de movimientos

Cuatro rutas trabajan sobre movimientos y no se solapan:

| Ruta            | Propósito                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `/transactions` | Uso diario: crear, editar, duplicar y eliminar movimientos.                                        |
| `/ledger`       | Historial financiero: consulta, filtros, ordenamiento, exportación CSV, edición y saldo acumulado. |
| `/plan`         | Plan mensual: planificación del mes y comparación Presupuesto vs. Actual. Fase 8.7.                |
| `/sheets`       | Borradores estructurados: captura previa al registro. Fase 8.5.                                    |

Ninguna reemplaza a las otras. `/ledger` y `/plan` son ambas de consulta, pero
miran en direcciones opuestas: el Historial mira movimiento a movimiento hacia
atrás; el Plan mensual compara un mes entero contra lo que se había previsto.

### `/auth`

- Pantalla completa.
- Tarjeta centrada dividida en dos columnas en escritorio.
- La mitad izquierda muestra el **login activo por defecto**.
- “Continuar con Google” es la acción principal.
- Alternativa por email y contraseña.
- Enlace “¿Olvidaste tu contraseña?”.
- Opción “Crear cuenta”.
- Al activar registro, el formulario pasa visualmente a la mitad derecha.
- El panel inactivo presenta branding de FinTrack: logo, texto de valor y una pequeña visual financiera decorativa.
- En móvil: una sola columna con tabs o botones claros para cambiar entre login y registro.
- Requiere estados de loading, manejo de errores y accesibilidad.

### `/auth/callback`

- Procesa el retorno OAuth.
- Valida la sesión.
- Si el onboarding no está terminado → `/onboarding`.
- Si el onboarding está terminado → `/dashboard`.
- Si hay error o no existe sesión → `/auth` con mensaje claro.

### `/reset-password`

- Solicitud de restablecimiento de contraseña.
- Actualización de contraseña tras recuperar sesión.
- Validación y mensajes claros.

### `/onboarding`

Pasos:

1. Bienvenida y nombre.
2. Moneda principal, con COP por defecto.
3. Primera cuenta financiera.
4. Saldo inicial.
5. Creación de categorías predeterminadas.
6. Posibilidad de agregar otra cuenta.
7. Confirmación y redirección a `/dashboard`.

**Monedas en el onboarding (M2):** la moneda principal se elige entre COP,
USD y ARS, con COP por defecto (D3). Cada cuenta elige su propia moneda del
mismo catálogo, con la moneda principal preseleccionada (D4). Si una cuenta
queda en otra moneda que la principal, debajo de su selector se muestra:
«Esta cuenta no se sumará a tus totales en {principal}: su saldo aparecerá
aparte» (D5, sin banner). La confirmación muestra cada saldo en su moneda.

### `/dashboard`

**Saludo (M16).** El título es **«Hola, {nombre}»** con el nombre del perfil
(`profiles.display_name`), o **«Hola»** si no hay nombre o está en blanco;
mientras el nombre carga se muestra «Hola» y se completa al llegar. Debajo, la
descripción «Este es el resumen de tu mes: registra movimientos y revisa cómo van
tus cuentas y presupuestos.», y después el mes y la nota de moneda. El menú sigue
diciendo «Dashboard». El nombre se cambia en Ajustes.

**Cabecera (M14).** A la izquierda, el saludo con su «?», la descripción, el mes y
la nota de moneda; a la derecha, en fila, el selector de mes y el de cuenta. En
móvil los filtros bajan bajo el título. Los filtros van en la cabecera porque
afectan a toda la vista, y siguen en pantalla mientras cargan los movimientos, si
la consulta falla y si todavía no hay ninguno.

Desde M18 hay **un solo «?»**, junto al saludo, con la ayuda de la pantalla (ver
«Ayuda contextual»); la ayuda propia de los filtros se quitó.

**Disposición.** A partir de 1024px, dos columnas:

| Zona      | Qué lleva                                                                       |
| --------- | ------------------------------------------------------------------------------- |
| Izquierda | «Cargar movimiento» (340px)                                                     |
| Derecha   | Saldo consolidado, las cuatro cifras del mes, los dos gráficos y «Presupuestos» |

Los dos gráficos van uno al lado del otro solo desde 1280px; entre 1024 y 1279px
se apilan, porque la columna mide unos 620px y el donut con su leyenda no cabe en
la mitad. **Por debajo de 1024px todo va en una columna y el formulario no se
muestra en línea:** el alta vive en el botón flotante y su diálogo, que se
ocultan desde 1024px. Así la acción de registrar existe en todos los anchos,
tabletas incluidas.

**Cargar movimiento.** Alta directa, sin abrir ningún diálogo:

- Conmutador Gasto / Ingreso; al cambiarlo cambian las categorías ofrecidas.
- Cuenta (rótulo «Cuenta»; se anuncia «Cuenta del movimiento» para no confundirse
  con el filtro de la cabecera). Arranca en la primera cuenta activa de la moneda
  de la vista y **no cambia sola** si después se cambia el filtro: moverla bajo
  una edición en curso sería peor.
- **Monto (COP)**, **Monto (USD)** o **Monto (ARS)**, según la cuenta. El campo
  lleva un **«$» fijo** fuera del valor —no se puede borrar ni llega al importe
  guardado— y empieza vacío, con `0` solo de marcador. Como el «$» es el mismo en
  las tres monedas, la moneda la dicen la etiqueta y la línea de debajo: «Se
  registrará en COP» sin importe y «Se registrará como USD 40» con él. **Nunca
  «Equivale a»:** FinTrack no convierte divisas. Cambiar de cuenta entre monedas
  no toca el número escrito. **No hay selector de moneda.**
- Categorías como chips: hasta ocho y el resto tras «Más…». Primero las más
  usadas en el mes en pantalla; las demás, y todas cuando el mes no tiene
  movimientos, en orden alfabético. La elegida se ve siempre.
- Fecha, con hoy por defecto.
- **Nota (opcional)**, que se guarda como descripción; si queda vacía, se guarda
  el nombre de la categoría.
- «Agregar» guarda con el mismo esquema y la misma mutación que `/transactions`.
  Después se vacían importe, categoría y nota, y se conservan tipo, cuenta y
  fecha. Si falla, lo escrito se conserva para reintentar.

**Presupuestos.** Una rejilla con **solo las categorías que tienen presupuesto en
el mes, incluido un presupuesto explícito de 0** (que se muestra como «Presupuesto
en COP 0», sin barra). Las demás no ocupan tarjeta. Cada celda muestra nombre,
barra o estado, lo gastado y lo presupuestado, con los textos de siempre
(«Quedan…», «Excedido por…»), y la marca «Archivada» si su categoría se archivó.

La cabecera del panel dice su alcance: «septiembre 2026 · en COP · no cambia con
el filtro de cuenta». Sin presupuestos, el panel muestra un estado vacío con el
botón «Agregar presupuesto».

- **Editar:** el lápiz de cada celda abre `BudgetForm` en un diálogo, con el
  importe vigente ya escrito (un 0 explícito abre con 0) y la elección entre
  «Desde este mes en adelante» y «Solo este mes»; en un mes cerrado, solo la
  segunda.
- **Agregar presupuesto** abre un diálogo en pasos: elegir una categoría de gasto
  activa sin presupuesto en el mes, **o** «Crear categoría de gasto», que usa el
  formulario de categorías de Ajustes con el tipo fijado en Gasto (sin selector
  de tipo). La categoría recién creada queda elegida y el paso siguiente es su
  presupuesto, con `BudgetForm`.
- Los diálogos de presupuesto del dashboard muestran el mismo «$» fijo en el
  monto; `/budgets` conserva su campo de siempre.
- Una categoría creada desde aquí **no tiene clasificación**: en `/plan` su gasto
  aparece en «Sin clasificar» y no entra en ningún grupo del reparto hasta
  clasificarla en Ajustes.

**Movimientos.** El dashboard **ya no lista movimientos** (M14): ni últimos
movimientos ni edición desde aquí. La consulta, la edición y la eliminación viven
en `/transactions`.

- KPIs:
  - Saldo total.
  - Ingresos del mes.
  - Gastos del mes.
  - Ahorro neto.
  - Tasa de ahorro.
- Comparación con el mes anterior.
- Gráfico de ingresos versus gastos.
- Gráfico de gasto por categoría.
- Tendencia de saldo.
- Estados de carga, error y vacío.
- Información consistente con `transactions`.

**Moneda (ver «Monedas» y `docs/11-reglas-de-moneda.md`):** las cifras van en la
moneda de presentación, con los saldos de otras monedas aparte y la nota
«Cifras en COP. Tus cuentas en USD y ARS no se suman: su saldo aparece aparte,
sin convertir.».
Al elegir una cuenta, todo pasa a la moneda de esa cuenta y desaparecen la nota
y los saldos aparte. El panel «Presupuestos» es la excepción: sus barras y
alertas siguen en la moneda de los presupuestos, aunque la alerta global de
ahorro neto negativo va en la moneda de la vista (M5). Ese panel tampoco sigue
al filtro de cuenta, y desde M14 lo dice en su cabecera: «septiembre 2026 · en
COP · no cambia con el filtro de cuenta».

### `/transactions`

- Lista amigable para uso diario.
- Crear, editar, duplicar y eliminar movimientos.
- Filtros básicos.
- Acepta `?month=YYYY-MM`. Sin parámetro, o con uno inválido, abre el mes
  actual; `?month=` vacío muestra todos los meses. Moneda, cuenta y tipo no van
  en la URL.
- Filtro por moneda (M3, ver «Monedas»): con una moneda elegida, el selector de
  cuenta solo muestra cuentas en ella, y elegir otra moneda limpia una cuenta
  que no le corresponde.
- Formulario validado con Zod.
- Transferencias entre cuentas, también entre monedas distintas (M4, ver
  «Monedas»): dos líneas, una por cuenta, cada una con su importe, su moneda y
  su contraparte.
- Editar una transferencia (M8, ver «Monedas»): el botón abre las dos patas en
  un mismo formulario —cuentas, importes, fecha y descripción— y las guarda
  juntas. Cada cuenta solo puede cambiarse por otra de su misma moneda, y al
  cambiar importes o cuentas se avisa de que los saldos se ajustan. El botón
  solo aparece cuando se conoce la otra pata.
- Confirmación de eliminación.
- Estados de carga y vacío.

### `/ledger`

**Historial financiero.** Basado en `transactions` (sin tabla independiente).
Su propósito es consulta, filtros, ordenamiento, exportación CSV, edición de
movimientos y saldo acumulado. **No es una superficie de captura de
borradores**: esa es `/sheets`.

**Columnas MVP:**

- Fecha.
- Descripción.
- Cuenta.
- Categoría.
- Tipo.
- Monto.
- Saldo acumulado.
- Acciones.

**Funciones MVP:**

- TanStack Table.
- Ordenamiento.
- Búsqueda por descripción.
- Filtros por periodo, moneda, cuenta, categoría y tipo.
  - Moneda (M3, ver «Monedas»): acota la tabla, las tarjetas, el resumen, la
    paginación y el CSV. El selector de cuenta solo muestra cuentas de la
    moneda elegida, elegir otra moneda limpia una cuenta que no le corresponde,
    y «Limpiar filtros» también la quita.
- Paginación server-side.
- Cabecera sticky.
- Selector de columnas: se cierra con Escape, devolviendo el foco al botón, y al
  tocar fuera. En pantalla estrecha el panel se ancla a la izquierda del botón y
  se limita al ancho disponible, para no salirse por el borde (M9).
- Resumen de ingresos, gastos, balance y cantidad de movimientos. Con varias
  monedas, una línea por moneda; filtrando una moneda sin movimientos, los
  ceros se muestran en esa moneda.
- Saldo acumulado solo cuando todas las cuentas del alcance comparten moneda:
  filtrando por una moneda o por una cuenta. Si no, se explica «Filtra por una
  moneda o una cuenta para verlo».
- Transferencias (M4, ver «Monedas»): cada pata es una fila con su importe y su
  moneda; la descripción, en la tabla y en las tarjetas, añade la contraparte.
  Editar una de sus filas abre la transferencia entera (M8), en la tabla y en
  las tarjetas por igual.
- Exportar CSV respetando filtros. Las transferencias no llevan columnas de
  contraparte: cada fila trae su «Moneda» y el «Grupo de transferencia» basta
  para emparejarlas. En una transferencia entre monedas, sumar «Monto» sobre la
  pareja ya no da cero: cada fila va en su moneda.
- Modal de edición: el de movimientos, o el de la transferencia completa si la
  fila es una de sus patas (M8).
- En móvil: tarjetas o scroll horizontal controlado y usable.

**No incluir todavía:**

- Edición inline.
- Fórmulas.
- Copiar/pegar desde Excel.
- Acciones masivas.
- Columnas personalizadas.
- Vistas guardadas.

### `/budgets`

Ruta existente. Presupuesto mensual por categoría, progreso y alertas.
Acepta `?month=YYYY-MM`. Modelo y reglas: `docs/06-presupuestos.md`.

Importes y gastado en la moneda de presentación (M5, ver «Monedas»). Si hay
gastos del mes en otras monedas, un aviso encima de la lista dice cuántos y en
qué monedas no cuentan.

La lista pone primero las categorías con dinero asignado en el mes, después las
de presupuesto en 0 y al final las que no tienen presupuesto; dentro de cada
grupo, el orden de siempre (ver `docs/06-presupuestos.md`).

### `/sheets`

**Hojas de cálculo.** Captura estructurada de borradores persistidos: rejilla de
fila única por borrador, con las columnas comunes de movimientos (fecha,
descripción, cuenta, tipo, categoría, monto, notas) y las columnas propias de
texto de la hoja activa.

**Borradores en la parte superior.** El usuario elige una hoja, ve su lista de
borradores y añade filas. Cada fila se edita en la celda (select para cuenta,
tipo y categoría; input para el resto) y **se autoguarda al salir de la celda**:
no hay botón de guardado por fila.

**Nada se registra al editar.** El borde verde de validación y los textos de
error por celda son un _oráculo_ de lo que aceptará `register_sheet_draft`: la
validación de cada fila repite las reglas de la RPC (fechas ISO, montos enteros
y positivos, categoría acorde al tipo, sin transferencias). Solo las filas
válidas se ofrecen al registro.

**Registro explícito.** Al pulsar «Registrar» se abre una confirmación que
resume cuántos movimientos se crearán y cuántos borradores incompletos
permanecerán (los textos acordados en `docs/07-hojas.md`, «Confirmar el
registro en la interfaz»). Tras registrar, un diálogo resume el resultado y
lleva a «Ver movimientos» (el Libro filtrado) o a seguir en la hoja. El plan
mensual, presupuestos y dashboard se actualizan porque el registro crea
movimientos reales en `transactions`.

**No reemplaza `/transactions` ni `/ledger`.** Un borrador no registrado no
aparece en ninguna de las dos, ni afecta saldos, dashboard o presupuestos.
Desde la hoja **no se editan ni eliminan movimientos ya registrados**.

**Moneda (M7, ver «Monedas»):** cada fila lleva la moneda de la cuenta que tenga
escrita y una misma hoja puede mezclar monedas; una fila todavía sin cuenta
muestra su importe **sin código de moneda**, y cambiar de cuenta no convierte el
importe, solo cambia el código que lo precede.

**No incluir:**

- Fórmulas y columnas calculadas.
- Importación CSV: es la Fase 10 y opera sobre `transactions`.
- Acciones masivas.
- Reordenamiento de filas.
- Totales dentro de la rejilla y conversión de divisas.

Modelo y reglas: `docs/07-hojas.md`.

### `/plan`

**Plan mensual.** Planificación del mes y comparación Presupuesto vs. Actual.
El usuario define planes; los valores reales se calculan desde `transactions` y
**no son editables en ningún punto de la pantalla**.

Es una pantalla de lectura, análisis y configuración de la planificación. **No
es un medio para pagar:** no inicia ni ejecuta ningún movimiento de dinero.

**Bloques, en orden:**

- Vista general: selector de mes y Resumen del mes (seis tarjetas).
- Ingresos planeados.
- Reparto 50/30/20.
- Reconciliación del presupuesto.
- Facturas y gastos variables.
- Ahorro e inversión: aportes del mes, aportes planeados y saldo en cuentas al
  cierre del mes.
- Cuadro Presupuesto vs. Actual.

La deuda no tiene bloque de planificación propio: se planifica como cualquier
categoría de gasto, desde `/budgets`, y aparece como grupo del reparto y como
fila del cuadro Presupuesto vs. Actual.

**Moneda (M5, ver «Monedas»):** todo el Plan va en la moneda de presentación,
que se muestra junto al mes. Si hay movimientos del mes en otras monedas, un
aviso encima de todo dice cuántos y en qué monedas no se incluyen, también en un
mes sin nada que comparar. En «Ahorro e inversión» el saldo suma solo cuentas en
esa moneda y dice cuántas quedan fuera; el formulario de aportes solo ofrece
cuentas en esa moneda, y una línea sobre una cuenta en otra se marca «Cuenta en
USD: su aporte real no se cuenta».

**Reglas de presentación:**

- Distinguir siempre «Planeado» de «Actual»; nunca presentarlos como una sola
  columna.
- La diferencia favorable o desfavorable se dice **en texto**. El color solo
  acompaña, nunca es el único portador de la información.
- Tres estados, siempre distintos: sin presupuesto → «Sin presupuesto»;
  presupuesto explícito de 0 → «Presupuesto en COP 0»; positivo → su importe.
  Los aportes a ahorro e inversión sin línea dicen «Sin aportes planeados».
- Una fila agregada cuyo presupuesto es todo 0 se muestra «Sin presupuesto».
- «Por asignar» compara planes, no dinero disponible. La nota que lo aclara es
  fija, no un tooltip.
- En el cuadro Presupuesto vs. Actual, distinguir visualmente las filas que
  **descomponen** Gastos totales (Facturas, Gastos variables, No planeado) de
  las que son **indicadores aparte** (Ahorro, Inversión, Deuda). Solo las
  primeras suman.
- La suma de los grupos del reparto **no** tiene que coincidir con Gastos
  totales, porque ahorro e inversión son transferencias registradas y no
  gastos. Los dos bloques van visualmente separados y la pantalla lo explica.
- Aportes del mes y saldo en cuentas nunca comparten nombre; nunca «Total
  ahorrado», «Ahorrado» ni «Dinero disponible».
- Los aportes planeados se crean, editan y borran **solo** desde su tarjeta de
  «Ahorro e inversión» («Añadir aporte a ahorro» / «Añadir aporte a
  inversión»), nunca desde «Facturas y gastos variables»: no son gasto. Cada
  fila dice «{nombre} · {cuenta} · COP X», con «Archivada» si su cuenta se
  archivó después. Sin plan del mes no hay lista ni botones.
- Sin cuentas activas del tipo, en lugar del botón se dice «Necesitas una cuenta
  de ahorro para planificar un aporte.» con enlace a Cuentas; si las que hay
  están todas en otra moneda, la frase nombra la del Plan —«Necesitas una cuenta
  de ahorro en COP para planificar un aporte.» (M10)—, porque a quien ya tiene
  una cuenta de ahorro la frase general le suena a error; con todas ya ocupadas
  este mes, «Todas tus cuentas de ahorro ya tienen un aporte planeado este mes.».
- La reconciliación del presupuesto es plegable y nace plegada, con su titular
  visible; los demás bloques se muestran abiertos.
- Compatible con ambos temas.

**No incluir en el primer release:**

- Editar cualquier valor «Actual».
- Copiar el plan de un mes a otro.
- Reordenar líneas.
- Corregir automáticamente meses cerrados.
- Seguimiento de gastos, de solo lectura, con enlace a `/transactions` o
  `/ledger` para editar el movimiento real.
- Metas y aportes a metas: dependen de `goals`, que es Fase 9.
- Importación CSV.
- Cualquier indicador, bloque o acción relativo a tarjetas: pagos, cupos,
  intereses, fechas de corte o pagos mínimos.

Modelo, fórmulas y reglas: `docs/09-plan-mensual.md`.

### `/accounts`

- Crear cuentas.
- Editar cuentas.
- Archivar cuentas.
- Listar saldos.
- No eliminar cuentas con movimientos.

**Moneda de las cuentas (M2):** al crear se ofrecen COP, USD y ARS, con sus
etiquetas completas («Peso colombiano (COP)», «Dólar estadounidense (USD)»,
«Peso argentino (ARS)»). EUR y MXN son solo lectura: se siguen formateando y,
al editar una cuenta que ya está en esas monedas, aparecen como opción heredada
para poder guardar sin perder la moneda (D1); no se ofrecen para cuentas
nuevas. Cambiar la moneda de una cuenta existente está bloqueado si la cuenta
ya tiene movimientos, con el texto «La moneda no se puede cambiar porque la
cuenta ya tiene movimientos» (D6). Sin movimientos, el cambio se permite. No se
comprueba si la cuenta tiene líneas de aporte en el Plan (limitación que queda;
el Plan las marca, ver «Monedas»).

### `/settings`

**Implementado hoy:** el nombre del perfil (M16), categorías y clasificación de
gastos, y el cambio de la moneda principal del perfil (M12). El tema y el cierre
de sesión viven en la cabecera, no en esta pantalla.

**Previsto, sin implementar:** zona horaria.

**Perfil (M16):** primera sección de la pantalla. Campo «Nombre» con el nombre
actual y botón «Guardar»; solo escribe `profiles.display_name`. Usa la misma regla
que el onboarding —entre 1 y 60 caracteres, «Ingresa tu nombre» / «Máximo 60
caracteres»— y avisa con «Nombre actualizado» o «No se pudo guardar el nombre».
Mientras el perfil carga no se muestra el campo, para no invitar a guardar un
nombre vacío encima del real.

- Dejar documentadas, pero **no implementar sin aprobación**:
  - Exportación completa de datos.
  - Eliminación de cuenta.

**Moneda principal (M12):** el selector ofrece solo COP, USD y ARS, igual que el
onboarding. Cambiar de moneda pide confirmación: si hay cuentas en la moneda
actual, el diálogo avisa de cuántas conservarán su moneda (ninguna se migra;
solo cambia `profiles.currency_code`). Reglas completas en
`docs/11-reglas-de-moneda.md`.

---

## Navegación

En escritorio se muestran los ocho destinos en fila, sin agrupar.

En pantallas medianas hay cuatro ranuras principales (Dashboard, Movimientos,
Presupuestos y Plan), y las cuatro secundarias viven en «Más», que abre un panel
con sus etiquetas completas. En móviles, las ocho entran en «Menú». Ningún
acceso desaparece.

| Ranura      | Contenido                                                                          |
| ----------- | ---------------------------------------------------------------------------------- |
| Resumen     | `/dashboard`                                                                       |
| Plan        | `/plan`                                                                            |
| Movimientos | `/transactions`                                                                    |
| Más         | `/accounts` (Cuentas), `/ledger` (Libro), `/sheets` (Hojas), `/settings` (Ajustes) |

Los nombres visibles son «Dashboard», «Cuentas», «Movimientos», «Libro»,
«Hojas», «Presupuestos», «Plan mensual» y «Ajustes». En la barra móvil se
abrevian a una palabra; en los encabezados de cada pantalla se escriben
completos.
