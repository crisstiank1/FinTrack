# FinTrack — UI / UX

> Diseño visual, tokens de color, categorías predeterminadas y pantallas.

---

## Temas

Tres preferencias de tema:

- **Claro.**
- **Oscuro.**
- **Sistema.**

La preferencia inicial es **claro** y se persiste inicialmente en `localStorage`. Después se sincronizará con el perfil en Supabase (`profiles.theme_preference`).

## Tema claro (predeterminado)

Estilo: blanco y rosa profesional, limpio, moderno, confiable y no infantil.

| Token | Valor |
| --- | --- |
| `--background` | `#FFF8FB` |
| `--surface` | `#FFFFFF` |
| `--surface-elevated` | `#FFF0F6` |
| `--foreground` | `#2B1720` |
| `--muted-foreground` | `#765362` |
| `--border` | `#F1D8E2` |
| `--primary` | `#E83E8C` |
| `--primary-hover` | `#C2185B` |
| `--primary-soft` | `#F8BBD0` |
| `--success` | `#16805B` |
| `--danger` | `#C62848` |
| `--warning` | `#B26B00` |

## Tema oscuro

Estilo: negro y morado profesional, alto contraste, especialmente para tablas, montos y gráficos.

| Token | Valor |
| --- | --- |
| `--background` | `#0D0712` |
| `--surface` | `#17101F` |
| `--surface-elevated` | `#22162D` |
| `--foreground` | `#FAF7FF` |
| `--muted-foreground` | `#CBB8D9` |
| `--border` | `rgba(255,255,255,0.10)` |
| `--primary` | `#A855F7` |
| `--primary-hover` | `#7E22CE` |
| `--primary-soft` | `#D8B4FE` |
| `--success` | `#4ADE80` |
| `--danger` | `#FB7185` |
| `--warning` | `#FBBF24` |

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

FinTrack **no convierte divisas ni usa tipos de cambio** (decisión M1, sin
cambio en M2). Reglas de presentación de monedas:

- **Todo importe se muestra con su código de moneda** (por ejemplo `USD 1.250`),
  incluido en ejes de gráficos y filas del Libro financiero (M1).
- **Los totales solo suman cuentas de una misma moneda.** Las pantallas eligen
  una moneda de presentación: la principal del perfil si el usuario tiene alguna
  cuenta en ella; si no, la de la primera cuenta (`resolvePresentationCurrency`).
- Las cuentas en otras monedas **no se suman**: su saldo aparece aparte, en su
  propia moneda, sin convertir. El Dashboard lo explica en pantalla: «Tus
  cuentas en … no se suman: su saldo aparece aparte, sin convertir.» (M1).
- **Catálogo:** COP, USD y ARS son las monedas seleccionables para cuentas
  nuevas y para el onboarding. EUR y MXN son solo lectura: se formatean y pueden
  conservarse al editar una cuenta que ya las tenga, pero no se ofrecen al crear
  (D1 y D2).
- **Moneda principal del perfil:** COP, USD o ARS, con COP por defecto. Se elige
  durante el onboarding (D3) y hoy no se puede cambiar desde Settings (D7).
- **Cambiar la moneda de una cuenta:** bloqueado si la cuenta ya tiene
  movimientos (D6); permitido sin movimientos. Las líneas de aporte del Plan no
  se comprueban (limitación hasta M5).
- **Filtro por moneda (M3):** `/transactions` y `/ledger` tienen un selector
  «Moneda» con «Todas las monedas» y solo las monedas de las cuentas del
  usuario (archivadas incluidas, y EUR/MXN si hay cuentas heredadas), con la
  principal primero. Se oculta si el usuario tiene una sola moneda. Como
  `transactions` no guarda moneda, filtrar por moneda es filtrar por las cuentas
  en ella (`resolveCurrencyFilter`); si la moneda elegida ya no tiene cuentas,
  se vuelve a «Todas». Es estado local, no va en la URL. Con «Todas», los
  totales siguen separados por moneda.
- **Transferencias entre monedas (M4):** siguen siendo dos movimientos, uno por
  cuenta, pero cada pata guarda **su propio importe en la moneda de su cuenta**.
  - Con la misma moneda, el formulario pide un solo «Monto» y las dos patas
    llevan el mismo importe; un monto recibido distinto se rechaza (una
    comisión se registra como gasto aparte).
  - Con monedas distintas pide «Monto enviado (COP)» y, obligatorio, «Monto
    recibido (USD)», con la nota «FinTrack no convierte divisas: registra
    cuánto salió y cuánto entró». «Equivale a» usa la moneda de cada cuenta.
  - Cada pata muestra su contraparte: `→ Cuenta USD · + USD 25` en la que sale
    y `← Ahorros · − COP 100.000` en la que entra. Es información de la fila,
    no una fila más: conteo, paginación y orden no cambian. Filtrando por una
    moneda o una cuenta se ve solo la pata correspondiente, con la referencia a
    la otra.
  - No entran en ingresos, gastos, «Ahorro neto», «Tasa de ahorro» ni en el
    balance del resumen del Libro. Sí mueven el saldo de cada cuenta y, por
    tanto, el saldo de cada moneda y su saldo acumulado.
  - Siguen sin poder editarse: se eliminan (se borran las dos patas) y se
    vuelven a crear.
