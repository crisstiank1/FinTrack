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
 * Posición de la siguiente fila de una secuencia por mes.
 *
 * La comparten las fuentes de ingreso —U8, único `(plan_month_id, position)`—
 * y las líneas de plan —U12, la misma forma—. Genérica sobre `{ position }` a
 * propósito: la regla no depende de qué describa la fila, y dos copias con
 * nombres distintos acabarían divergiendo.
 *
 * `max(position) + 1`, **nunca `length`**: borrar una fila del medio deja
 * huecos, y contar filas reutilizaría una posición ya ocupada, que es
 * exactamente lo que esos índices rechazan.
 *
 * Quien llama debe pasar **todas** las filas de la secuencia. En `plan_lines`
 * eso incluye las de ahorro e inversión: U12 no distingue `kind`, así que la
 * secuencia es una sola por mes y calcularla sobre un subconjunto produciría
 * una posición ya ocupada.
 *
 * Se calcula sobre las filas ya cargadas, así que puede estar obsoleta si otra
 * pestaña insertó mientras tanto. En ese caso el INSERT choca con un 23505 y la
 * mutación lo convierte en conflicto y refresca, en lugar de reintentar a
 * ciegas con la siguiente posición y arriesgarse a pisar otro cambio.
 */
export function nextPosition(rows: readonly PositionedRow[]): number {
  if (rows.length === 0) return 0

  return rows.reduce((max, row) => Math.max(max, row.position), 0) + 1
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

/* -------------------------------------------------------------------------- */
/* Líneas de facturas y gastos variables                                      */
/* -------------------------------------------------------------------------- */

/** Los dos tipos de línea medidos por categoría. Espejo de C5. */
export const CATEGORY_LINE_KINDS = ['bill', 'variable'] as const

export type CategoryLineKind = (typeof CATEGORY_LINE_KINDS)[number]

/** Línea vista desde el selector de categorías. */
export interface LineCategoryRow {
  category_id: string | null
  id: string
}

/**
 * Categorías ya ocupadas por una línea del mes.
 *
 * U10 —único parcial `(plan_month_id, category_id)`— hace que una categoría
 * alimente una sola línea, y esa regla es la que mantiene disjuntos Facturas,
 * Variables y No planeado: sin ella, un mismo gasto podría contarse en dos
 * bloques del desglose.
 *
 * `exceptLineId` existe para editar sin que la línea se excluya a sí misma.
 * En esta entrega no se usa —la categoría no es editable—, pero la exclusión
 * pertenece a la regla, no al formulario que la consulta.
 */
export function usedLineCategoryIds(
  lines: readonly LineCategoryRow[],
  exceptLineId?: string,
): Set<string> {
  const used = new Set<string>()

  for (const line of lines) {
    if (line.category_id === null) continue
    if (exceptLineId !== undefined && line.id === exceptLineId) continue
    used.add(line.category_id)
  }

  return used
}

/** Categoría vista desde el formulario de líneas. */
export interface LinkableLineCategory {
  id: string
  type: string
  is_archived: boolean
}

/**
 * Categorías que se pueden ofrecer para una línea nueva.
 *
 * Tres filtros, y los tres evitan ofrecer algo que el servidor rechazaría:
 *
 * 1. **Solo de gasto.** T3 rechaza cualquier otro tipo.
 * 2. **No archivadas.** T3 prohíbe *estrenar* una línea sobre una archivada.
 *    Las líneas que ya apuntan a una archivada siguen existiendo y editándose;
 *    lo que no se puede es crear una nueva.
 * 3. **Libres este mes.** U10.
 */
export function selectAvailableLineCategories<T extends LinkableLineCategory>(
  categories: readonly T[],
  usedCategoryIds: ReadonlySet<string>,
): T[] {
  return categories.filter(
    (category) =>
      category.type === 'expense' && !category.is_archived && !usedCategoryIds.has(category.id),
  )
}

export interface PlanLineRowInput {
  userId: string
  planMonthId: string
  /** Primer día del mes activo, derivado con `monthRange`. */
  periodMonth: string
  kind: CategoryLineKind
  name: string
  categoryId: string
  /** Solo en facturas, y solo si el usuario la escribió. */
  dueDate?: string | null
  /** Todas las líneas del mes ya cargadas, para elegir la siguiente posición. */
  lines: readonly PositionedRow[]
}

/**
 * Fila de una línea medida por categoría.
 *
 * **`planned_minor` no se envía nunca.** C7 exige que sea nulo cuando hay
 * categoría, y omitirlo deja ese nulo sin que nadie pueda teclear una cifra
 * que competiría con la de `budgets`. Mandarlo explícitamente —aunque fuera
 * `null`— invitaría a que alguien lo rellenase algún día.
 *
 * `due_date` solo viaja en una factura. C3 la rechaza en una variable, y
 * enviarla como `null` sería inocuo pero dejaría en el payload un campo que ese
 * tipo de línea no tiene.
 */
export function buildPlanLineRow({
  userId,
  planMonthId,
  periodMonth,
  kind,
  name,
  categoryId,
  dueDate,
  lines,
}: PlanLineRowInput): TablesInsert<'plan_lines'> {
  const row: TablesInsert<'plan_lines'> = {
    user_id: userId,
    plan_month_id: planMonthId,
    period_month: periodMonth,
    kind,
    name,
    category_id: categoryId,
    position: nextPosition(lines),
  }

  if (kind === 'bill' && dueDate) row.due_date = dueDate

  return row
}

/* -------------------------------------------------------------------------- */
/* Líneas de aporte a ahorro e inversión                                      */
/* -------------------------------------------------------------------------- */

/** Los dos tipos de línea medidos por cuenta. Espejo de C6. */
export const CONTRIBUTION_LINE_KINDS = ['savings', 'investment'] as const

export type ContributionLineKind = (typeof CONTRIBUTION_LINE_KINDS)[number]

/** Línea vista desde el selector de cuentas. */
export interface LineAccountRow {
  account_id: string | null
  id: string
}

/**
 * Cuentas ya ocupadas por una línea de aporte del mes.
 *
 * U11 —único parcial `(plan_month_id, account_id)`— permite una sola línea por
 * cuenta al mes. Varias líneas del mismo tipo son posibles, pero cada una sobre
 * una cuenta distinta. `exceptLineId` sigue el mismo criterio que
 * `usedLineCategoryIds`.
 */
export function usedLineAccountIds(
  lines: readonly LineAccountRow[],
  exceptLineId?: string,
): Set<string> {
  const used = new Set<string>()

  for (const line of lines) {
    if (line.account_id === null) continue
    if (exceptLineId !== undefined && line.id === exceptLineId) continue
    used.add(line.account_id)
  }

  return used
}

/** Cuenta vista desde el formulario de aportes. */
export interface ContributionAccount {
  id: string
  type: string
  is_archived: boolean
  currency_code?: string
}

/**
 * Cuentas que se pueden ofrecer para un aporte nuevo de un tipo.
 *
 * Tres filtros evitan ofrecer algo que el servidor rechazaría:
 *
 * 1. **Del tipo del aporte.** T3 exige una cuenta `savings` para un aporte a
 *    ahorro y una `investment` para uno a inversión; el `kind` de la línea y
 *    el `type` de la cuenta comparten nombre.
 * 2. **No archivadas.** T3 prohíbe *estrenar* una línea sobre una archivada.
 * 3. **Libres este mes.** U11.
 *
 * Y uno más, si se indica la moneda del Plan: **en esa moneda** (M5).
 */
export function selectAvailableContributionAccounts<T extends ContributionAccount>(
  accounts: readonly T[],
  kind: ContributionLineKind,
  usedAccountIds: ReadonlySet<string>,
  /**
   * Moneda del Plan. Un aporte a una cuenta en otra moneda nunca se contaría
   * como real, así que no se ofrece.
   */
  currencyCode?: string,
): T[] {
  return accounts.filter(
    (account) =>
      account.type === kind &&
      !account.is_archived &&
      !usedAccountIds.has(account.id) &&
      (!currencyCode || account.currency_code === currencyCode),
  )
}

export interface ContributionLineRowInput {
  userId: string
  planMonthId: string
  /** Primer día del mes activo, derivado con `monthRange`. */
  periodMonth: string
  kind: ContributionLineKind
  name: string
  accountId: string
  plannedMinor: number
  /** Todas las líneas del mes ya cargadas, para elegir la siguiente posición. */
  lines: readonly PositionedRow[]
}

/**
 * Fila de una línea de aporte, medida por cuenta.
 *
 * Es el reverso exacto de `buildPlanLineRow`: aquí **`planned_minor` es
 * obligatorio** —C7 lo exige cuando no hay categoría, y es la única cifra que
 * tiene un aporte—, y no viajan ni `category_id` ni `due_date`, que C5 y C3
 * rechazarían en este tipo de línea. La posición se elige entre **todas** las
 * líneas del mes, porque U12 no distingue `kind`.
 */
export function buildContributionLineRow({
  userId,
  planMonthId,
  periodMonth,
  kind,
  name,
  accountId,
  plannedMinor,
  lines,
}: ContributionLineRowInput): TablesInsert<'plan_lines'> {
  return {
    user_id: userId,
    plan_month_id: planMonthId,
    period_month: periodMonth,
    kind,
    name,
    account_id: accountId,
    planned_minor: plannedMinor,
    position: nextPosition(lines),
  }
}
