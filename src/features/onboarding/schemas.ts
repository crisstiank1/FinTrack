import { z } from 'zod'

export const welcomeStepSchema = z.object({
  displayName: z.string().min(1, 'Ingresa tu nombre').max(60, 'Máximo 60 caracteres'),
  currencyCode: z.string().min(1, 'Selecciona una moneda'),
})
export type WelcomeStepValues = z.infer<typeof welcomeStepSchema>

export const draftAccountSchema = z.object({
  name: z.string().min(1, 'Ingresa un nombre').max(60, 'Máximo 60 caracteres'),
  type: z.enum(['cash', 'checking', 'savings', 'digital_wallet', 'credit_card']),
  initialBalance: z.coerce
    .number()
    .int('Debe ser un número entero')
    .nonnegative('El saldo no puede ser negativo'),
})
export type DraftAccountValues = z.infer<typeof draftAccountSchema>

export const accountsStepSchema = z.object({
  accounts: z.array(draftAccountSchema).min(1, 'Agrega al menos una cuenta'),
})
export type AccountsStepValues = z.infer<typeof accountsStepSchema>
