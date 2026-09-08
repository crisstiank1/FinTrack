import { describe, expect, it } from 'vitest'

import { BudgetError, toBudgetError, type BudgetErrorCode } from './errors'

/** Error tal como lo devuelve PostgREST: un objeto plano con código y mensaje. */
function postgrestError(code: string, message = '') {
  return { code, message, details: null, hint: null }
}

describe('toBudgetError — reglas del trigger (P0001)', () => {
  it('reconoce la categoría de ingresos', () => {
    const error = toBudgetError(
      postgrestError(
        'P0001',
        'Solo se pueden presupuestar categorías de gasto; la indicada es de tipo income.',
      ),
    )

    expect(error.code).toBe<BudgetErrorCode>('category_not_expense')
  })

  it('reconoce la categoría archivada', () => {
    const error = toBudgetError(
      postgrestError('P0001', 'No se puede presupuestar una categoría archivada.'),
    )

    expect(error.code).toBe<BudgetErrorCode>('category_archived')
  })

  it('reconoce la categoría inexistente o ajena', () => {
    const error = toBudgetError(
      postgrestError('P0001', 'La categoría indicada no existe o no pertenece al usuario.'),
    )

    expect(error.code).toBe<BudgetErrorCode>('category_missing')
  })

  it('cae en unknown si el texto del trigger cambia', () => {
    expect(toBudgetError(postgrestError('P0001', 'otro mensaje')).code).toBe('unknown')
  })
})

describe('toBudgetError — códigos SQL', () => {
  it('23505 es un conflicto: alguien escribió antes', () => {
    const error = toBudgetError(
      postgrestError(
        '23505',
        'duplicate key value violates unique constraint "budgets_template_unique_idx"',
      ),
    )

    expect(error.code).toBe<BudgetErrorCode>('conflict')
  })

  it('23503 (clave foránea, incluso diferida al commit) es categoría no disponible', () => {
    const error = toBudgetError(
      postgrestError(
        '23503',
        'insert or update on table "budgets" violates foreign key constraint "budgets_category_same_user_fkey"',
      ),
    )

    expect(error.code).toBe<BudgetErrorCode>('category_missing')
  })

  it('23514 es un importe inválido', () => {
    expect(toBudgetError(postgrestError('23514')).code).toBe<BudgetErrorCode>('invalid_amount')
  })

  it('42501 (RLS o permisos) es falta de autorización', () => {
    const error = toBudgetError(
      postgrestError('42501', 'new row violates row-level security policy for table "budgets"'),
    )

    expect(error.code).toBe<BudgetErrorCode>('forbidden')
  })

  it('PGRST301 (JWT ausente o caducado) es falta de autorización', () => {
    expect(toBudgetError(postgrestError('PGRST301')).code).toBe<BudgetErrorCode>('forbidden')
  })

  it('PGRST116 (la fila no estaba) es fila inexistente', () => {
    expect(toBudgetError(postgrestError('PGRST116')).code).toBe<BudgetErrorCode>('row_missing')
  })
})

describe('toBudgetError — red y desconocidos', () => {
  it('un fallo de fetch es un error de red', () => {
    expect(toBudgetError(new TypeError('Failed to fetch')).code).toBe<BudgetErrorCode>('network')
  })

  it('un código no contemplado cae en unknown', () => {
    expect(toBudgetError(postgrestError('42P01')).code).toBe<BudgetErrorCode>('unknown')
  })

  it.each([null, undefined, 'texto suelto', 42])('%p cae en unknown', (value) => {
    expect(toBudgetError(value).code).toBe<BudgetErrorCode>('unknown')
  })

  it('no re-envuelve un error de dominio', () => {
    const original = new BudgetError('past_month_template')

    expect(toBudgetError(original)).toBe(original)
  })
})

describe('toBudgetError — los mensajes no filtran detalles técnicos', () => {
  const tecnicos = [
    postgrestError(
      '23505',
      'duplicate key value violates unique constraint "budgets_template_unique_idx"',
    ),
    postgrestError('23503', 'violates foreign key constraint "budgets_category_same_user_fkey"'),
    postgrestError('42501', 'new row violates row-level security policy for table "budgets"'),
    postgrestError('P0001', 'No se puede presupuestar una categoría archivada.'),
  ]

  it.each(tecnicos)('$code produce un mensaje limpio', (raw) => {
    const { message } = toBudgetError(raw)

    expect(message).not.toMatch(/\d{5}|PGRST|_idx|_fkey|constraint|policy|SQL/i)
    expect(message.length).toBeGreaterThan(0)
  })
})
