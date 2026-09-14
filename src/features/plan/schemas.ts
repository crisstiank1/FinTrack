import { z } from 'zod'

import { budgetAmountSchema } from '@/features/budgets/schemas'
import { monthOfIsoDate } from '@/lib/dates'

import type { AllocationGroup } from './calculations/allocation'
import { CATEGORY_LINE_KINDS } from './mutations'

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

/* -------------------------------------------------------------------------- */
/* Líneas de facturas y gastos variables                                      */
/* -------------------------------------------------------------------------- */

/**
 * Contrato del formulario de líneas medidas por categoría.
 *
 * **No hay campo de importe, y no es un olvido.** C7 —`(planned_minor is null)
 * = (category_id is not null)`— prohíbe que una línea por categoría lleve
 * cifra: la suya está en `budgets` y solo ahí. Un campo de monto aquí crearía
 * un segundo presupuesto por categoría, que es exactamente lo que el esquema
 * hace imposible de escribir.
 *
 * Tampoco hay campo «Actual»: ese valor no se guarda en ninguna tabla, se
 * calcula desde `transactions` al consultar.
 */

/** Nombre de la línea. Espejo del CHECK `length(btrim(name)) between 1 and 80`. */
export const planLineNameSchema = z
  .string()
  .trim()
  .min(1, 'Escribe un nombre para la línea')
  .max(80, 'El nombre no puede pasar de 80 caracteres')

/**
 * Esquema de una línea, parametrizado por el mes activo.
 *
 * El mes entra como argumento en vez de leerse de un reloj: la fecha esperada
 * se valida contra el mes que el usuario está planificando, no contra el mes en
 * curso, y así un plan de octubre editado en septiembre sigue aceptando fechas
 * de octubre.
 *
 * Dos reglas cruzadas, ambas espejo del esquema:
 *
 * - **C3** — `due_date` solo existe en una factura. En una variable el campo ni
 *   siquiera se registra; si llegara un valor, se rechaza aquí en vez de dejar
 *   que el CHECK lo devuelva como un error que nadie puede interpretar.
 * - **C4** — si existe, cae dentro del mes del plan.
 *
 * La fecha es **opcional en una factura**: C3 solo dice que no puede existir en
 * otro `kind`. Una factura sin fecha esperada es válida y significa «sé que
 * llega, todavía no sé cuándo».
 */
export function buildPlanLineSchema(monthKey: string) {
  return z
    .object({
      name: planLineNameSchema,
      kind: z.enum(CATEGORY_LINE_KINDS),
      categoryId: z.string().min(1, 'Elige una categoría'),
      /** Cadena vacía cuando no se escribió; se normaliza a `null` al salir. */
      dueDate: z.string().default(''),
    })
    .superRefine((values, ctx) => {
      if (values.dueDate === '') return

      if (values.kind !== 'bill') {
        ctx.addIssue({
          code: 'custom',
          path: ['dueDate'],
          message: 'Solo una factura puede tener fecha esperada.',
        })
        return
      }

      if (monthOfIsoDate(values.dueDate) !== monthKey) {
        ctx.addIssue({
          code: 'custom',
          path: ['dueDate'],
          message: 'La fecha esperada tiene que caer dentro del mes del plan.',
        })
      }
    })
    .transform((values) => ({
      name: values.name,
      kind: values.kind,
      categoryId: values.categoryId,
      dueDate: values.kind === 'bill' && values.dueDate !== '' ? values.dueDate : null,
    }))
}

/** Valores ya validados: `dueDate` es una fecha del mes o `null`. */
export type PlanLineFormValues = z.output<ReturnType<typeof buildPlanLineSchema>>

/** Lo que maneja el formulario mientras se escribe. */
export type PlanLineFormInput = z.input<ReturnType<typeof buildPlanLineSchema>>

/* -------------------------------------------------------------------------- */
/* Líneas de aporte a ahorro e inversión                                      */
/* -------------------------------------------------------------------------- */

/**
 * Contrato del formulario de aportes planeados.
 *
 * Aquí **sí hay importe**, y es obligatorio: un aporte se mide por cuenta, así
 * que su cifra planeada vive en la propia línea (C7). Reutiliza
 * `budgetAmountSchema`, igual que las fuentes de ingreso: el vacío es un error
 * y el 0 es un valor válido, «planeo aportar cero», que se muestra como COP 0.
 *
 * No hay tipo: lo fija el botón que abre el formulario. Tampoco fecha, que C3
 * reserva a las facturas.
 */
export const contributionLineSchema = z.object({
  name: planLineNameSchema,
  accountId: z.string().min(1, 'Elige una cuenta'),
  plannedAmount: budgetAmountSchema,
})

/** Valores ya validados: `plannedAmount` es un entero. */
export type ContributionLineFormValues = z.output<typeof contributionLineSchema>

/** Lo que maneja el formulario mientras se escribe: el importe sigue siendo texto. */
export type ContributionLineFormInput = z.input<typeof contributionLineSchema>
