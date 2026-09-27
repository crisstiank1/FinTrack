import type { SupabaseClient } from '@supabase/supabase-js'

import type { DraftCells } from '@/features/sheets/schemas'
import type { Database, Json } from '@/types/database.types'

import { SOURCE_COLUMN } from './drafts'
import type { ExistingMovement } from './duplicates'

/**
 * Acceso a datos del importador. Recibe el cliente como parámetro para que las
 * pruebas pasen un doble; la pantalla pasa el cliente del navegador, que lleva
 * la sesión del usuario y queda sujeto a RLS.
 *
 * Solo escribe en `sheets` y `sheet_drafts`. **Nunca en `transactions`**: los
 * movimientos reales los crea `register_sheet_draft` cuando el usuario registra
 * desde Hojas.
 */
export type ImportClient = Pick<SupabaseClient<Database>, 'from'>

const PAGE = 1000

/** Movimientos y borradores de la cuenta en el rango, para avisar de duplicados. */
export async function fetchExistingMovements(
  client: ImportClient,
  userId: string,
  accountId: string,
  from: string,
  to: string,
): Promise<ExistingMovement[]> {
  const found: ExistingMovement[] = []

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client
      .from('transactions')
      .select('account_id, transaction_date, amount_minor, type, description')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .gte('transaction_date', from)
      .lte('transaction_date', to)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    found.push(...data)
    if (data.length < PAGE) break
  }

  // Borradores pendientes de cualquier hoja: importar dos veces el mismo
  // archivo es el duplicado más probable de todos.
  const { data: drafts, error: draftsError } = await client
    .from('sheet_drafts')
    .select('cells')
    .eq('user_id', userId)
  if (draftsError) throw draftsError

  for (const draft of drafts) {
    const cells = draft.cells as Record<string, unknown> | null
    if (!cells || cells.account_id !== accountId) continue
    const amount = Number(cells.amount_minor)
    const date = typeof cells.transaction_date === 'string' ? cells.transaction_date : ''
    if (!Number.isSafeInteger(amount) || date < from || date > to) continue
    found.push({
      account_id: accountId,
      transaction_date: date,
      amount_minor: amount,
      type: typeof cells.type === 'string' ? cells.type : '',
      description: typeof cells.description === 'string' ? cells.description : null,
    })
  }

  return found
}

/**
 * Crea una hoja nueva con los borradores importados.
 *
 * Una hoja propia por importación: no choca con las posiciones de una hoja en
 * uso y deja la revisión aislada. Los borradores van en una sola inserción, que
 * PostgREST ejecuta como una sentencia: entran todos o ninguno. Si fallan, se
 * borra la hoja recién creada para no dejarla vacía.
 */
export async function createImportSheet(
  client: ImportClient,
  userId: string,
  name: string,
  cells: readonly DraftCells[],
): Promise<{ sheetId: string; created: number }> {
  if (cells.length === 0) throw new Error('No hay filas que importar.')

  const { data: sheet, error: sheetError } = await client
    .from('sheets')
    .insert({ user_id: userId, name, columns: [SOURCE_COLUMN] as unknown as Json })
    .select('id')
    .single()
  if (sheetError) throw sheetError

  const { error: draftsError } = await client.from('sheet_drafts').insert(
    cells.map((row, position) => ({
      user_id: userId,
      sheet_id: sheet.id,
      position,
      cells: row as unknown as Json,
    })),
  )

  if (draftsError) {
    await client.from('sheets').delete().eq('id', sheet.id)
    throw draftsError
  }

  return { sheetId: sheet.id, created: cells.length }
}
