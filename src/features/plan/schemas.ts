import { z } from 'zod'

import { budgetAmountSchema } from '@/features/budgets/schemas'

/**
 * Contratos del formulario de fuentes de ingreso.
 *
 * El importe reutiliza `budgetAmountSchema` de `/budgets` en vez de copiarlo:
 * la regla es exactamente la misma —entero en unidades mínimas, tal como lo
 * teclea una persona, sin decimales, donde el vacío es un error y el `0` es una
 * decisión— y duplicarla haría que las dos copias divergieran con el tiempo. El
 * nombre delata su origen; extraerlo a un módulo común tocaría una feature
 * estable, así que queda pendiente para una tarea propia.
 *
 * Que `0` sea válido no es un detalle: es lo que permite distinguir «este mes
 * no tiene ninguna fuente de ingreso» —sin ingreso planeado— de «tengo una
 * fuente y todavía vale cero» —ingreso planeado de COP 0—. Sin esa diferencia,
 * «Por asignar» compararía contra un ingreso que nadie declaró.
 */

/**
 * Nombre de la fuente. Refleja el CHECK del esquema
 * `length(btrim(name)) between 1 and 80`: se recorta primero y se mide después,
 * para que un nombre de solo espacios sea un error aquí y no en el servidor.
 */
export const planIncomeSourceNameSchema = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre para la fuente')
  .max(80, 'El nombre no puede pasar de 80 caracteres')

export const planIncomeSourceSchema = z.object({
  name: planIncomeSourceNameSchema,
  plannedAmount: budgetAmountSchema,
  /**
   * Categorías de ingreso que alimentan esta fuente. Vacío es normal: vincular
   * es opcional, y sin vínculos la fuente sigue contando para el ingreso
   * planeado; lo único que no se puede calcular es su ingreso real por fuente.
   */
  categoryIds: z.array(z.string()).default([]),
})

/** Valores ya validados: `plannedAmount` es un entero. */
export type PlanIncomeSourceFormValues = z.output<typeof planIncomeSourceSchema>

/** Lo que maneja el formulario mientras se escribe: el importe sigue siendo texto. */
export type PlanIncomeSourceFormInput = z.input<typeof planIncomeSourceSchema>

/**
 * Aviso previo a guardar una fuente en 0. No es un error —es un estado
 * legítimo mientras no se sabe el monto— pero conviene decir qué implica.
 */
export const ZERO_INCOME_WARNING =
  'Una fuente de COP 0 cuenta como ingreso planeado de cero, no como ausencia de plan.'
