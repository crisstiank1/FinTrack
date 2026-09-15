import { formatAmount } from '@/lib/currency'
import { monthRange, todayIsoDate } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

export interface TransactionFilters {
  month?: string
  /**
   * Moneda elegida en el selector. La consulta no la lee: `transactions` no
   * guarda moneda, así que la página la traduce a `accountIds`.
   */
  currencyCode?: string
  /** Cuentas de la moneda elegida (ver `resolveCurrencyFilter`). */
  accountIds?: string[]
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
  // Una lista vacía no devolvería nada: se trata como «todas las monedas».
  if (filters.accountIds?.length) {
    query = query.in('account_id', filters.accountIds)
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
  /** Importe de la pata saliente, en la moneda de la cuenta de origen. */
  fromAmountMinor: number
  /**
   * Importe de la pata entrante, en la moneda de la cuenta de destino. Igual a
   * `fromAmountMinor` si las dos cuentas comparten moneda; distinto si no,
   * porque FinTrack no convierte divisas (ver `createTransferSchema`).
   */
  toAmountMinor: number
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
      amount_minor: input.fromAmountMinor,
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
      amount_minor: input.toAmountMinor,
      transaction_date: input.transactionDate,
      description: input.description,
    },
  ]

  const { data, error } = await supabase.from('transactions').insert(rows).select()
  if (error) throw error
  return data
}

/** La otra pata de una transferencia, vista desde la fila que la muestra. */
export interface TransferCounterpart {
  accountId: string
  /** Importe de la otra pata, en la moneda de su propia cuenta. */
  amountMinor: number
  direction: 'incoming' | 'outgoing'
}

type TransferLeg = Pick<
  Tables<'transactions'>,
  'id' | 'transfer_group_id' | 'account_id' | 'amount_minor' | 'transfer_direction'
>

/** Grupos por consulta: cada UUID ocupa ~37 caracteres de la URL de PostgREST. */
const COUNTERPART_GROUPS_PER_QUERY = 100

/** Grupos de transferencia de unas filas, sin repetir y en orden estable. */
export function transferGroupIds(
  rows: readonly Pick<Tables<'transactions'>, 'type' | 'transfer_group_id'>[],
): string[] {
  const ids = rows
    .filter((row) => row.type === 'transfer' && row.transfer_group_id)
    .map((row) => row.transfer_group_id as string)
  return [...new Set(ids)].sort()
}

/**
 * Contraparte de cada transferencia de `rows`, por id de fila.
 *
 * La otra pata no siempre está entre las filas: una página del libro o un
 * filtro por cuenta o por moneda pueden dejarla fuera. Por eso se piden aparte
 * las patas de los grupos visibles. Es información de la fila, no una fila más:
 * la tabla, el conteo y la paginación no cambian.
 */
export async function fetchTransferCounterparts(
  userId: string,
  rows: readonly Pick<Tables<'transactions'>, 'id' | 'type' | 'transfer_group_id'>[],
): Promise<Map<string, TransferCounterpart>> {
  const groupIds = transferGroupIds(rows)
  const legs: TransferLeg[] = []

  for (let start = 0; start < groupIds.length; start += COUNTERPART_GROUPS_PER_QUERY) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, transfer_group_id, account_id, amount_minor, transfer_direction')
      .eq('user_id', userId)
      .in('transfer_group_id', groupIds.slice(start, start + COUNTERPART_GROUPS_PER_QUERY))

    if (error) throw error
    legs.push(...(data ?? []))
  }

  return pairTransferCounterparts(rows, legs)
}

/**
 * Empareja cada transferencia con la otra pata de su grupo. Un grupo que no
 * tenga exactamente dos patas, o cuyas dos patas vayan en la misma dirección,
 * no da contraparte: mostrar una a medias sería peor que no mostrar nada.
 */
export function pairTransferCounterparts(
  rows: readonly Pick<Tables<'transactions'>, 'id' | 'type' | 'transfer_group_id'>[],
  legs: readonly TransferLeg[],
): Map<string, TransferCounterpart> {
  const legsByGroup = new Map<string, TransferLeg[]>()
  for (const leg of legs) {
    if (!leg.transfer_group_id) continue
    const group = legsByGroup.get(leg.transfer_group_id) ?? []
    if (!group.some((existing) => existing.id === leg.id)) group.push(leg)
    legsByGroup.set(leg.transfer_group_id, group)
  }

  const counterparts = new Map<string, TransferCounterpart>()
  for (const row of rows) {
    if (row.type !== 'transfer' || !row.transfer_group_id) continue

    const group = legsByGroup.get(row.transfer_group_id)
    if (!group || group.length !== 2) continue

    const other = group.find((leg) => leg.id !== row.id)
    const own = group.find((leg) => leg.id === row.id)
    if (!other || !own || other.transfer_direction === own.transfer_direction) continue
    if (other.transfer_direction !== 'incoming' && other.transfer_direction !== 'outgoing') continue

    counterparts.set(row.id, {
      accountId: other.account_id,
      amountMinor: other.amount_minor,
      direction: other.transfer_direction,
    })
  }

  return counterparts
}

/**
 * Texto de la contraparte: `→ Cuenta USD · + USD 25` en la pata que sale y
 * `← Ahorros · − COP 100.000` en la que entra. Lo comparten Movimientos, la
 * tabla y las tarjetas del libro para que digan lo mismo.
 */
export function formatTransferCounterpart(
  counterpart: TransferCounterpart,
  account: Pick<Tables<'accounts'>, 'name' | 'currency_code'> | undefined,
  fallbackCurrency: string,
): string {
  const arrow = counterpart.direction === 'incoming' ? '→' : '←'
  const sign = counterpart.direction === 'incoming' ? '+' : '−'
  const amount = formatAmount(counterpart.amountMinor, account?.currency_code ?? fallbackCurrency)
  return `${arrow} ${account?.name ?? 'Cuenta eliminada'} · ${sign} ${amount}`
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
