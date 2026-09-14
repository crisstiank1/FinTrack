import { sortCurrencyCodes } from '@/lib/currency'
import { supabase } from '@/lib/supabase'
import type { Tables } from '@/types/database.types'

export interface LedgerFilters {
  /** Búsqueda por descripción. */
  search?: string
  accountId?: string
  categoryId?: string
  type?: 'income' | 'expense' | 'transfer'
  /** Rango de fechas inclusivo, en formato YYYY-MM-DD. */
  dateFrom?: string
  dateTo?: string
}

export type LedgerSortField = 'transaction_date' | 'description' | 'amount_minor'

export interface LedgerSort {
  field: LedgerSortField
  direction: 'asc' | 'desc'
}

export interface LedgerPage {
  rows: Tables<'transactions'>[]
  /** Total de filas que cumplen los filtros, no las de esta página. */
  totalCount: number
}

/** Suma de un tipo de movimiento en una cuenta. */
export interface LedgerAccountTotal {
  type: string
  accountId: string
  totalMinor: number
}

export interface LedgerTotals {
  /**
   * Sumas por tipo y cuenta, no por tipo a secas: la moneda la define la
   * cuenta, y agrupar solo por tipo mezclaría monedas en un mismo número.
   */
  byAccount: LedgerAccountTotal[]
  count: number
}

/** Resumen del libro en una sola moneda. */
export interface LedgerCurrencyTotals {
  currencyCode: string
  incomeMinor: number
  expenseMinor: number
  /** Ingresos menos gastos. Las transferencias no entran. */
  balanceMinor: number
  transferMinor: number
}

/** Tope de seguridad para la exportación: 50 páginas de 1000 filas. */
const EXPORT_PAGE_SIZE = 1000
const EXPORT_MAX_PAGES = 50

/**
 * Neutraliza los comodines de SQL LIKE (`%` y `_`) para que un usuario que
 * busque "50%" encuentre "50%" y no "50" seguido de cualquier cosa.
 *
 * `*` se deja pasar a propósito: PostgREST lo traduce a `%`, así que funciona
 * como comodín explícito para quien lo necesite.
 */
