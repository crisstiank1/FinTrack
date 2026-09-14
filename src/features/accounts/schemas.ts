import { z } from 'zod'

import { CURRENCY_CODES } from '@/lib/currency'

/**
 * Dominio de `accounts.type`, en el mismo orden que `accounts_type_check`. Es
 * la única lista de tipos del cliente: los esquemas de cuentas y de onboarding
 * la comparten para que no puedan admitir conjuntos distintos.
 */
export const ACCOUNT_TYPES = [
  'cash',
  'checking',
  'savings',
  'digital_wallet',
  'credit_card',
  'investment',
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

// Un Record y no un array: si se añade un tipo sin etiqueta, falla la compilación.
const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Efectivo',
  checking: 'Cuenta corriente',
  savings: 'Cuenta de ahorros',
  digital_wallet: 'Billetera digital',
  credit_card: 'Tarjeta de crédito',
  investment: 'Cuenta de inversión',
}

export const accountTypeOptions = ACCOUNT_TYPES.map((value) => ({
  value,
  label: ACCOUNT_TYPE_LABELS[value],
}))

export const accountSchema = z.object({
  name: z.string().min(1, 'Ingresa un nombre').max(60, 'Máximo 60 caracteres'),
  type: z.enum(ACCOUNT_TYPES),
  initialBalance: z.coerce
    .number()
    .int('El saldo debe ser un número entero')
    .nonnegative('El saldo no puede ser negativo'),
  // Acepta el catálogo completo (EUR y MXN incluidos) para no romper la edición
  // de cuentas que ya están en esas monedas; el formulario no las ofrece al crear.
  currencyCode: z.enum(CURRENCY_CODES, 'Selecciona una moneda'),
  icon: z.string().min(1, 'Selecciona un ícono'),
  color: z.string().min(1, 'Selecciona un color'),
})

export type AccountFormValues = z.infer<typeof accountSchema>
