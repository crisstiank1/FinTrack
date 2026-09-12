/**
 * Decisiones de escritura del Plan mensual, sin ejecutar ninguna.
 *
 * Mismo papel que `budgets/mutations.ts`: qué filas hay que tocar se decide
 * aquí, en funciones puras y comprobables sin red; ejecutarlas es trabajo de
 * `api.ts`. Lo que vive en este archivo son las reglas del esquema que el
 * cliente tiene que respetar por adelantado, porque el servidor las rechaza
 * pero no las resuelve.
 */

import type { TablesInsert } from '@/types/database.types'

import { ALLOCATION_GROUPS, type AllocationGroup } from './calculations/allocation'

export interface PositionedRow {
  position: number
}

/**
 * Posición de la siguiente fuente de ingreso.
 *
 * `max(position) + 1`, **nunca `length`**: borrar una fuente del medio deja
 * huecos, y contar filas reutilizaría una posición ya ocupada, que es
 * exactamente lo que U8 —único `(plan_month_id, position)`— rechaza.
 *
 * Se calcula sobre las filas ya cargadas, así que puede estar obsoleta si otra
 * pestaña insertó mientras tanto. En ese caso el INSERT choca con un 23505 y la
 * mutación lo convierte en conflicto y refresca, en lugar de reintentar a
 * ciegas con la siguiente posición y arriesgarse a pisar otro cambio.
 */
export function nextIncomeSourcePosition(sources: readonly PositionedRow[]): number {
  if (sources.length === 0) return 0

  return sources.reduce((max, source) => Math.max(max, source.position), 0) + 1
}

export interface CategoryLinkDiff {
  toAdd: string[]
  toRemove: string[]
}

/**
 * Qué vínculos de categoría hay que crear y cuáles borrar.
 *
 * Solo las diferencias. Borrar todos los vínculos y recrearlos sería más corto
 * de escribir, pero generaría escrituras que no cambian nada y abriría una
 * ventana en la que la fuente se queda sin categorías: si el proceso muere ahí
 * —no hay transacción—, el usuario pierde vínculos que nunca pidió quitar.
 *
 * Se conserva el orden de `next` en `toAdd` y el de `current` en `toRemove`
 * para que el resultado sea determinista. Los duplicados se ignoran: un vínculo
 * se tiene o no se tiene.
 */
export function diffIncomeSourceCategories(
  current: readonly string[],
  next: readonly string[],
): CategoryLinkDiff {
  const currentSet = new Set(current)
  const nextSet = new Set(next)

  const toAdd: string[] = []
  for (const categoryId of nextSet) {
    if (!currentSet.has(categoryId)) toAdd.push(categoryId)
  }

  const toRemove: string[] = []
  for (const categoryId of currentSet) {
    if (!nextSet.has(categoryId)) toRemove.push(categoryId)
  }

  return { toAdd, toRemove }
}

/** Categoría vista desde el selector de fuentes de ingreso. */
export interface LinkableCategory {
  id: string
  type: string
  is_archived: boolean
}

/**
 * Categorías que se pueden ofrecer para vincular a una fuente.
 *
 * Tres filtros, y los tres evitan ofrecer algo que el servidor rechazaría:
 *
 * 1. **Solo de ingreso.** T2 rechaza cualquier otro tipo.
 * 2. **No archivadas.** T2 prohíbe *estrenar* un vínculo con una archivada.
 * 3. **No vinculadas a otra fuente del mismo mes.** U9 hace que una categoría
 *    de ingreso alimente una sola fuente, y esa regla es la que impide contar
 *    dos veces el mismo ingreso.
 *
 * `linkedElsewhere` son las categorías ocupadas por **otras** fuentes; las de
 * la fuente que se está editando no entran ahí, porque deben seguir
 * seleccionadas y poder desmarcarse.
 */