export function escapeSearchTerm(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`)
}

/**
 * Vista mínima del constructor de consultas de PostgREST.
 *
 * Sus tipos reales son genéricos sobre la tabla y el `select`, y no se dejan
 * abstraer sin reescribir toda esa maquinaria. Se estrecha a esta forma dentro
 * de `applyFilters` y se devuelve al tipo original al salir, así los sitios de
 * llamada conservan el tipado completo de `.order()`, `.range()` y del `data`.
 */
interface FilterableQuery {
  eq(column: string, value: string): FilterableQuery
  gte(column: string, value: string): FilterableQuery
  lte(column: string, value: string): FilterableQuery
  ilike(column: string, pattern: string): FilterableQuery
}

/**
 * Aplica el alcance del usuario y los filtros a cualquier consulta sobre
 * `transactions`. Un solo lugar para que la tabla, los totales y la
 * exportación no puedan divergir en lo que consideran "filtrado".
 */
function applyFilters<T>(query: T, userId: string, filters: LedgerFilters): T {
  let scoped = (query as FilterableQuery).eq('user_id', userId)

  const search = filters.search?.trim()
  if (search) scoped = scoped.ilike('description', `%${escapeSearchTerm(search)}%`)
  if (filters.accountId) scoped = scoped.eq('account_id', filters.accountId)
  if (filters.categoryId) scoped = scoped.eq('category_id', filters.categoryId)
  if (filters.type) scoped = scoped.eq('type', filters.type)
  if (filters.dateFrom) scoped = scoped.gte('transaction_date', filters.dateFrom)
  if (filters.dateTo) scoped = scoped.lte('transaction_date', filters.dateTo)

  return scoped as T
}

/**
 * Una página del libro. El conteo total lo calcula PostgreSQL (`count: exact`),
 * así que paginar 50.000 movimientos sigue trayendo solo `pageSize` filas.
 */
export async function fetchLedgerPage(
  userId: string,
  filters: LedgerFilters,
  sort: LedgerSort,
  pageIndex: number,
  pageSize: number,
): Promise<LedgerPage> {
  const from = pageIndex * pageSize

  const { data, error, count } = await applyFilters(
    supabase.from('transactions').select('*', { count: 'exact' }),
    userId,
    filters,
  )
    .order(sort.field, { ascending: sort.direction === 'asc' })
    // Desempate estable: sin un orden total, dos filas con la misma fecha
    // podrían repetirse o desaparecer entre páginas.
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1)

  if (error) throw error
  return { rows: data ?? [], totalCount: count ?? 0 }
}

interface AggregateRow {
  type: string
  account_id: string
  total: number | null
}

/**
 * Resumen del conjunto filtrado completo.
 *
 * Lo suma PostgreSQL agrupando por tipo y cuenta, así que devuelve como mucho
 * tres filas por cuenta sin importar cuántos movimientos haya detrás. La moneda
 * se asigna después con `groupLedgerTotalsByCurrency`. Los tipos generados de
 * Supabase no modelan funciones de agregación, de ahí el cast.
 */
export async function fetchLedgerTotals(
  userId: string,
  filters: LedgerFilters,
): Promise<LedgerTotals> {
  const { data, error, count } = await applyFilters(
    supabase
      .from('transactions')
      .select('type, account_id, total:amount_minor.sum()', { count: 'exact' }),
    userId,
    filters,
  )

  if (error) throw error

  const rows = (data ?? []) as unknown as AggregateRow[]

  return {
    byAccount: rows.map((row) => ({
      type: row.type,
      accountId: row.account_id,
      totalMinor: row.total ?? 0,
    })),
    count: count ?? 0,
  }
}

/**
 * Reparte los totales por moneda, con la principal primero.
 *
 * Solo aparecen las monedas con movimientos en el conjunto filtrado. Una cuenta
 * que ya no está en `currencyByAccountId` cae en `fallbackCurrency`.
 */
export function groupLedgerTotalsByCurrency(
  totals: LedgerTotals,
  currencyByAccountId: ReadonlyMap<string, string>,
  fallbackCurrency: string,
  primaryCode?: string | null,
): LedgerCurrencyTotals[] {
  const byCurrency = new Map<string, LedgerCurrencyTotals>()

  for (const row of totals.byAccount) {
    const currencyCode = currencyByAccountId.get(row.accountId) ?? fallbackCurrency
    const entry = byCurrency.get(currencyCode) ?? {
      currencyCode,
      incomeMinor: 0,
      expenseMinor: 0,
      balanceMinor: 0,
      transferMinor: 0,
    }

    if (row.type === 'income') entry.incomeMinor += row.totalMinor
    if (row.type === 'expense') entry.expenseMinor += row.totalMinor
    if (row.type === 'transfer') entry.transferMinor += row.totalMinor
    entry.balanceMinor = entry.incomeMinor - entry.expenseMinor

    byCurrency.set(currencyCode, entry)
  }

  return sortCurrencyCodes(byCurrency.keys(), primaryCode).map((code) => byCurrency.get(code)!)
}

/**
 * Todas las filas que cumplen los filtros, para exportar a CSV.
 *
 * Es la única operación del libro que recorre el conjunto completo, y solo
 * ocurre cuando el usuario pide la descarga explícitamente.
 */
export async function fetchLedgerForExport(
  userId: string,
  filters: LedgerFilters,
  sort: LedgerSort,
): Promise<Tables<'transactions'>[]> {
  const all: Tables<'transactions'>[] = []

  for (let page = 0; page < EXPORT_MAX_PAGES; page += 1) {
    const from = page * EXPORT_PAGE_SIZE

    const { data, error } = await applyFilters(
      supabase.from('transactions').select('*'),
      userId,
      filters,
    )
      .order(sort.field, { ascending: sort.direction === 'asc' })
      .order('id', { ascending: false })
      .range(from, from + EXPORT_PAGE_SIZE - 1)

    if (error) throw error

    all.push(...(data ?? []))
    if (!data || data.length < EXPORT_PAGE_SIZE) break
  }

  return all
}
