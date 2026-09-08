import { z } from 'zod'

/**
 * Alcance de lo que se está guardando, en el vocabulario del formulario.
 * `template` y `exception` se traducen luego al `intent` de `planBudgetWrite`.
 */
export const budgetScopeOptions = [
  { value: 'template', label: 'Desde este mes en adelante' },
  { value: 'exception', label: 'Solo este mes' },
] as const

/** Solo dígitos: '1200000'. */
const PLAIN_AMOUNT = /^\d+$/

/**
 * Agrupado en miles al estilo es-CO: '1.200.000'. También se acepta el espacio
 * normal y el fino (U+00A0), que es lo que produce `Intl.NumberFormat` en
 * algunas configuraciones y lo que llega al pegar una cifra copiada.
 */
const GROUPED_AMOUNT = /^\d{1,3}(?:[.\u00A0 ]\d{3})+$/

/** Termina en separador decimal seguido de una o dos cifras: '1,5', '1.50'. */
const LOOKS_DECIMAL = /[.,]\d{1,2}$/

const GROUP_SEPARATORS = /[.\u00A0 ]/g

/**
 * Monto en unidades mínimas, tal como lo escribe una persona.
 *
 * Llega como texto y sale como entero, y esa asimetría es deliberada: si el
 * campo fuese numérico, un input vacío se convertiría en 0 sin que nadie lo
 * pidiera, y 0 es un valor **válido y con significado** en presupuestos —"esta
 * categoría no tiene presupuesto este periodo"—. Confundir "no escribí nada"
 * con "quiero cero" guardaría decisiones que el usuario nunca tomó.
 *
 * COP no tiene decimales (docs/02-base-de-datos.md: COP 15.000 se guarda como
 * 15000), así que los decimales se rechazan en vez de redondearse en silencio.
 */
export const budgetAmountSchema = z
  .string()
  .trim()
  .superRefine((raw, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })

    if (raw === '') {
      fail('Ingresa un monto')
      return
    }

    if (raw.startsWith('-')) {
      fail('El monto no puede ser negativo')
      return
    }

    // El orden importa: '1.500' es mil quinientos, pero '1.50' son decimales.
    // Por eso se comprueba primero si la cifra es una agrupación válida.
    if (!GROUPED_AMOUNT.test(raw) && LOOKS_DECIMAL.test(raw)) {
      fail('El monto debe ser un número entero, sin decimales')
      return
    }

    if (!PLAIN_AMOUNT.test(raw) && !GROUPED_AMOUNT.test(raw)) {
      fail('Ingresa un monto válido, solo números')
      return
    }

    if (!Number.isSafeInteger(Number(raw.replace(GROUP_SEPARATORS, '')))) {
      fail('El monto es demasiado grande')
    }
  })
  .transform((raw) => Number(raw.replace(GROUP_SEPARATORS, '')))

export const budgetSchema = z.object({
  amount: budgetAmountSchema,
  scope: z.enum(['template', 'exception']),
})

/** Valores ya validados: `amount` es un entero. */
export type BudgetFormValues = z.output<typeof budgetSchema>

/** Lo que maneja el formulario mientras se escribe: `amount` sigue siendo texto. */
export type BudgetFormInput = z.input<typeof budgetSchema>

/**
 * Advertencia previa a guardar un presupuesto de 0. No es un error: 0 es una
 * decisión legítima, pero su efecto no es evidente y conviene enunciarlo.
 */
export const ZERO_BUDGET_WARNING =
  'Un presupuesto de COP 0 significa que esta categoría no tendrá presupuesto en el periodo elegido.'