- **Limitación conocida:** las transferencias entre monedas registradas antes
  de M4 guardaron el mismo importe en las dos patas (p. ej. COP 100.000 que
  «entran» como USD 100.000) y siguen así hasta que el usuario las elimine y
  las vuelva a crear. El Plan suma los aportes con el importe de la pata
  entrante sin separar monedas (limitación hasta M5).

---

## Categorías predeterminadas

Durante onboarding, crear las categorías por usuario mediante una estrategia segura y repetible (con `is_system = true` según corresponda).

### Ingresos
- Salario.
- Freelance.
- Ventas.
- Inversiones.
- Reembolsos.
- Regalos.
- Otros ingresos.

### Gastos esenciales
- Vivienda.
- Servicios públicos.
- Internet y telefonía.
- Alimentación.
- Transporte.
- Salud.
- Educación.
- Seguros.
- Deudas y créditos.

### Gastos flexibles
- Restaurantes.
- Entretenimiento.
- Suscripciones.
- Ropa.
- Compras personales.
- Viajes.
- Mascotas.
- Regalos.
- Otros gastos.

> Nota: **no** crear “Ahorro” como gasto predeterminado. Ahorrar se modela como transferencia a una cuenta de ahorro.

---

## Rutas y pantallas

### Separación de superficies de movimientos

Cuatro rutas trabajan sobre movimientos y no se solapan:

| Ruta | Propósito |
| --- | --- |
| `/transactions` | Uso diario: crear, editar, duplicar y eliminar movimientos. |
| `/ledger` | Historial financiero: consulta, filtros, ordenamiento, exportación CSV, edición y saldo acumulado. |
| `/plan` | Plan mensual: planificación del mes y comparación Presupuesto vs. Actual. Fase 8.7. |
| `/sheets` | Borradores estructurados: captura previa al registro. Fase 8.5, sin UI todavía. |

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

- Selector de mes.
- Selector opcional de cuenta.
- Botón “Registrar movimiento”.
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
- Últimos movimientos.
- Estados de carga, error y vacío.
- Información consistente con `transactions`.

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
- Selector de columnas.
- Resumen de ingresos, gastos, balance y cantidad de movimientos. Con varias
  monedas, una línea por moneda; filtrando una moneda sin movimientos, los
  ceros se muestran en esa moneda.
- Saldo acumulado solo cuando todas las cuentas del alcance comparten moneda:
  filtrando por una moneda o por una cuenta. Si no, se explica «Filtra por una
  moneda o una cuenta para verlo».
- Transferencias (M4, ver «Monedas»): cada pata es una fila con su importe y su
  moneda; la descripción, en la tabla y en las tarjetas, añade la contraparte.
- Exportar CSV respetando filtros. Las transferencias no llevan columnas de
  contraparte: cada fila trae su «Moneda» y el «Grupo de transferencia» basta
  para emparejarlas. En una transferencia entre monedas, sumar «Monto» sobre la
  pareja ya no da cero: cada fila va en su moneda.
- Modal de edición.
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

### `/sheets`

**Ruta futura de la Fase 8.5. Todavía no tiene UI implementada:** el esquema
está aplicado (`sheets`, `sheet_drafts`), pero no existen ni la ruta ni los
componentes.

**Hojas de cálculo.** Captura estructurada de borradores persistidos, con
columnas propias de texto por hoja y registro explícito de ingresos y gastos.

**No reemplaza `/transactions` ni `/ledger`.** Un borrador no registrado no
aparece en ninguna de las dos, ni afecta saldos, dashboard o presupuestos.

**No incluir:**
- Fórmulas y columnas calculadas.
- Importación CSV: es la Fase 10 y opera sobre `transactions`.
- Edición de movimientos ya registrados dentro de la hoja.
- Acciones masivas.
- Reordenamiento de filas.

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
  de ahorro para planificar un aporte.» con enlace a Cuentas; con todas ya
  ocupadas este mes, «Todas tus cuentas de ahorro ya tienen un aporte planeado
  este mes.».
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
cuenta ya tiene movimientos» (D6). Sin movimientos, el cambio se permite. Las
líneas de aporte del Plan no se comprueban (limitación hasta M5).

### `/settings`

- Perfil.
- Moneda.
- Tema.
- Zona horaria.
- Categorías.
- Cierre de sesión.
- Dejar documentadas, pero **no implementar sin aprobación**:
  - Exportación completa de datos.
  - Eliminación de cuenta.

**Moneda principal (D7):** hoy no se puede cambiar desde Ajustes; se cambia
solo durante el onboarding. El cambio desde Settings queda fuera de M2.

---

## Navegación

En escritorio se muestran los siete destinos sin agrupar.

En móvil, cuatro ranuras. Ningún acceso desaparece: los cinco restantes viven
en «Más», que abre una hoja inferior con sus etiquetas completas.

| Ranura | Contenido |
| --- | --- |
| Resumen | `/dashboard` |
| Plan | `/plan` |
| Movimientos | `/transactions` |
| Más | `/ledger` (Historial financiero), `/budgets` (Presupuestos), `/sheets` (Hojas), `/accounts` (Cuentas), `/settings` (Ajustes) |

Los nombres visibles son «Plan mensual», «Historial financiero», «Movimientos»,
«Presupuestos», «Hojas», «Cuentas» y «Ajustes». En la barra móvil se abrevian a
una palabra; en los encabezados de cada pantalla se escriben completos.