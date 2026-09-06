import { supabase } from '@/lib/supabase'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

export async function fetchAccounts(userId: string) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .order('is_archived', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

export async function createAccount(input: TablesInsert<'accounts'>) {
  const { data, error } = await supabase.from('accounts').insert(input).select().single()
  if (error) throw error
  return data
}

export async function createAccounts(inputs: TablesInsert<'accounts'>[]) {
  const { data, error } = await supabase.from('accounts').insert(inputs).select()
  if (error) throw error
  return data
}

export async function updateAccount(id: string, input: TablesUpdate<'accounts'>) {
  const { data, error } = await supabase
    .from('accounts')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function archiveAccount(id: string) {
  const { error } = await supabase.from('accounts').update({ is_archived: true }).eq('id', id)
  if (error) throw error
}
