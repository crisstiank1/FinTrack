import { z } from 'zod'

import { welcomeStepSchema } from '@/features/onboarding/schemas'
import { SELECTABLE_CURRENCY_CODES } from '@/lib/currency'

/**
 * Cambio de la moneda principal desde Ajustes (M12). Las mismas opciones que en
 * el onboarding: COP, USD y ARS. EUR y MXN son solo lectura y no se ofrecen.
 */
export const primaryCurrencySchema = z.object({
  currencyCode: z.enum(SELECTABLE_CURRENCY_CODES, 'Selecciona una moneda'),
})

export type PrimaryCurrencyValues = z.infer<typeof primaryCurrencySchema>

/**
 * Cambio del nombre desde Ajustes. Reutiliza la regla del onboarding —entre 1 y
 * 60 caracteres, con los mismos mensajes— para que no haya dos criterios.
 */
export const displayNameSchema = z.object({
  displayName: welcomeStepSchema.shape.displayName,
})

export type DisplayNameValues = z.infer<typeof displayNameSchema>
