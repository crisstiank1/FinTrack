import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

import { toBudgetError } from './errors'

/**
 * Capa de datos de presupuestos.
 *
 * Es un adaptador fino sobre Supabase, igual que `categories/api.ts`: aquí no
 * hay reglas de negocio. Qué fila escribir lo decide `planBudgetWrite`, que es
 * puro; qué significa un fallo lo decide `toBudgetError`, que también lo es.
 *
 * Sobre `userId`: llega siempre desde la sesión autenticada (`useAuth`), nunca
 * de la URL, de props ni de un formulario. Es un **filtro de alcance y
 * rendimiento** —evita traerse filas que después habría que descartar—, no un
 * control de seguridad. La frontera de seguridad son las políticas RLS de
 * `budgets`, que el servidor aplica aunque este filtro faltase o fuese otro.
 */

/** Traduce cualquier fallo a un error de dominio antes de que salga de aquí. */
async function withBudgetErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    throw toBudgetError(error)
  }
}

/**
 * Todos los presupuestos del usuario.
 *
 * El orden es solo para que los listados sean estables: `resolveBudget`
 * recorre y compara, no depende del orden de llegada. No lo "optimices"
 * asumiendo lo contrario.
 *
 * Sin paginación, a diferencia de `fetchAllTransactions`: aquí crece como
 * mucho una fila por categoría y mes editado (20 categorías durante tres años
 * ≈ 700 filas), por debajo del corte de 1000 que aplica PostgREST por defecto.
 */
export async function fetchBudgets(userId: string): Promise<Tables<'budgets'>[]> {
  return withBudgetErrors(async () => {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('user_id', userId)
      .order('category_id', { ascending: true })
      .order('effective_from', { ascending: false })

    if (error) throw error
    return data
  })
}

export async function insertBudget(row: TablesInsert<'budgets'>): Promise<Tables<'budgets'>> {
  return withBudgetErrors(async () => {
    const { data, error } = await supabase.from('budgets').insert(row).select().single()
    if (error) throw error
    return data
  })
}

/**
 * `patch` viene de `planBudgetWrite` y nunca incluye `category_id`,
 * `period_month` ni `effective_from`: conservar la categoría es lo que permite
 * corregir presupuestos de categorías ya archivadas.
 */
export async function updateBudget(
  id: string,
  patch: TablesUpdate<'budgets'>,
): Promise<Tables<'budgets'>> {
  return withBudgetErrors(async () => {
    const { data, error } = await supabase
      .from('budgets')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  })
}

export async function deleteBudget(id: string): Promise<void> {
  return withBudgetErrors(async () => {
    const { error } = await supabase.from('budgets').delete().eq('id', id)
    if (error) throw error
  })
}
