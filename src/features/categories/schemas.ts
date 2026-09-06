import { z } from 'zod'

export const categoryTypeOptions = [
  { value: 'income', label: 'Ingreso' },
  { value: 'expense', label: 'Gasto' },
] as const

export const categorySchema = z.object({
  name: z.string().min(1, 'Ingresa un nombre').max(60, 'Máximo 60 caracteres'),
  type: z.enum(['income', 'expense']),
  icon: z.string().min(1, 'Selecciona un ícono'),
  color: z.string().min(1, 'Selecciona un color'),
})

export type CategoryFormValues = z.infer<typeof categorySchema>
