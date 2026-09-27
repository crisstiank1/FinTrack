import { getCurrencyExponent } from '@/lib/currency'

import { parseAmount, type AmountErrorCode, type DecimalSeparator } from './amounts'
import { parseDate, type DateFormat } from './dates'

/**
 * Filas de un extracto → contrato interno de borrador.
 *
 * Nada de lo que sale de aquí es un movimiento: son candidatos a borrador de
 * Hojas. La moneda no se lee del CSV —FinTrack no la guarda en el movimiento—,
 * sale de la cuenta elegida, y el exponente de esa moneda decide la escala del
 * monto.
 *
 * El tipo (ingreso o gasto) se decide con una regla que el usuario confirmó,
 * nunca por intuición: columnas de débito y crédito separadas, o el signo del
 * monto con la convención elegida. Una fila que parece una transferencia entre
 * cuentas propias no se clasifica como ingreso ni como gasto por su cuenta:
 * queda «requiere revisión» y fuera de la importación salvo que el usuario la
 * incluya.
 */

export type AmountMode = 'signed' | 'debit_credit'
export type SignConvention = 'negative_is_expense' | 'positive_is_expense'
export type MovementType = 'income' | 'expense'

export interface ColumnMapping {
  date: number | null
  description: number | null
  amount: number | null
  debit: number | null
  credit: number | null
  /** Opcional y solo informativo: el saldo del banco no se publica. */
  balance: number | null
}

export const EMPTY_MAPPING: ColumnMapping = {
  date: null,
  description: null,
  amount: null,
  debit: null,
  credit: null,
  balance: null,
}

export interface ImportAccount {
  id: string
  currency_code: string
  is_archived: boolean
}

export interface ImportCategory {
  id: string
  type: string
  is_archived: boolean
}

export interface ImportOptions {
  mapping: ColumnMapping
  amountMode: AmountMode
  signConvention: SignConvention | null
  dateFormat: DateFormat | null
  decimalSeparator: DecimalSeparator | null
  account: ImportAccount | null
  /** Categoría opcional para todas las filas de cada tipo. Solo activas y del tipo correcto. */
  defaultCategories?: { expense?: ImportCategory | null; income?: ImportCategory | null }
}

export type ConfigIssue =
  | 'account_required'
  | 'account_archived'
  | 'date_column_required'
  | 'description_column_required'
  | 'amount_column_required'
  | 'debit_credit_columns_required'
  | 'date_format_required'
  | 'decimal_separator_required'
  | 'sign_convention_required'
  | 'expense_category_invalid'
  | 'income_category_invalid'

export interface RowIssue {
  field: 'transaction_date' | 'description' | 'amount_minor' | 'type'
  code:
    | 'required'
    | 'invalid_date'
    | AmountErrorCode
    | 'debit_and_credit'
    | 'description_truncated'
    | 'formula_like'
    | 'possible_transfer'
    | 'likely_duplicate'
    | 'possible_duplicate'
    | 'repeated_in_file'
}

export type RowStatus = 'valid' | 'needs_review' | 'invalid'

export interface ImportRow {
  /** Línea del archivo (la 1 es la de encabezados). */
  sourceLine: number
  date: string | null
  description: string
  amountMinor: number | null
  type: MovementType | null
  categoryId: string | null
  status: RowStatus
  errors: RowIssue[]
  warnings: RowIssue[]
}

/** Tope de `description` en `register_sheet_draft`. */
export const MAX_DESCRIPTION = 250

const FORMULA_START = /^[=+\-@\t\r]/

/**
 * Palabras con las que los bancos describen movimientos entre cuentas. Solo
 * disparan una revisión: «Transferencia a Juan» puede ser un gasto real.
 */
const TRANSFER_HINT =
  /\b(transferencia|transf\.?|trf|traslado|traspaso|pago\s+(de\s+)?(tarjeta|tc)|abono\s+(a\s+)?tarjeta|entre\s+cuentas)\b/i

