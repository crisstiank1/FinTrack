# Accesibilidad

> Auditoría del 2026-09-27. Objetivo: WCAG 2.2 AA en las superficies
> prioritarias. No es una certificación.

## Automatizado

`axe-core` (dependencia de desarrollo) corre en la suite con
`src/test/axe.ts`. Un control negativo (`src/test/axe-control.test.tsx`)
comprueba que axe detecta infracciones en jsdom.

| Superficie                                   | Prueba                    | Resultado        |
| -------------------------------------------- | ------------------------- | ---------------- |
| `/privacy`, `/terms`, `/cookies`, `/refunds` | `src/pages/a11y.test.tsx` | Sin infracciones |
| Acceso y registro                            | `a11y.test.tsx`           | Sin infracciones |
| Importador CSV (vacío y con archivo)         | `a11y.test.tsx`           | Sin infracciones |
| Consentimiento de FinTrack Coach             | `a11y.test.tsx`           | Sin infracciones |
| Ajustes                                      | `Settings.test.tsx`       | Sin infracciones |
| Dashboard                                    | `Dashboard.test.tsx`      | Sin infracciones |
| Movimientos y diálogo de nuevo movimiento    | `Transactions.test.tsx`   | Sin infracciones |

`color-contrast` se desactiva en jsdom (no calcula estilos) y se verifica con
los tokens:

## Contraste (tokens de `src/index.css`)

| Par                                 | Antes | Después | Cambio                            |
| ----------------------------------- | ----- | ------- | --------------------------------- |
| Texto blanco sobre primario (claro) | 3,82  | 4,84    | `--primary` `#e83e8c` → `#d6246f` |
| Texto primario sobre fondo (claro)  | 3,65  | 4,62    | ídem                              |
| Advertencia sobre fondo (claro)     | 4,02  | 5,19    | `--warning` → `#9a5b00`           |
| Texto sobre `destructive` (oscuro)  | 2,69  | 7,39    | `--destructive-foreground` oscuro |
| Borde de campos (claro)             | 1,28  | 3,47    | `--input` propio `#a67a8c`        |
| Borde de campos (oscuro)            | < 2   | 3,53    | `--input` `#75658a`               |

Sin cambios, ya cumplían: texto principal (16,1 / 18,8), texto secundario
(6,3 / 10,8), `danger` y `success` en claro, primario en oscuro (5,0).

## Cambios manuales

- Enlace «Saltar al contenido» y `<main id="contenido">` en la app.
- `header`, `nav`, `main` y `footer` en la app, el acceso y las páginas
  legales; pie con `nav` «Información legal».
- Título de pestaña por ruta (`useDocumentTitle`), incluido el acceso.
- Un solo `h1` por página legal; secciones con `h2`.
- Tablas del importador y de cookies con `scope`, `caption` o cabeceras de fila.
- Resumen de la revisión del CSV con `role="status"`.
- Consentimiento del Coach con `aria-live`, casilla con etiqueta visible y
  descripción asociada; nunca marcada por defecto.
- Botón «Guardar» del nombre en Ajustes → «Guardar nombre».
- `lang="es"` ya estaba en `index.html`.

Los diálogos usan Radix (`@radix-ui/react-dialog` y `alert-dialog`), que
gestionan foco atrapado, Escape y retorno del foco.

## Cambios de la auditoría final

- Ajustes → Movimientos recurrentes: botones con el nombre de la plantilla
  («Eliminar «Arriendo»»), estados de carga y de error en vez del vacío.
- Resultado de la proyección: cada plantilla omitida con nombre, motivo y
  acción sugerida.
- Movimientos: los botones de solo icono de cada fila nombran su movimiento
  («Eliminar movimiento «Mercado»»); antes eran idénticos en todas las filas.

## Pruebas en navegador (Chromium, stack local)

- Un solo `h1`, `main`, pie y título por ruta en 13 rutas, a 1280 y 390 px.
- Reflujo a 320 px sin scroll horizontal de la página en todas las rutas. Se
  corrigieron dos causas: la cabecera `sr-only` de las tablas escapaba del
  contenedor con scroll (ahora `relative`) y los botones de cabecera no
  ajustaban línea (ahora `flex-wrap`).
- Botón flotante del Dashboard: no tapa los enlaces del pie al final de la
  página (390 y 320 px).
- Escape cierra el diálogo de nuevo movimiento; modo oscuro aplicado.

## Actualización visual (axe en Chromium, ambos temas)

axe-core ejecutado en el navegador real (con `color-contrast`, que jsdom no
calcula) en 10 rutas y en los dos temas: **sin infracciones**. Antes del
cambio fallaban:

- Enlace activo de la navegación en todas las páginas: 2,99:1 (claro) y
  2,23:1 (oscuro). Ahora `--primary-strong` sobre un tinte de marca: 6,1:1 y
  13,1:1.
- Insignias de ingreso y gasto en el Libro: 4,0–4,4:1. Ahora ≥ 5,3:1.
- Gráficas del Dashboard ocultas a lectores de pantalla pero enfocables con
  Tab (capa de teclado de Recharts). Ya no reciben el foco; la tabla y la
  lista siguen siendo su equivalente.
- Cuentas saltaba de `h1` a `h3`; el nombre de cada cuenta es ahora `h2`.

Con datos en Hojas, Presupuestos y Plan aparecieron dos más, también
corregidos:

- Celdas de fecha y monto de Hojas sin nombre accesible (sin texto de
  ejemplo). Ahora llevan `aria-label` «Fecha» y «Monto».
- Enlace «Ajustar presupuesto» sobre el aviso de exceso: 4,27:1. Ahora
  `--primary-strong` y subrayado, que además lo distingue sin depender del
  color.

También: en móvil, las filas de Movimientos dejaban la descripción en una o
dos letras; el importe y las acciones bajan ahora a una segunda línea.

## Pendiente

- Lector de pantalla (NVDA/VoiceOver) con datos reales.
- Contraste de las gráficas de Recharts y de los colores de categoría elegidos
  por el usuario.
- Zoom al 200 %.
