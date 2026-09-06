import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

export async function fetchCategories(userId: string) {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .order('is_archived', { ascending: true })
    .order('type', { ascending: true })
    .order('name', { ascending: true })

  if (error) throw error
  return data
}

export async function createCategory(input: TablesInsert<'categories'>) {
  const { data, error } = await supabase.from('categories').insert(input).select().single()
  if (error) throw error
  return data
}

export async function createCategories(inputs: TablesInsert<'categories'>[]) {
  const { data, error } = await supabase.from('categories').insert(inputs).select()
  if (error) throw error
  return data
}

export async function updateCategory(id: string, input: TablesUpdate<'categories'>) {
  const { data, error } = await supabase
    .from('categories')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function archiveCategory(id: string) {
  const { error } = await supabase.from('categories').update({ is_archived: true }).eq('id', id)
  if (error) throw error
}
