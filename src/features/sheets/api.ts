import { supabase } from '@/lib/supabase'
import type { Json, Tables, TablesInsert } from '@/types/database.types'

import { parseRegisterDraftResponse, type RegisterDraftResponse } from './schemas'

export type SheetRow = Tables<'sheets'>
export type SheetDraftRow = Tables<'sheet_drafts'>

/** Código de violación de unicidad de PostgreSQL (colisión de `(sheet_id, position)`). */
export const UNIQUE_VIOLATION_CODE = '23505'

export function isUniquePositionViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

/** Posición de la siguiente fila: la mayor entre los borradores más uno. */
export function nextDraftPosition(drafts: readonly { position: number }[]): number {
  return drafts.reduce((max, draft) => Math.max(max, draft.position), -1) + 1
}

export async function fetchSheets(userId: string): Promise<SheetRow[]> {
  const { data, error } = await supabase
    .from('sheets')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

export async function createSheet(userId: string, name: string, columns: Json): Promise<SheetRow> {
  const { data, error } = await supabase
    .from('sheets')
    .insert({ user_id: userId, name, columns })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateSheetColumns(sheetId: string, columns: Json): Promise<SheetRow> {
  const { data, error } = await supabase
    .from('sheets')
    .update({ columns })
    .eq('id', sheetId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function fetchDrafts(sheetId: string): Promise<SheetDraftRow[]> {
  const { data, error } = await supabase
    .from('sheet_drafts')
    .select('*')
    .eq('sheet_id', sheetId)
    .order('position', { ascending: true })
  if (error) throw error
  return data
}

export async function createDraft(input: TablesInsert<'sheet_drafts'>): Promise<SheetDraftRow> {
  const { data, error } = await supabase.from('sheet_drafts').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateDraftCells(draftId: string, cells: Json): Promise<SheetDraftRow> {
  const { data, error } = await supabase
    .from('sheet_drafts')
    .update({ cells })
    .eq('id', draftId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDraft(draftId: string): Promise<void> {
  const { error } = await supabase.from('sheet_drafts').delete().eq('id', draftId)
  if (error) throw error
}

/**
 * Registra un borrador como movimiento (transacción atómica en SQL). Es el
 * único `rpc()` de la app: ver `register_sheet_draft` en la migración de Hojas.
 */
export async function registerSheetDraft(draftId: string): Promise<RegisterDraftResponse> {
  const { data, error } = await supabase.rpc('register_sheet_draft', { p_draft_id: draftId })
  if (error) throw error
  return parseRegisterDraftResponse(data)
}
