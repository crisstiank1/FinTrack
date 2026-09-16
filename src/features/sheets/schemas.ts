import { z } from 'zod'

/**
 * Reglas Fase 8.5 para la UI de Hojas.
 *
 * La validación de una fila (borrador) repite en cliente las comprobaciones que
 * `register_sheet_draft` hace en SQL: mismo orden de campos y mismo set de
 * códigos. Así la rejilla puede pintar errores por celda antes de registrar y el
 * registro solo envía filas que la RPC aceptará `status: 'registered'`.
 *
 * Ver `docs/08-pruebas-hojas.md` (casos 16-24) para los códigos exactos.
 */

const CUSTOM_COLUMN_ID_PATTERN = /^[a-z][a-z0-9_]*$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ALLOWED_TYPES = ['expense', 'income'] as const
const MAX_CUSTOM_COLUMNS = 20
const MAX_CUSTOM_TEXT = 1000
const MAX_NOTES = 1000
const MAX_DESCRIPTION = 250
const MAX_LABEL = 40
const MAX_NAME = 80

/** Los siete campos fijos de un movimiento, según `docs/07-hojas.md` §Campos. */
export const FIXED_CELL_FIELDS = [
  'transaction_date',
  'description',
  'account_id',
  'category_id',
  'type',
  'amount_minor',
  'notes',
] as const

export type FixedCellField = (typeof FIXED_CELL_FIELDS)[number]

/** Valores de una fila, indexados por el id de la columna (los 7 fijos + las propias). */
export type DraftCells = Record<string, string>

export interface SheetColumn {
  id: string
  label: string
  type: 'text'
  position: number
}

export const sheetNameSchema = z
  .string()
  .trim()
  .min(1, 'Ingresa el nombre de la hoja')
  .max(MAX_NAME, `Máximo ${MAX_NAME} caracteres`)

const sheetColumnBaseSchema = z.object({
  id: z.string(),
  label: z
    .string()
    .trim()
    .min(1, 'Ingresa la etiqueta')
    .max(MAX_LABEL, `Máximo ${MAX_LABEL} caracteres`),
  type: z.literal('text'),
  position: z.number().int().nonnegative(),
})

/**
 * Valida la definición de columnas propias antes de guardarla:
 * - ids en minúsculas/slug estables (no cambian al renombrar),
 * - max 20 columnas,
 * - ids únicos y sin colisionar con los 7 campos fijos,
 * - posiciones contiguas 0..n-1.
 */
export const sheetColumnsSchema = z
  .array(sheetColumnBaseSchema)
  .max(MAX_CUSTOM_COLUMNS, `Máximo ${MAX_CUSTOM_COLUMNS} columnas propias`)
  .superRefine((columns, ctx) => {
    const seen = new Set<string>()
    columns.forEach((column, index) => {
      if (!CUSTOM_COLUMN_ID_PATTERN.test(column.id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Usa minúsculas, números y guion bajo, empezando por una letra',
          path: [index, 'id'],
        })
      }
      if ((FIXED_CELL_FIELDS as readonly string[]).includes(column.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `«${column.id}» es un campo fijo del movimiento`,
          path: [index, 'id'],
        })
      }
      if (seen.has(column.id)) {
        ctx.addIssue({ code: 'custom', message: 'El id ya está en uso', path: [index, 'id'] })
      }
      seen.add(column.id)
    })

    const positions = columns.map((column) => column.position).sort((a, b) => a - b)
    const contiguous = positions.every((position, index) => position === index)
    if (!contiguous) {
      ctx.addIssue({
        code: 'custom',
        message: 'Las columnas deben ocupar posiciones 0, 1, 2, … sin huecos ni repetidas',
        path: [],
      })
    }
  })

/** Valida solo los ids de columnas propias al editar una fila (para el slug del id). */
export function isValidCustomColumnId(value: string): boolean {
  return CUSTOM_COLUMN_ID_PATTERN.test(value)
}

export interface DraftRowValidationContext {
  /** Ids de las cuentas del usuario (incluye archivadas: siguen existiendo). */
  accountIds: ReadonlySet<string>
  /** Categorías del usuario por id, con su tipo para el chequeo de coherencia. */
  categoriesById: ReadonlyMap<string, { id: string; type: string }>
}

/** Un error de validación: campo (`custom_fields.<id>` para las propias) y código. */
export interface FieldError {
  field: string
  code: string
}

function isValidIsoDate(value: string): boolean {
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  )
}

/**
 * Valida una fila como lo haría `register_sheet_draft`. Devuelve el mismo set de
 * códigos y en el mismo orden de emisión que la RPC (docs/07 §Validación).
 */
