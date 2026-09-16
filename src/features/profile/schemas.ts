import { z } from 'zod'

import { SELECTABLE_CURRENCY_CODES } from '@/lib/currency'

/**
 * Cambio de la moneda principal desde Ajustes (M12). Las mismas opciones que en
 * el onboarding: COP, USD y ARS. EUR y MXN son solo lectura y no se ofrecen.
 */
export const primaryCurrencySchema = z.object({
  currencyCode: z.enum(SELECTABLE_CURRENCY_CODES, 'Selecciona una moneda'),
})

export type PrimaryCurrencyValues = z.infer<typeof primaryCurrencySchema>
