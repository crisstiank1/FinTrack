/**
 * Etiquetas de los tipos de movimiento.
 *
 * Viven aparte de las columnas porque también las usan las tarjetas de móvil
 * y la exportación a CSV, y así el nombre visible de un tipo es el mismo en
 * la tabla, en el móvil y en el archivo descargado.
 */
export const TYPE_LABELS: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  transfer: 'Transferencia',
}
