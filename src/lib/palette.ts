/**
 * Paleta de colores de categorías y cuentas.
 *
 * Vive en `src/lib/` y no junto al selector de color porque la usan también
 * módulos de dominio puro, como el reparto por categoría del dashboard. Un
 * módulo de dominio no puede importar un `.tsx`: arrastraría JSX y React a
 * cualquier entorno que lo reutilice fuera del navegador.
 *
 * Los valores y su orden son los mismos que tenía `color-picker.tsx`: el índice
 * de cada color es el que reciben las categorías sin color propio, así que
 * reordenarlos cambiaría el aspecto de datos ya existentes.
 */
export const SWATCHES = [
  '#E83E8C',
  '#A855F7',
  '#3B82F6',
  '#16805B',
  '#B26B00',
  '#C62848',
  '#0EA5E9',
  '#64748B',
] as const
