import { statusFor, type ImportRow, type RowIssue } from './normalize'

/**
 * Detección prudente de duplicados.
 *
 * Nunca bloquea: dos cafés iguales el mismo día son dos movimientos reales. Lo
 * que hace es avisar, y en el caso fuerte —misma cuenta, fecha, monto, tipo y
 * descripción que algo ya registrado o ya en borradores— proponer dejar la
 * fila fuera. La decisión final es del usuario.
 */

export interface ExistingMovement {
  account_id: string
  transaction_date: string
  amount_minor: number
  type: string
  description: string | null
}

/** Minúsculas, sin tildes ni signos, espacios simples. */
export function normalizeForMatch(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function baseKey(date: string, amount: number, type: string): string {
  return `${date}|${amount}|${type}`
}

export function markDuplicates(
  rows: readonly ImportRow[],
  accountId: string,
  existing: readonly ExistingMovement[],
): ImportRow[] {
  const strong = new Set<string>()
  const weak = new Set<string>()
  for (const movement of existing) {
    if (movement.account_id !== accountId) continue
    const key = baseKey(movement.transaction_date, movement.amount_minor, movement.type)
    weak.add(key)
    strong.add(`${key}|${normalizeForMatch(movement.description)}`)
  }

  const seenInFile = new Set<string>()

  return rows.map((row) => {
    if (row.date === null || row.amountMinor === null || row.type === null) return row

    const key = baseKey(row.date, row.amountMinor, row.type)
    const full = `${key}|${normalizeForMatch(row.description)}`
    const added: RowIssue[] = []

    if (strong.has(full)) added.push({ field: 'type', code: 'likely_duplicate' })
    else if (weak.has(key)) added.push({ field: 'type', code: 'possible_duplicate' })

    if (seenInFile.has(full)) added.push({ field: 'type', code: 'repeated_in_file' })
    seenInFile.add(full)

    if (added.length === 0) return row
    const warnings = [...row.warnings, ...added]
    return { ...row, warnings, status: statusFor(row.errors, warnings) }
  })
}

/**
 * Si la fila entra en la importación por defecto.
 *
 * Entran las válidas que no son un duplicado probable. Las que requieren
 * revisión y los duplicados probables empiezan fuera, pero el usuario puede
 * incluirlos. Las inválidas no se pueden incluir.
 */
export function includedByDefault(row: ImportRow): boolean {
  return (
    row.status === 'valid' && !row.warnings.some((warning) => warning.code === 'likely_duplicate')
  )
}

export function canInclude(row: ImportRow): boolean {
  return row.status !== 'invalid'
}
