import { z } from 'zod'

import { currentMonthKey, monthKeyInTimeZone } from '@/lib/dates'
import type { TablesInsert } from '@/types/database.types'

/**
 * Lógica pura de movimientos recurrentes.
 *
 * Una plantilla nunca crea un movimiento: se proyecta a borradores de Hojas
 * con `project_recurring_templates` y el usuario los registra a mano.
 */

export interface RecurringTemplateLike {
  id: string
  is_active: boolean
}

export interface ProjectionLike {
  template_id: string
  generated_for_month: string
}

/** Plantillas activas que todavía no tienen proyección para el mes. */
export function pendingTemplates<T extends RecurringTemplateLike>(
  templates: readonly T[],
  projections: readonly ProjectionLike[],
  monthKey: string,
): T[] {
  const projected = new Set(
    projections
      .filter((projection) => projection.generated_for_month === monthKey)
      .map((projection) => projection.template_id),
  )
  return templates.filter((template) => template.is_active && !projected.has(template.id))
}

/**
 * Mes actual del usuario: con la zona de su perfil si es válida, y si no la del
 * navegador, que es lo que ya usa el resto de la interfaz.
 */
export function userMonthKey(timeZone: string | null | undefined, now: Date = new Date()): string {
  if (timeZone) {
    try {
      return monthKeyInTimeZone(timeZone, now)
    } catch {
      // Zona corrupta: se cae en la del navegador, igual que el Dashboard.
    }
  }
  return currentMonthKey()
}

export interface MovementForTemplate {
  type: 'income' | 'expense'
  accountId: string
  categoryId: string
  /** Ya en unidades mínimas de la moneda de la cuenta. */
  amount: number
  /** 'YYYY-MM-DD'. */
  transactionDate: string
  description: string
}

/**
 * Plantilla equivalente a un movimiento recién creado. El día del mes sale de
 * la fecha elegida; si es 31, en los meses cortos se proyectará al último día.
 */
export function templateFromMovement(
  movement: MovementForTemplate,
): Omit<TablesInsert<'recurring_templates'>, 'user_id'> {
  const day = Number(movement.transactionDate.slice(8, 10))
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('La fecha del movimiento no es válida para repetirlo cada mes.')
  }

  return {
    type: movement.type,
    account_id: movement.accountId,
    category_id: movement.categoryId,
    amount_minor: movement.amount,
    description: movement.description.trim(),
    day_of_month: day,
  }
}

/* -------------------------------------------------------------------------- */
/* Resultado de la RPC                                                        */
/* -------------------------------------------------------------------------- */

export const PROJECTION_STATUSES = [
  'created',
  'skipped_existing',
  'skipped_archived_account',
  'skipped_archived_category',
  'invalid_template',
] as const

export type ProjectionStatus = (typeof PROJECTION_STATUSES)[number]

const projectionResultSchema = z.object({
  month: z.string(),
  sheet_id: z.string().nullable(),
  results: z.array(
    z.object({
      template_id: z.string(),
      status: z.enum(PROJECTION_STATUSES),
      draft_id: z.string().optional(),
      date: z.string().optional(),
    }),
  ),
})

export type ProjectionResult = z.infer<typeof projectionResultSchema>

/** Valida el JSON de `project_recurring_templates`. Una forma inesperada no pasa. */
export function parseProjectionResult(value: unknown): ProjectionResult {
  return projectionResultSchema.parse(value)
}

export interface ProjectionSummary {
  created: number
  existing: number
  skipped: number
}

export function summarizeProjection(result: ProjectionResult): ProjectionSummary {
  let created = 0
  let existing = 0
  let skipped = 0
  for (const item of result.results) {
    if (item.status === 'created') created += 1
    else if (item.status === 'skipped_existing') existing += 1
    else skipped += 1
  }
  return { created, existing, skipped }
}

const SKIP_TEXT: Record<Exclude<ProjectionStatus, 'created' | 'skipped_existing'>, string> = {
  skipped_archived_account: 'su cuenta está archivada',
  skipped_archived_category: 'su categoría está archivada',
  invalid_template: 'la plantilla ya no es válida',
}

export function skipReason(status: ProjectionStatus): string | null {
  return status === 'created' || status === 'skipped_existing' ? null : SKIP_TEXT[status]
}

const SKIP_ACTION: Record<Exclude<ProjectionStatus, 'created' | 'skipped_existing'>, string> = {
  skipped_archived_account: 'Reactiva la cuenta en Cuentas o desactiva la plantilla en Ajustes.',
  skipped_archived_category:
    'Reactiva la categoría en Ajustes, o desactiva la plantilla y crea otra con una categoría activa.',
  invalid_template: 'Elimina la plantilla en Ajustes y créala de nuevo desde un movimiento.',
}

/** Qué puede hacer el usuario con una plantilla omitida. */
export function skipAction(status: ProjectionStatus): string | null {
  return status === 'created' || status === 'skipped_existing' ? null : SKIP_ACTION[status]
}

/** «Proyectar 1 movimiento recurrente…» / «Proyectar 3 movimientos recurrentes…». */
export function projectLabel(count: number): string {
  return count === 1
    ? 'Proyectar 1 movimiento recurrente de este mes'
    : `Proyectar ${count} movimientos recurrentes de este mes`
}
