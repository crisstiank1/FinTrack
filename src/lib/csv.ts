import Papa from 'papaparse'

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number
}

/**
 * Separador `;` en vez de `,`.
 *
 * Excel usa el separador de listas del sistema, que en configuraciones en
 * español es `;` porque la coma ya es el separador decimal. Con `,` el archivo
 * se abriría con todas las columnas amontonadas en una sola.
 */
const DELIMITER = ';'

/**
 * BOM de UTF-8. Sin él, Excel interpreta el archivo como ANSI y las tildes y
 * eñes aparecen corruptas.
 */
const BOM = '﻿'

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  return Papa.unparse(
    {
      fields: columns.map((column) => column.header),
      data: rows.map((row) => columns.map((column) => column.value(row))),
    },
    { delimiter: DELIMITER },
  )
}

/** Entrega el CSV al navegador como descarga. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}
