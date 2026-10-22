import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database.types'

import { parseProjectionResult, type ProjectionResult } from './logic'

export type RecurringTemplate = Tables<'recurring_templates'>

export async function fetchRecurringTemplates(userId: string): Promise<RecurringTemplate[]> {
  const { data, error } = await supabase
    .from('recurring_templates')
    .select('*')
    .eq('user_id', userId)
    .order('day_of_month', { ascending: true })
  if (error) throw error
  return data
}

export async function fetchProjections(userId: string, monthKey: string) {
  const { data, error } = await supabase
    .from('recurring_template_projections')
    .select('template_id, generated_for_month')
    .eq('user_id', userId)
    .eq('generated_for_month', monthKey)
  if (error) throw error
  return data
}

/** Zona horaria del perfil, para saber cuál es «este mes» para el usuario. */
export async function fetchProfileTimeZone(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data.timezone
}

export async function createRecurringTemplate(
  input: TablesInsert<'recurring_templates'>,
): Promise<RecurringTemplate> {
  const { data, error } = await supabase.from('recurring_templates').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateRecurringTemplate(
  id: string,
  input: Partial<Pick<RecurringTemplate, 'is_active'>>,
): Promise<void> {
  const { error } = await supabase.from('recurring_templates').update(input).eq('id', id)
  if (error) throw error
}

/**
 * Elimina una plantilla. Los borradores ya proyectados siguen siendo borradores
 * normales (pierden la referencia) y los movimientos registrados no se tocan.
 */
export async function deleteRecurringTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('recurring_templates').delete().eq('id', id)
  if (error) throw error
}

/** Proyecta el mes a borradores. Nunca crea movimientos: ver la migración. */
export async function projectRecurringTemplates(monthKey: string): Promise<ProjectionResult> {
  const { data, error } = await supabase.rpc('project_recurring_templates', { p_month: monthKey })
  if (error) throw error
  return parseProjectionResult(data)
}
