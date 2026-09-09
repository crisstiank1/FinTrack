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

Tres rutas trabajan sobre movimientos y no se solapan:

| Ruta | Propósito |
| --- | --- |
| `/transactions` | Uso diario: crear, editar, duplicar y eliminar movimientos. |
| `/ledger` | Historial financiero: consulta, filtros, ordenamiento, exportación CSV, edición y saldo acumulado. |
| `/sheets` | Borradores estructurados: captura previa al registro. Fase 8.5, sin UI todavía. |

Ninguna reemplaza a las otras.

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
- Formulario validado con Zod.
- Transferencias entre cuentas.
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
- Filtros por periodo, cuenta, categoría y tipo.
- Paginación server-side.
- Cabecera sticky.
- Selector de columnas.
- Resumen de ingresos, gastos, balance y cantidad de movimientos.
- Exportar CSV respetando filtros.
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

### `/accounts`

- Crear cuentas.
- Editar cuentas.
- Archivar cuentas.
- Listar saldos.
- No eliminar cuentas con movimientos.

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