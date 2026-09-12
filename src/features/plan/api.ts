import { monthRange } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

import { toPlanError } from './errors'
import type { PlanBalanceTransaction } from './read-model'

/**
 * Capa de datos del Plan mensual.
 *
 * Adaptador fino sobre Supabase, como `categories/api.ts`: aquí no hay reglas
 * de negocio, ni fórmulas, ni estrechamiento de tipos. Las filas salen tal
 * como llegan; interpretarlas es trabajo de `read-model.ts` y de
 * `calculations/`, y decidir qué escribir lo hace `mutations.ts`.
 *
 * Sobre `userId`: llega siempre desde la sesión autenticada (`useAuth`), nunca
 * de la URL ni de props. Es un **filtro de alcance y rendimiento** —evita
 * traer filas que después habría que descartar—, no un control de seguridad.
 * La frontera de seguridad son las políticas RLS de las seis tablas, que el
 * servidor aplica aunque este filtro faltase o fuese otro.
 *
 * **Las lecturas propagan el error crudo**, como en `categories`, `accounts` y
 * `transactions`: quien consulta solo necesita saber que falló. **Las
 * escrituras lo traducen** con `toPlanError`, porque ahí el usuario acaba de
 * hacer algo y necesita saber qué hacer ahora, y porque un mismo SQLSTATE
 * significa cosas distintas según la operación.
 *
 * Sin RPC, sin SQL arbitrario y sin recursos embebidos: `plan_lines` tiene
 * cuatro claves foráneas hacia `plan_months` y el puente tres hacia
 * `plan_income_sources`, así que PostgREST no puede inferir la relación y
 * habría que nombrar la constraint en el `select`. Una consulta que depende
 * del nombre de una constraint se rompe en silencio si una migración la
 * renombra.
 *
 * Las cinco tablas del plan se leen sin paginar: crecen como mucho decenas de
 * filas por mes, muy por debajo del corte de 1000 que PostgREST aplica por
 * defecto. La única lectura paginada es la del historial de saldos, al final
 * del archivo, que sí puede superarlo.
 */

/**
 * Cabecera del plan de un mes, o `null` si ese mes no tiene plan.
 *
 * `maybeSingle()` y no `single()`: las seis tablas nacen vacías y un mes sin
 * plan es el estado normal de la pantalla, no un error. `single()` devolvería
 * `PGRST116` en el caso más frecuente.
 *
 * El mes se compara contra el primer día derivado con `monthRange`, que
 * calcula en hora local. Construir la fecha con `toISOString()` desfasaría un
 * día para zonas horarias negativas y consultaría el mes equivocado.
 */