export function validateOptions(options: ImportOptions): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const { mapping } = options

  if (!options.account) issues.push('account_required')
  else if (options.account.is_archived) issues.push('account_archived')

  if (mapping.date === null) issues.push('date_column_required')
  if (mapping.description === null) issues.push('description_column_required')
  if (options.amountMode === 'signed') {
    if (mapping.amount === null) issues.push('amount_column_required')
    if (options.signConvention === null) issues.push('sign_convention_required')
  } else if (mapping.debit === null || mapping.credit === null) {
    issues.push('debit_credit_columns_required')
  }
  if (options.dateFormat === null) issues.push('date_format_required')
  if (options.decimalSeparator === null) issues.push('decimal_separator_required')

  const expense = options.defaultCategories?.expense
  if (expense && (expense.is_archived || expense.type !== 'expense')) {
    issues.push('expense_category_invalid')
  }
  const income = options.defaultCategories?.income
  if (income && (income.is_archived || income.type !== 'income')) {
    issues.push('income_category_invalid')
  }

  return issues
}

/**
 * Texto de presentación de una descripción bancaria: sin caracteres de
 * control ni espacios repetidos. No se interpreta nada como HTML —React lo
 * escapa al pintarlo— y no se reescribe el contenido: una descripción que
 * empieza por «=» se guarda tal cual y se avisa, porque la defensa contra la
 * inyección de fórmulas está en la exportación (`toCsv` usa `escapeFormulae`).
 */
