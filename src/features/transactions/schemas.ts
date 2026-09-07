import { z } from 'zod'

import { todayIsoDate } from '@/lib/dates'

export const transactionSchema = z.object({
  type: z.enum(['income', 'expense']),
  accountId: z.string().min(1, 'Selecciona una cuenta'),
  categoryId: z.string().min(1, 'Selecciona una categoría'),
  amount: z.coerce.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a 0'),
  transactionDate: z.string().min(1, 'Selecciona una fecha'),
  description: z.string().min(1, 'Ingresa una descripción').max(120, 'Máximo 120 caracteres'),
  notes: z.string().max(500, 'Máximo 500 caracteres').optional(),
})
export type TransactionFormValues = z.infer<typeof transactionSchema>

export const transactionDefaultValues: Partial<TransactionFormValues> = {
  type: 'expense',
  amount: 0,
  transactionDate: todayIsoDate(),
  notes: '',
}

export const transferSchema = z
  .object({
    fromAccountId: z.string().min(1, 'Selecciona la cuenta de origen'),
    toAccountId: z.string().min(1, 'Selecciona la cuenta de destino'),
    amount: z.coerce.number().int('El monto debe ser un número entero').positive('El monto debe ser mayor a 0'),
    transactionDate: z.string().min(1, 'Selecciona una fecha'),
    description: z.string().min(1, 'Ingresa una descripción').max(120, 'Máximo 120 caracteres'),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: 'Elige dos cuentas distintas',
    path: ['toAccountId'],
  })
export type TransferFormValues = z.infer<typeof transferSchema>

export const transferDefaultValues: Partial<TransferFormValues> = {
  amount: 0,
  transactionDate: todayIsoDate(),
  description: 'Transferencia entre cuentas',
}
