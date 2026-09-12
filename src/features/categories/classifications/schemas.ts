import { z } from 'zod'

/**
 * Contrato de la clasificación de categorías de gasto.
 *
 * Una clasificación asigna una categoría a uno de los tres grupos del reparto
 * que se miden por gasto. `savings` e `investment` no están aquí y no es un
 * olvido: se miden por transferencias registradas hacia cuentas de ese tipo, y
 * admitirlos abriría una segunda vía de cálculo para el mismo importe
 * (docs/09-plan-mensual.md).
 *
 * El dato pertenece a la categoría, no al mes: no hay `plan_month_id` en la
 * tabla, así que clasificar cambia la lectura de todos los meses, cerrados
 * incluidos.
 */

/** Los tres grupos, en el orden en que se presentan. Espejo del CHECK C10. */
export const CLASSIFICATION_GROUPS = ['needs', 'wants', 'debt'] as const

export type ClassificationGroup = (typeof CLASSIFICATION_GROUPS)[number]

/**
 * Grupo presupuestario de una categoría.
 *
 * Enumeración cerrada y no texto libre, igual que el CHECK del esquema
 * `budget_group in ('needs', 'wants', 'debt')`. No hay valor por defecto: una
 * categoría sin clasificar es un estado legítimo y visible —la fila «Sin
 * clasificar» del reparto—, no un hueco que haya que rellenar con una
 * suposición.
 */
export const classificationGroupSchema = z.enum(CLASSIFICATION_GROUPS)

export function isClassificationGroup(value: string): value is ClassificationGroup {
  return classificationGroupSchema.safeParse(value).success
}
