import { z } from 'zod'

import { budgetAmountSchema } from '@/features/budgets/schemas'

import type { AllocationGroup } from './calculations/allocation'

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

/* -------------------------------------------------------------------------- */
/* Reparto 50/30/20                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Contrato del formulario del reparto.
 *
 * La tabla guarda puntos base —`percent_bp between 0 and 10000`— pero el
 * formulario trabaja en **porcentajes enteros**, y la conversión ocurre al
 * construir el payload. La diferencia es deliberada: con puntos base a la
 * vista, un usuario puede teclear 9.999 sin notarlo y el reparto queda a un
 * punto base de cuadrar; con porcentajes enteros, «suma 100» es una cuenta que
 * se hace de cabeza.
 *
 * Ese mismo motivo es el que descarta los decimales. Un tercio exacto no
 * existe en este modelo —33,33 % tres veces suman 99,99 %—, así que se rechaza
 * en vez de redondearse en silencio y dejar que el trigger diferido del
 * servidor rechace el guardado entero.
 */

/** Hasta tres dígitos, sin signo ni separadores: '0', '50', '100'. */
const PLAIN_PERCENT = /^\d{1,3}$/

/** Cualquier separador decimal, con o sin cifras detrás: '33,3', '33.'. */
const LOOKS_DECIMAL = /[.,]/

/**
 * Porcentaje de un grupo, tal como se teclea.
 *
 * Llega como texto y sale como entero, por el mismo motivo que
 * `budgetAmountSchema`: un campo numérico convertiría el vacío en 0, y aquí 0
 * es una decisión con significado —«a este grupo no le toca nada»— que no es
 * lo mismo que no haber escrito todavía.
 */
export const allocationPercentSchema = z
  .string()
  .trim()
  .superRefine((raw, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })

    if (raw === '') {
      fail('Escribe un porcentaje')
      return
    }

    if (raw.startsWith('-')) {
      fail('El porcentaje no puede ser negativo')
      return
    }

    if (LOOKS_DECIMAL.test(raw)) {
      fail('El porcentaje debe ser un número entero, sin decimales')
      return
    }

    if (!PLAIN_PERCENT.test(raw)) {
      fail('Escribe solo números, sin símbolos')
      return
    }

    if (Number(raw) > 100) {
      fail('El porcentaje no puede pasar de 100')
    }
  })
  .transform((raw) => Number(raw))

/** Mensaje único del total. Lo comparten el aviso en vivo y el rechazo al enviar. */
export const ALLOCATION_SUM_ERROR = 'Los porcentajes deben sumar exactamente 100 %.'

/**
 * Los cinco grupos y su total.
 *
 * El total se valida aquí y no solo en la interfaz porque es la regla que el
 * servidor comprueba al commit: sin ella, un reparto que no cuadra viajaría
 * hasta Postgres para volver como un error de trigger que el usuario no puede
 * interpretar.
 *
 * El error del total va a `root` y no a un grupo concreto: no sobra en
 * «Necesidades» ni falta en «Deuda», el problema es la suma.
 */
export const allocationFormSchema = z
  .object({
    needs: allocationPercentSchema,
    wants: allocationPercentSchema,
    savings: allocationPercentSchema,
    investment: allocationPercentSchema,
    debt: allocationPercentSchema,
  })
  .refine(
    (values) =>
      values.needs + values.wants + values.savings + values.investment + values.debt === 100,
    { message: ALLOCATION_SUM_ERROR, path: ['root'] },
  )

/** Valores ya validados: los cinco porcentajes son enteros y suman 100. */
export type AllocationFormValues = z.output<typeof allocationFormSchema>

/** Lo que maneja el formulario mientras se escribe: los cinco siguen siendo texto. */
export type AllocationFormInput = z.input<typeof allocationFormSchema>

/**
 * Punto de partida de un reparto nuevo: el 50/30/20 ampliado de FinTrack.
 *
 * Es un valor inicial editable, no un mandato financiero: los dos grupos en 0
 * están ahí para que el usuario los suba si su mes los necesita, y el reparto
 * se guarda con los cinco grupos aunque dos valgan cero.
 */
export const ALLOCATION_PRESET: Record<AllocationGroup, number> = {
  needs: 50,
  wants: 30,
  savings: 20,
  investment: 0,
  debt: 0,
}
