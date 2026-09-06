import { z } from 'zod'

export const accountTypeOptions = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'checking', label: 'Cuenta corriente' },
  { value: 'savings', label: 'Cuenta de ahorros' },
  { value: 'digital_wallet', label: 'Billetera digital' },
  { value: 'credit_card', label: 'Tarjeta de crédito' },
] as const

export const accountSchema = z.object({
  name: z.string().min(1, 'Ingresa un nombre').max(60, 'Máximo 60 caracteres'),
  type: z.enum(['cash', 'checking', 'savings', 'digital_wallet', 'credit_card']),
  initialBalance: z.coerce
    .number()
    .int('El saldo debe ser un número entero')
    .nonnegative('El saldo no puede ser negativo'),
  currencyCode: z.string().min(1, 'Selecciona una moneda'),
  icon: z.string().min(1, 'Selecciona un ícono'),
  color: z.string().min(1, 'Selecciona un color'),
})

export type AccountFormValues = z.infer<typeof accountSchema>
