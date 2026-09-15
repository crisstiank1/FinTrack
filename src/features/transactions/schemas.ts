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

const transferFieldsSchema = z.object({
  fromAccountId: z.string().min(1, 'Selecciona la cuenta de origen'),
  toAccountId: z.string().min(1, 'Selecciona la cuenta de destino'),
  /** Lo que sale de la cuenta de origen, en su moneda. */
  amount: z.coerce
    .number()
    .int('El monto debe ser un número entero')
    .positive('El monto debe ser mayor a 0'),
  /**
   * Lo que entra en la cuenta de destino, en su moneda. Solo se pide cuando las
   * dos cuentas tienen monedas distintas: FinTrack no convierte divisas.
   */
  receivedAmount: z
    .number()
    .int('El monto debe ser un número entero')
    .positive('El monto debe ser mayor a 0')
    .optional(),
  transactionDate: z.string().min(1, 'Selecciona una fecha'),
  description: z.string().min(1, 'Ingresa una descripción').max(120, 'Máximo 120 caracteres'),
})

/**
 * Esquema de una transferencia. Depende de la moneda de cada cuenta, así que se
 * construye con ellas:
 *
 * - **Misma moneda:** las dos patas llevan el mismo importe. Un monto recibido
 *   distinto se rechaza; una comisión se registra como gasto aparte.
 * - **Monedas distintas:** el monto recibido es obligatorio y cada pata guarda
 *   el suyo, sin convertir.
 *
 * La salida siempre trae `receivedAmount`: el importe de la pata entrante.
 */
export function createTransferSchema(currencyByAccountId: ReadonlyMap<string, string>) {
  return transferFieldsSchema
    .superRefine((data, ctx) => {
      if (data.fromAccountId === data.toAccountId) {
        ctx.addIssue({
          code: 'custom',
          message: 'Elige dos cuentas distintas',
          path: ['toAccountId'],
        })
        return
      }

      if (isCrossCurrencyTransfer(currencyByAccountId, data.fromAccountId, data.toAccountId)) {
        if (data.receivedAmount === undefined) {
          ctx.addIssue({
            code: 'custom',
            message: 'Ingresa el monto recibido',
            path: ['receivedAmount'],
          })
        }
      } else if (data.receivedAmount !== undefined && data.receivedAmount !== data.amount) {
        ctx.addIssue({
          code: 'custom',
          message: 'Con la misma moneda, el monto recibido debe ser igual al enviado',
          path: ['receivedAmount'],
        })
      }
    })
    .transform((data) => ({ ...data, receivedAmount: data.receivedAmount ?? data.amount }))
}

/**
 * Si origen y destino tienen monedas distintas. Mientras falte alguna de las
 * dos cuentas (o su moneda), se trata como misma moneda: un solo monto.
 */
export function isCrossCurrencyTransfer(
  currencyByAccountId: ReadonlyMap<string, string>,
  fromAccountId: string | undefined,
  toAccountId: string | undefined,
): boolean {
  const fromCurrency = fromAccountId ? currencyByAccountId.get(fromAccountId) : undefined
  const toCurrency = toAccountId ? currencyByAccountId.get(toAccountId) : undefined
  return Boolean(fromCurrency && toCurrency && fromCurrency !== toCurrency)
}

export type TransferFormInput = z.input<ReturnType<typeof createTransferSchema>>
export type TransferFormValues = z.output<ReturnType<typeof createTransferSchema>>

export const transferDefaultValues: Partial<TransferFormInput> = {
  amount: 0,
  transactionDate: todayIsoDate(),
  description: 'Transferencia entre cuentas',
}
