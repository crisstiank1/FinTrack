import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Tables } from '@/types/database.types'

/**
 * PostgREST corta las respuestas en 1000 filas por defecto, así que pedir
 * "todo" en una sola llamada devolvería totales silenciosamente incorrectos
 * en cuanto un usuario supere ese número de movimientos. Paginamos.
 */
const PAGE_SIZE = 1000

/** Tope de seguridad: 50 páginas = 50.000 movimientos. Evita un bucle infinito. */
const MAX_PAGES = 50

/**
 * Cliente de Supabase que esta capa necesita. Se recibe como parámetro en vez
 * de importarse: `src/lib/supabase.ts` lee variables `VITE_` y construye el
 * cliente del navegador, de modo que importarlo aquí ataría la paginación a ese
 * único entorno.
 *
 * Con el cliente inyectado, la misma función sirve al navegador —que pasa su
 * cliente de siempre— y a cualquier otro contexto que construya el suyo con el
 * JWT del usuario. En ambos casos RLS se aplica igual, porque el filtro real lo
 * hacen las políticas y no este código.
 */
export type TransactionsClient = SupabaseClient<Database>

/**
 * Trae el historial completo de movimientos del usuario.
 *
 * El dashboard necesita todo el histórico porque el saldo consolidado parte
 * del saldo inicial de cada cuenta y acumula cada movimiento posterior: no se
 * puede calcular mirando solo el mes en pantalla. Se cachea una sola vez y el
 * filtrado por mes/cuenta ocurre en memoria, así navegar entre meses es
 * instantáneo y no dispara una consulta por mes.
 */
export async function fetchAllTransactions(
  client: TransactionsClient,
  userId: string,
): Promise<Tables<'transactions'>[]> {
  const all: Tables<'transactions'>[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE

    const { data, error } = await client
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false })
      // `id` desempata: sin un orden total y estable, dos filas con la misma
      // fecha podrían repetirse o perderse entre páginas.
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error

    all.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  return all
}
