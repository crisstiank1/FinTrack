import type { DraftCells, SheetColumn } from '@/features/sheets/schemas'

import type { ImportRow } from './normalize'

/**
 * Filas normalizadas → celdas de `sheet_drafts`.
 *
 * Se reutiliza el contrato de Hojas tal cual: los siete campos fijos que valida
 * `register_sheet_draft` y una columna propia con el origen. Esa columna viaja a
 * `transactions.custom_fields` al registrar, así cada movimiento importado
 * conserva de qué archivo y de qué línea salió.
 */

export const SOURCE_COLUMN: SheetColumn = {
  id: 'origen_csv',
  label: 'Origen',
  type: 'text',
  position: 0,
}

export const IMPORT_SOURCE = 'csv_import'

export function sourceLabel(fileName: string, line: number): string {
  return `${IMPORT_SOURCE} · ${fileName} · línea ${line}`
}

export function toDraftCells(row: ImportRow, accountId: string, fileName: string): DraftCells {
  if (row.date === null || row.amountMinor === null || row.type === null) {
    throw new Error('Una fila inválida no se convierte en borrador.')
  }

  return {
    transaction_date: row.date,
    description: row.description,
    account_id: accountId,
    category_id: row.categoryId ?? '',
    type: row.type,
    // Entero en la unidad mínima de la moneda de la cuenta, como texto: es
    // lo que espera la celda y lo que valida la RPC.
    amount_minor: String(row.amountMinor),
    notes: '',
    [SOURCE_COLUMN.id]: sourceLabel(fileName, row.sourceLine),
  }
}

/** Nombre de la hoja de revisión: el del archivo, dentro del tope de 80. */
export function importSheetName(fileName: string, today: string): string {
  const base = fileName.replace(/\.(csv|txt)$/i, '').trim() || 'extracto'
  return `CSV ${base} (${today})`.slice(0, 80)
}
