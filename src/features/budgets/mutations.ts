import { monthOfIsoDate, monthRange } from '@/lib/dates'
import type { TablesInsert, TablesUpdate } from '@/types/database.types'

import { BudgetError } from './errors'
import type { BudgetRow } from './resolution'

/**
 * Qué se está intentando escribir. Las tres intenciones producen filas
 * distintas y obedecen reglas distintas, así que se piden de forma explícita
 * en vez de deducirlas del mes o del importe:
 *
 * - `template`   versiona la plantilla desde `monthKey` en adelante.
 * - `exception`  fija el importe de un único mes, sin tocar ninguna plantilla.
 *                Un importe 0 es una excepción normal, no un caso aparte.
 * - `correction` corrige el importe de una fila histórica concreta.
 */
export type BudgetWriteIntent =
  | { kind: 'template'; categoryId: string; monthKey: string }
  | { kind: 'exception'; categoryId: string; monthKey: string }
  | { kind: 'correction'; budgetId: string }

export interface BudgetWriteInput {
  /**
   * Dueño de la fila. Procede siempre de la sesión autenticada; nunca de la
   * URL, de props ni de un formulario. RLS lo vuelve a comprobar en el
   * servidor: aquí solo se rellena la columna.
   */
  userId: string
  amountMinor: number
  intent: BudgetWriteIntent
  /**
   * Mes actual 'YYYY-MM'. Entra como dato en vez de leerse del reloj para que
   * esta función siga siendo pura y comprobable sin congelar el tiempo.
   */
  currentMonth: string
}

export type BudgetWritePlan =
  | { op: 'insert'; row: TablesInsert<'budgets'> }
  | { op: 'update'; id: string; patch: TablesUpdate<'budgets'> }

/**
 * Decide qué sentencia ejecutar para guardar un presupuesto, sin ejecutarla.
 *
 * Existe por dos motivos que no se pueden resolver en SQL desde el cliente:
 *
 * 1. **El índice único parcial.** `budgets_template_unique_idx` cubre
 *    `(user_id, category_id, effective_from) where period_month is null`.
 *    Editar dos veces la plantilla dentro del mismo mes reutiliza el mismo
 *    `effective_from` y un INSERT ciego chocaría con un 23505. Un `upsert`
 *    tampoco sirve: PostgREST no sabe expresar el predicado `where
 *    period_month is null` que PostgreSQL necesita para inferir un índice
 *    único **parcial** en el `ON CONFLICT`. Así que la elección entre INSERT y
 *    UPDATE se toma aquí, mirando las filas ya conocidas.
 *
 * 2. **La regla de los meses cerrados.** Una plantilla con `effective_from`
 *    anterior al mes actual reescribiría el progreso de meses ya cerrados, que
 *    es justo lo que promete el modelo histórico (docs/06-presupuestos.md). Ni
 *    el CHECK ni el trigger lo impiden, porque ninguno de los dos sabe en qué
 *    mes estamos: este invariante solo puede vivir en esta capa.
 *
 * `budgets` es la lista conocida del usuario, tal como la devuelve
 * `fetchBudgets`. Puede estar obsoleta —otra pestaña pudo escribir después—,
 * y por eso el plan resultante es una hipótesis: si el INSERT choca con un
 * 23505, la mutación lo convierte en un conflicto de dominio y refresca, en
 * lugar de reintentar como UPDATE y pisar el cambio ajeno.
 */
export function planBudgetWrite(budgets: BudgetRow[], input: BudgetWriteInput): BudgetWritePlan {
  const { userId, amountMinor, intent, currentMonth } = input

  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new BudgetError('invalid_amount')
  }

  // Corregir toca el importe y nada más. Conservar `category_id` no es un
  // detalle: es lo que hace que el trigger permita la operación aunque la
  // categoría se haya archivado o cambiado de tipo después. Cambiar
  // `period_month` o `effective_from` convertiría la fila en otra distinta y
  // podría chocar con un índice único o alterar meses ajenos. Por eso la
  // intención `correction` ni siquiera transporta una categoría: no hay forma
  // de expresar un cambio de categoría con esta API.
  if (intent.kind === 'correction') {
    const target = budgets.find((budget) => budget.id === intent.budgetId)
    if (!target) throw new BudgetError('row_missing')

    return { op: 'update', id: intent.budgetId, patch: { amount_minor: amountMinor } }
  }

  // Ambas fechas deben caer en el día 1: lo exigen los CHECK del esquema y,
  // sin ello, dos escrituras del mismo mes serían dos filas para los índices
  // únicos. Se reutiliza el helper de fechas en vez de componer la cadena.
  const monthStart = monthRange(intent.monthKey).start

  if (intent.kind === 'exception') {
    const existing = budgets.find(
      (budget) =>
        budget.category_id === intent.categoryId &&
        budget.period_month !== null &&
        monthOfIsoDate(budget.period_month) === intent.monthKey,
    )

    if (existing) {
      return { op: 'update', id: existing.id, patch: { amount_minor: amountMinor } }
    }

    return {
      op: 'insert',
      row: {
        user_id: userId,
        category_id: intent.categoryId,
        // `budgets_exception_dates_match_check` obliga a que coincidan.
        period_month: monthStart,
        effective_from: monthStart,
        amount_minor: amountMinor,
      },
    }
  }

  if (intent.monthKey < currentMonth) {
    throw new BudgetError('past_month_template')
  }

  const existing = budgets.find(
    (budget) =>
      budget.category_id === intent.categoryId &&
      budget.period_month === null &&
      monthOfIsoDate(budget.effective_from) === intent.monthKey,
  )

  // Reescribir la versión que ya empieza en ese mes no es retroactivo: esa
  // versión todavía no gobierna ningún mes cerrado, porque el mes en que
  // entra en vigor es el actual o uno futuro.
  if (existing) {
    return { op: 'update', id: existing.id, patch: { amount_minor: amountMinor } }
  }

  return {
    op: 'insert',
    row: {
      user_id: userId,
      category_id: intent.categoryId,
      period_month: null,
      effective_from: monthStart,
      amount_minor: amountMinor,
    },
  }
}