export function selectLinkableIncomeCategories<T extends LinkableCategory>(
  categories: readonly T[],
  linkedElsewhere: ReadonlySet<string>,
): T[] {
  return categories.filter(
    (category) =>
      category.type === 'income' && !category.is_archived && !linkedElsewhere.has(category.id),
  )
}

export interface IncomeSourceCategoryRow {
  plan_income_source_id: string
  category_id: string
}

/**
 * Categorías ocupadas por las **demás** fuentes del mes.
 *
 * Al crear una fuente nueva no hay ninguna excepción, así que `sourceId` puede
 * omitirse y entonces todas las categorías vinculadas cuentan como ocupadas.
 */
export function categoriesLinkedElsewhere(
  links: readonly IncomeSourceCategoryRow[],
  sourceId?: string,
): Set<string> {
  const occupied = new Set<string>()

  for (const link of links) {
    if (sourceId !== undefined && link.plan_income_source_id === sourceId) continue
    occupied.add(link.category_id)
  }

  return occupied
}

/** Categorías ya vinculadas a una fuente concreta. */
export function categoriesOfSource(
  links: readonly IncomeSourceCategoryRow[],
  sourceId: string,
): string[] {
  return links
    .filter((link) => link.plan_income_source_id === sourceId)
    .map((link) => link.category_id)
}

/* -------------------------------------------------------------------------- */
/* Reparto 50/30/20                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Columnas que resuelven el conflicto al editar el reparto.
 *
 * Es exactamente la restricción `plan_allocations_plan_month_id_budget_group_key`
 * —`unique (plan_month_id, budget_group)`—, ni una columna más: `user_id` no
 * forma parte de ella, y añadirlo haría que PostgREST buscara un índice único
 * que no existe. Vive aquí, junto a las filas que describe, para que las dos
 * decisiones se lean en el mismo sitio.
 */
export const ALLOCATION_CONFLICT_TARGET = 'plan_month_id,budget_group'

/** Porcentajes enteros por grupo, tal como salen del formulario. */
export type AllocationPercentInput = Record<AllocationGroup, number>

/**
 * Porcentajes enteros a puntos base: 50 % → 5000.
 *
 * Multiplicar por 100 y no dividir nada: la conversión solo va en este
 * sentido, así que ningún porcentaje entero puede producir puntos base
 * fraccionarios y la suma de 100 siempre da exactamente 10 000.
 */
export function toAllocationBasisPoints(
  percentages: AllocationPercentInput,
): Record<AllocationGroup, number> {
  const basisPoints = {} as Record<AllocationGroup, number>
  for (const group of ALLOCATION_GROUPS) basisPoints[group] = percentages[group] * 100
  return basisPoints
}

export interface AllocationRowsInput {
  userId: string
  planMonthId: string
  percentages: AllocationPercentInput
}

/**
 * Las cinco filas del reparto, siempre las cinco.
 *
 * Un grupo en 0 % también se escribe. La tabla admite que un mes no tenga
 * reparto —`check_plan_allocations_sum` se salta el mes sin filas—, así que
 * omitir un grupo en cero lo dejaría indistinguible de un reparto a medias, y
 * la interfaz tendría que adivinar si ese hueco es un cero o un dato que falta.
 * Con las cinco filas, el reparto guardado es siempre un conjunto completo.
 *
 * El orden es el de `ALLOCATION_GROUPS`, el mismo del desempate del reparto.
 * No cambia lo que la base acepta —`plan_allocations` no tiene `position`—,
 * pero hace que el payload sea reproducible y comparable en una prueba.
 */
export function buildAllocationRows({
  userId,
  planMonthId,
  percentages,
}: AllocationRowsInput): TablesInsert<'plan_allocations'>[] {
  const basisPoints = toAllocationBasisPoints(percentages)

  return ALLOCATION_GROUPS.map((group) => ({
    user_id: userId,
    plan_month_id: planMonthId,
    budget_group: group,
    percent_bp: basisPoints[group],
  }))
}