export async function fetchPlanMonth(
  userId: string,
  monthKey: string,
): Promise<Tables<'plan_months'> | null> {
  const { data, error } = await supabase
    .from('plan_months')
    .select('*')
    .eq('user_id', userId)
    .eq('period_month', monthRange(monthKey).start)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Porcentajes del reparto del mes.
 *
 * El orden por `budget_group` es solo para que la respuesta sea estable. El
 * orden con significado —`needs, wants, savings, investment, debt`, el del
 * desempate del reparto— lo pone `ALLOCATION_GROUPS` en la capa pura, no esta
 * consulta.
 */
export async function fetchPlanAllocations(
  userId: string,
  planMonthId: string,
): Promise<Tables<'plan_allocations'>[]> {
  const { data, error } = await supabase
    .from('plan_allocations')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_month_id', planMonthId)
    .order('budget_group', { ascending: true })

  if (error) throw error
  return data
}

/** Fuentes de ingreso planeadas del mes, en el orden que fijó el usuario. */
export async function fetchPlanIncomeSources(
  userId: string,
  planMonthId: string,
): Promise<Tables<'plan_income_sources'>[]> {
  const { data, error } = await supabase
    .from('plan_income_sources')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_month_id', planMonthId)
    .order('position', { ascending: true })

  if (error) throw error
  return data
}

/**
 * Puente entre fuentes de ingreso y categorías.
 *
 * Se filtra por `plan_month_id` directo y no por los `id` de las fuentes:
 * `plan_income_source_categories` lleva esa columna desnormalizada
 * precisamente para poder expresar el alcance del mes sin pasar por la tabla
 * de fuentes, y la clave foránea compuesta F4 garantiza su coherencia.
 */
export async function fetchPlanIncomeSourceCategories(
  userId: string,
  planMonthId: string,
): Promise<Tables<'plan_income_source_categories'>[]> {
  const { data, error } = await supabase
    .from('plan_income_source_categories')
    .select('*')
    .eq('user_id', userId)
    .eq('plan_month_id', planMonthId)
    .order('plan_income_source_id', { ascending: true })
    .order('category_id', { ascending: true })

  if (error) throw error
  return data
}

/**
 * Líneas del plan del mes: facturas, variables, ahorro e inversión.
 *
 * Se filtra por `period_month` y no por `plan_month_id`, así que esta lectura
 * **no necesita resolver antes la cabecera del mes**. No es un atajo: es para
 * lo que existe esa columna desnormalizada, y F7 la ata a
 * `plan_months (id, period_month)`, de modo que ambos filtros seleccionan
 * exactamente las mismas filas.
 *
 * `position` es un orden total dentro del mes por U12.
 */
export async function fetchPlanLines(
  userId: string,
  monthKey: string,
): Promise<Tables<'plan_lines'>[]> {
  const { data, error } = await supabase
    .from('plan_lines')
    .select('*')
    .eq('user_id', userId)
    .eq('period_month', monthRange(monthKey).start)
    .order('position', { ascending: true })

  if (error) throw error
  return data
}

/**
 * Clasificación de las categorías de gasto.
 *
 * Sin filtro de mes: una clasificación no pertenece a un mes, vale para todos.
 * Tampoco se filtran las categorías archivadas, que conservan su clasificación
 * y siguen haciendo falta para consultar meses cerrados.
 */
export async function fetchCategoryClassifications(
  userId: string,
): Promise<Tables<'category_classifications'>[]> {
  const { data, error } = await supabase
    .from('category_classifications')
    .select('*')
    .eq('user_id', userId)
    .order('category_id', { ascending: true })

  if (error) throw error
  return data
}

/**
 * PostgREST corta las respuestas en 1000 filas por defecto. El historial de
 * una cuenta puede superarlo, así que esta lectura pagina explícitamente.
 */
const HISTORY_PAGE_SIZE = 1000

/** Tope de seguridad: 50 páginas. Evita un bucle infinito si algo va mal. */
const HISTORY_MAX_PAGES = 50

/**
 * Las cuatro columnas que necesita `calculateBalanceForAccountType`, y ninguna
 * más: el historial completo de una cuenta con `select('*')` traería
 * descripciones, notas y `custom_fields` que nadie va a leer.
 */
const BALANCE_COLUMNS = 'account_id, amount_minor, type, transfer_direction'

/**
 * Historial completo de unas cuentas concretas, para `saldoEnAhorro`.
 *
 * Es la única lectura del Plan que mira más allá del mes, y es inevitable: el
 * saldo de una cuenta parte de su saldo inicial y acumula cada movimiento
 * posterior, así que no se puede calcular mirando solo el mes en pantalla
 * (docs/09-plan-mensual.md: «es un saldo acumulado, no un flujo del mes»).
 *
 * Acotada a `accountIds` en vez de reutilizar la descarga completa del
 * dashboard: aquí solo interesan las cuentas de ahorro e inversión, que son
 * unas pocas, y colgar `/plan` de aquella consulta lo haría depender de que el
 * dashboard se hubiera visitado antes.
 *
 * **Sin cuentas no hay consulta.** Devolver la colección vacía de inmediato
 * evita un viaje a la red cuyo resultado ya se conoce, y evita emitir un
 * `in('account_id', [])`.
 *
 * El orden es por `id` porque `range` necesita un orden **total y estable**
 * para que ninguna fila se repita o se pierda entre páginas. No se ordena por
 * fecha: un saldo no depende del orden en que se sumen sus movimientos, y `id`
 * ya es único.
 */
export async function fetchTransactionsByAccounts(
  userId: string,
  accountIds: readonly string[],
): Promise<PlanBalanceTransaction[]> {
  if (accountIds.length === 0) return []

  const all: PlanBalanceTransaction[] = []

  for (let page = 0; page < HISTORY_MAX_PAGES; page += 1) {
    const from = page * HISTORY_PAGE_SIZE

    const { data, error } = await supabase
      .from('transactions')
      .select(BALANCE_COLUMNS)
      .eq('user_id', userId)
      .in('account_id', [...accountIds])
      .order('id', { ascending: true })
      .range(from, from + HISTORY_PAGE_SIZE - 1)

    if (error) throw error

    all.push(...data)
    if (data.length < HISTORY_PAGE_SIZE) break
  }

  return all
}

/* -------------------------------------------------------------------------- */
/* Escrituras                                                                 */
/* -------------------------------------------------------------------------- */

/*
 * A diferencia de las lecturas, las escrituras no propagan el error crudo:
 * cada una sabe qué estaba haciendo y traduce con `toPlanError`, porque el
 * mismo SQLSTATE significa cosas distintas segun la operacion. Ver `errors.ts`.
 */

/**
 * Crea la cabecera del plan de un mes.
 *
 * No usa `upsert`: con `DO UPDATE` tocaria el `updated_at` de un mes existente
 * para fingir un cambio que no ocurrio, y con `DO NOTHING` no devolveria fila.
 * Si el mes ya existia, el 23505 sale de aqui como `month_conflict` y quien
 * llama lo resuelve releyendo.
 */
export async function createPlanMonth(
  userId: string,
  monthKey: string,
): Promise<Tables<'plan_months'>> {
  const { data, error } = await supabase
    .from('plan_months')
    .insert({ user_id: userId, period_month: monthRange(monthKey).start })
    .select()
    .single()

  if (error) throw toPlanError(error, 'create_plan_month')
  return data
}

export async function insertPlanIncomeSource(
  row: TablesInsert<'plan_income_sources'>,
): Promise<Tables<'plan_income_sources'>> {
  const { data, error } = await supabase.from('plan_income_sources').insert(row).select().single()

  if (error) throw toPlanError(error, 'save_income_source')
  return data
}

/**
 * Solo `name` y `planned_minor`. Ni `position` —reordenar necesita diferir U8,
 * que no se puede desde PostgREST— ni `plan_month_id`, que convertiria la fila
 * en otra distinta.
 */
export async function updatePlanIncomeSource(
  id: string,
  patch: Pick<TablesUpdate<'plan_income_sources'>, 'name' | 'planned_minor'>,
): Promise<Tables<'plan_income_sources'>> {
  const { data, error } = await supabase
    .from('plan_income_sources')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toPlanError(error, 'save_income_source')
  return data
}

/** Los vinculos de la fuente caen por cascada (F4); no hay que borrarlos antes. */
export async function deletePlanIncomeSource(id: string): Promise<void> {
  const { error } = await supabase.from('plan_income_sources').delete().eq('id', id)
  if (error) throw toPlanError(error, 'delete_income_source')
}

export async function insertPlanIncomeSourceCategories(
  rows: TablesInsert<'plan_income_source_categories'>[],
): Promise<void> {
  if (rows.length === 0) return

  const { error } = await supabase.from('plan_income_source_categories').insert(rows)
  if (error) throw toPlanError(error, 'save_income_source_categories')
}

export async function deletePlanIncomeSourceCategories(
  planIncomeSourceId: string,
  categoryIds: readonly string[],
): Promise<void> {
  if (categoryIds.length === 0) return

  const { error } = await supabase
    .from('plan_income_source_categories')
    .delete()
    .eq('plan_income_source_id', planIncomeSourceId)
    .in('category_id', [...categoryIds])

  if (error) throw toPlanError(error, 'save_income_source_categories')
}
