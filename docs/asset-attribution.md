# Activos visuales: origen, licencia y uso

Auditoría del 2026-09-27 sobre `public/`, `src/assets/`, `index.html` e
`src/index.css`.

## Imágenes

| Archivo                                | Uso                     | Origen en Git                          | Licencia          | Texto alternativo          |
| -------------------------------------- | ----------------------- | -------------------------------------- | ----------------- | -------------------------- |
| `src/assets/brand/logo-light.png`      | Logo en tema claro      | `c408d97` (2026-09-10), autor del repo | **Por confirmar** | `alt="FinTrack"`           |
| `src/assets/brand/logo-dark.png`       | Logo en tema oscuro     | `c408d97`, `8970cfb`                   | **Por confirmar** | `alt="FinTrack"`           |
| `src/assets/brand/logo-light-icon.png` | Variante icono del logo | `c408d97`                              | **Por confirmar** | `alt="FinTrack"`           |
| `src/assets/brand/logo-dark-icon.png`  | Variante icono del logo | `c408d97`                              | **Por confirmar** | `alt="FinTrack"`           |
| `public/favicon-light.png`             | Favicon tema claro      | `c408d97`                              | **Por confirmar** | No aplica                  |
| `public/favicon-dark.png`              | Favicon tema oscuro     | `8970cfb`                              | **Por confirmar** | No aplica                  |
| ~~`public/vite.svg`~~                  | Sin uso                 | Plantilla de Vite                      | MIT (Vite)        | **Eliminado** en `dee1a5f` |

El logo y los favicons los añadió el propietario del repositorio. Falta
documentar quién los creó y con qué derechos (diseño propio, encargo o
herramienta de generación con sus términos). **Acción manual:** confirmar y
completar la columna de licencia.

Cuando el logo va dentro de un enlace, el enlace lleva `aria-label` («Ir al
inicio de FinTrack») y la imagen conserva `alt="FinTrack"`.

## Iconos

`lucide-react` (licencia ISC). Todos los iconos se usan con `aria-hidden` y
los botones que solo tienen icono llevan `aria-label` (p. ej. «Cerrar sesión»,
«Registrar movimiento», «Eliminar movimiento»).

## Ilustraciones

El gráfico decorativo del panel de acceso (`auth-shell.tsx`) es un SVG escrito
en el propio código, sin recursos externos.

## Tipografía

Inter Variable (© The Inter Project Authors, licencia SIL Open Font License
1.1) desde el paquete `@fontsource-variable/inter`. Los archivos `.woff2` se
empaquetan con el build y se sirven desde el propio dominio: **no hay
peticiones a Google Fonts ni a otros CDN** (`storage-inventory.test.ts` lo
comprueba). El navegador solo descarga el subconjunto que usa la página
(`unicode-range`); si no carga, se usa la fuente del sistema.

## Logos de terceros

No hay logos de bancos, del proveedor de IA ni de clientes. La interfaz no
declara integración con ningún banco.

| Activo                                          | Uso                                              | Estado                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Logotipo «G» de Google (`google-icon.tsx`, SVG) | Botón «Continuar con Google» (acceso y registro) | Marca de Google. Su uso en botones de inicio de sesión está sujeto a las directrices de marca de Google Sign-In. **Acción manual:** revisar que el botón cumple esas directrices. `aria-hidden`; el nombre accesible es el texto del botón |
