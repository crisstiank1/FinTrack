import { monthRange, todayIsoDate } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

export interface TransactionFilters {
  month?: string
  accountId?: string
  type?: 'income' | 'expense' | 'transfer'
}

export async function fetchTransactions(userId: string, filters: TransactionFilters) {
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (filters.month) {
    const { start, end } = monthRange(filters.month)
    query = query.gte('transaction_date', start).lte('transaction_date', end)
  }
  if (filters.accountId) {
    query = query.eq('account_id', filters.accountId)
  }
  if (filters.type) {
    query = query.eq('type', filters.type)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function createTransaction(input: TablesInsert<'transactions'>) {
  const { data, error } = await supabase.from('transactions').insert(input).select().single()
  if (error) throw error
  return data
}

interface TransferInput {
  userId: string
  fromAccountId: string
  toAccountId: string
  amountMinor: number
  transactionDate: string
  description: string
}

export async function createTransferPair(input: TransferInput) {
  const transferGroupId = crypto.randomUUID()

  const rows: TablesInsert<'transactions'>[] = [
    {
      user_id: input.userId,
      account_id: input.fromAccountId,
      category_id: null,
      type: 'transfer',
      transfer_direction: 'outgoing',
      transfer_group_id: transferGroupId,
      amount_minor: input.amountMinor,
      transaction_date: input.transactionDate,
      description: input.description,
    },
    {
      user_id: input.userId,
      account_id: input.toAccountId,
      category_id: null,
      type: 'transfer',
      transfer_direction: 'incoming',
      transfer_group_id: transferGroupId,
      amount_minor: input.amountMinor,
      transaction_date: input.transactionDate,
      description: input.description,
    },
  ]

  const { data, error } = await supabase.from('transactions').insert(rows).select()
  if (error) throw error
  return data
}

export async function updateTransaction(id: string, input: TablesUpdate<'transactions'>) {
  const { data, error } = await supabase
    .from('transactions')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTransaction(transaction: Pick<Tables<'transactions'>, 'id' | 'transfer_group_id'>) {
  if (transaction.transfer_group_id) {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('transfer_group_id', transaction.transfer_group_id)
    if (error) throw error
    return
  }

  const { error } = await supabase.from('transactions').delete().eq('id', transaction.id)
  if (error) throw error
}

export async function duplicateTransaction(userId: string, transactionId: string) {
  const { data: original, error: fetchError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .single()
  if (fetchError) throw fetchError

  const today = todayIsoDate()

  if (original.type === 'transfer' && original.transfer_group_id) {
    const { data: pair, error: pairError } = await supabase
      .from('transactions')
      .select('*')
      .eq('transfer_group_id', original.transfer_group_id)
    if (pairError) throw pairError

    const newGroupId = crypto.randomUUID()
    const rows: TablesInsert<'transactions'>[] = pair.map((row) => ({
      user_id: userId,
      account_id: row.account_id,
      category_id: null,
      type: 'transfer',
      transfer_direction: row.transfer_direction,
      transfer_group_id: newGroupId,
      amount_minor: row.amount_minor,
      transaction_date: today,
      description: row.description,
    }))

    const { data, error } = await supabase.from('transactions').insert(rows).select()
    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: original.account_id,
      category_id: original.category_id,
      type: original.type,
      amount_minor: original.amount_minor,
      transaction_date: today,
      description: original.description,
      notes: original.notes,
    })
    .select()
    .single()
  if (error) throw error
  return data
}