export function validateDraftRow(
  cells: DraftCells,
  columnDefs: readonly SheetColumn[],
  ctx: DraftRowValidationContext,
): FieldError[] {
  const errors: FieldError[] = []
  const add = (field: string, code: string) => errors.push({ field, code })

  const transactionDate = (cells.transaction_date ?? '').trim()
  if (!transactionDate) add('transaction_date', 'required')
  else if (!isValidIsoDate(transactionDate)) add('transaction_date', 'invalid_date')

  const description = (cells.description ?? '').trim()
  if (!description) add('description', 'required')
  else if (description.length > MAX_DESCRIPTION) add('description', 'description_too_long')

  const notes = (cells.notes ?? '').trim()
  if (notes.length > MAX_NOTES) add('notes', 'notes_too_long')

  const type = (cells.type ?? '').trim()
  if (!type) add('type', 'required')
  else if (type === 'transfer') add('type', 'transfer_not_allowed')
  else if (!(ALLOWED_TYPES as readonly string[]).includes(type)) add('type', 'invalid_type')

  const accountId = (cells.account_id ?? '').trim()
  if (!accountId) add('account_id', 'required')
  else if (!UUID_PATTERN.test(accountId)) add('account_id', 'invalid_uuid')
  else if (!ctx.accountIds.has(accountId)) add('account_id', 'account_not_found')

  const categoryId = (cells.category_id ?? '').trim()
  if (!categoryId) add('category_id', 'required')
  else if (!UUID_PATTERN.test(categoryId)) add('category_id', 'invalid_uuid')
  else {
    const category = ctx.categoriesById.get(categoryId)
    if (!category) add('category_id', 'category_not_found')
    else if (
      (type === 'income' || type === 'expense') &&
      (ALLOWED_TYPES as readonly string[]).includes(type) &&
      category.type !== type
    ) {
      add('category_id', 'type_mismatch')
    }
  }

  const amount = (cells.amount_minor ?? '').trim()
  if (!amount) add('amount_minor', 'required')
  else if (!/^-?[0-9]+$/.test(amount)) add('amount_minor', 'invalid_amount')
  else {
    const numeric = Number(amount)
    if (!Number.isSafeInteger(numeric)) {
      add('amount_minor', 'invalid_amount')
    } else if (numeric <= 0) {
      add('amount_minor', 'not_positive')
    }
  }

  for (const column of columnDefs) {
    const value = (cells[column.id] ?? '').trim()
    if (value.length > MAX_CUSTOM_TEXT) add(`custom_fields.${column.id}`, 'custom_field_too_long')
  }

  return errors
}

const ERROR_TEXT: Record<string, string> = {
  'transaction_date.required': 'Ingresa la fecha',
  'transaction_date.invalid_date': 'Fecha inválida (usa año-mes-día)',
  'description.required': 'Ingresa una descripción',
  'description.description_too_long': 'Máximo 250 caracteres',
  'notes.notes_too_long': 'Máximo 1000 caracteres',
  'type.required': 'Elige Gasto o Ingreso',
  'type.invalid_type': 'Tipo inválido',
  'type.transfer_not_allowed': 'Las transferencias no se registran desde una hoja',
  'account_id.required': 'Elige una cuenta',
  'account_id.invalid_uuid': 'Cuenta inválida',
  'account_id.account_not_found': 'La cuenta ya no existe',
  'category_id.required': 'Elige una categoría',
  'category_id.invalid_uuid': 'Categoría inválida',
  'category_id.category_not_found': 'La categoría ya no existe',
  'category_id.type_mismatch': 'La categoría no coincide con el tipo',
  'amount_minor.required': 'Ingresa el monto',
  'amount_minor.invalid_amount': 'Monto inválido',
  'amount_minor.not_positive': 'El monto debe ser mayor a 0',
}

/** Traduce un código de la RPC (o de la validación local) a un texto de interfaz. */
export function sheetErrorText(field: string, code: string): string {
  return ERROR_TEXT[`${field}.${code}`] ?? `Error en la celda «${field}» (${code})`
}

export type RegisterDraftResponse =
  | { status: 'registered'; draft_id: string; transaction_id: string }
  | { status: 'invalid'; draft_id: string; errors: FieldError[] }
  | { status: 'not_found'; draft_id: string }

const registerDraftResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('registered'),
    draft_id: z.string(),
    transaction_id: z.string(),
  }),
  z.object({
    status: z.literal('invalid'),
    draft_id: z.string(),
    errors: z.array(z.object({ field: z.string(), code: z.string() })),
  }),
  z.object({ status: z.literal('not_found'), draft_id: z.string() }),
])

/**
 * Razona el JSON que devuelve `register_sheet_draft`. La RPC solo devuelve en
 * 2xx el unión `registered | invalid | not_found`; cualquier otra forma (o una
 * excepción PostgreSQL que llega como error de `supabase.rpc`) no debe pasar.
 */
export function parseRegisterDraftResponse(value: unknown): RegisterDraftResponse {
  return registerDraftResponseSchema.parse(value)
}