export function cleanDescription(raw: string): string {
  return (
    raw
      // Caracteres de control: invisibles en pantalla y sin sentido en un concepto.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * @param lines Línea del archivo de cada fila (`ParsedCsv.lines`). Sin ella se
 *   asume una fila por línea tras el encabezado.
 */
export function normalizeRows(
  rows: readonly string[][],
  options: ImportOptions,
  lines?: readonly number[],
): ImportRow[] {
  if (validateOptions(options).length > 0) return []

  const account = options.account!
  const exponent = getCurrencyExponent(account.currency_code)
  const { mapping } = options
  const cell = (row: readonly string[], index: number | null) =>
    index === null ? '' : (row[index] ?? '').trim()

  return rows.map((row, index) => {
    const errors: RowIssue[] = []
    const warnings: RowIssue[] = []

    // ---------- fecha ----------
    const rawDate = cell(row, mapping.date)
    let date: string | null = null
    if (rawDate === '') errors.push({ field: 'transaction_date', code: 'required' })
    else {
      date = parseDate(rawDate, options.dateFormat!)
      if (date === null) errors.push({ field: 'transaction_date', code: 'invalid_date' })
    }

    // ---------- descripción ----------
    const rawDescription = cell(row, mapping.description)
    let description = cleanDescription(rawDescription)
    if (description === '') errors.push({ field: 'description', code: 'required' })
    if (FORMULA_START.test(rawDescription.trimStart()) || FORMULA_START.test(description)) {
      warnings.push({ field: 'description', code: 'formula_like' })
    }
    if (description.length > MAX_DESCRIPTION) {
      description = description.slice(0, MAX_DESCRIPTION)
      warnings.push({ field: 'description', code: 'description_truncated' })
    }

    // ---------- monto y tipo ----------
    let amountMinor: number | null = null
    let type: MovementType | null = null
    const separator = options.decimalSeparator!

    if (options.amountMode === 'signed') {
      const parsed = parseAmount(cell(row, mapping.amount), separator, exponent)
      if (!parsed.ok) {
        errors.push({
          field: 'amount_minor',
          code: parsed.code === 'empty' ? 'required' : parsed.code,
        })
      } else {
        amountMinor = parsed.minor
        const expenseWhenNegative = options.signConvention === 'negative_is_expense'
        type = parsed.negative === expenseWhenNegative ? 'expense' : 'income'
      }
    } else {
      const debitText = cell(row, mapping.debit)
      const creditText = cell(row, mapping.credit)
      const debit = debitText === '' ? null : parseAmount(debitText, separator, exponent)
      const credit = creditText === '' ? null : parseAmount(creditText, separator, exponent)
      // Muchos extractos escriben 0 en la columna que no aplica.
      const debitUsed = debit !== null && !(debit.ok === false && debit.code === 'zero')
      const creditUsed = credit !== null && !(credit.ok === false && credit.code === 'zero')

      if (debitUsed && creditUsed) {
        errors.push({ field: 'amount_minor', code: 'debit_and_credit' })
      } else if (!debitUsed && !creditUsed) {
        errors.push({ field: 'amount_minor', code: 'required' })
      } else {
        const parsed = (debitUsed ? debit : credit)!
        if (!parsed.ok) errors.push({ field: 'amount_minor', code: parsed.code })
        else {
          amountMinor = parsed.minor
          type = debitUsed ? 'expense' : 'income'
        }
      }
    }

    if (TRANSFER_HINT.test(description)) {
      warnings.push({ field: 'type', code: 'possible_transfer' })
    }

    const category = type ? options.defaultCategories?.[type] : null

    return {
      sourceLine: lines?.[index] ?? index + 2,
      date,
      description,
      amountMinor,
      type,
      categoryId: category ? category.id : null,
      status: statusFor(errors, warnings),
      errors,
      warnings,
    }
  })
}

export function statusFor(errors: readonly RowIssue[], warnings: readonly RowIssue[]): RowStatus {
  if (errors.length > 0) return 'invalid'
  if (warnings.some((warning) => warning.code === 'possible_transfer')) return 'needs_review'
  return 'valid'
}

const ISSUE_TEXT: Record<RowIssue['code'], string> = {
  required: 'Falta el valor',
  invalid_date: 'Fecha que no encaja con el formato elegido',
  empty: 'Monto vacío',
  not_a_number: 'El monto no es un número',
  bad_grouping: 'Separadores de miles o decimales incoherentes',
  too_many_decimals: 'Más decimales de los que admite la moneda de la cuenta',
  too_large: 'Monto demasiado grande',
  zero: 'El monto es 0',
  debit_and_credit: 'La fila tiene débito y crédito a la vez',
  description_truncated: 'Descripción recortada a 250 caracteres',
  formula_like: 'Empieza como una fórmula de hoja de cálculo; se guardará como texto',
  possible_transfer:
    'Parece una transferencia entre tus cuentas. Regístrala como transferencia o inclúyela a mano',
  likely_duplicate: 'Ya existe un movimiento o borrador igual en esta cuenta',
  possible_duplicate: 'Hay un movimiento con la misma fecha y monto en esta cuenta',
  repeated_in_file: 'Otra fila del archivo es idéntica',
}

export function issueText(issue: RowIssue): string {
  return ISSUE_TEXT[issue.code]
}

const CONFIG_TEXT: Record<ConfigIssue, string> = {
  account_required: 'Elige la cuenta de FinTrack a la que pertenecen los movimientos.',
  account_archived: 'La cuenta está archivada. Elige una cuenta activa.',
  date_column_required: 'Indica qué columna tiene la fecha.',
  description_column_required: 'Indica qué columna tiene el concepto.',
  amount_column_required: 'Indica qué columna tiene el monto.',
  debit_credit_columns_required: 'Indica las columnas de débito y de crédito.',
  date_format_required: 'Confirma el formato de fecha.',
  decimal_separator_required: 'Confirma el separador decimal.',
  sign_convention_required: 'Confirma qué significa un monto negativo.',
  expense_category_invalid: 'La categoría de gastos no es válida o está archivada.',
  income_category_invalid: 'La categoría de ingresos no es válida o está archivada.',
}

export function configIssueText(issue: ConfigIssue): string {
  return CONFIG_TEXT[issue]
}
