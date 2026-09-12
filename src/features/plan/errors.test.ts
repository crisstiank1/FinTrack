import { describe, expect, it } from 'vitest'

import { PlanError, toPlanError } from './errors'

describe('toPlanError', () => {
  it('el mismo 23505 significa cosas distintas según la operación', () => {
    const unique = { code: '23505', message: 'duplicate key value violates unique constraint' }

    expect(toPlanError(unique, 'create_plan_month').code).toBe('month_conflict')
    expect(toPlanError(unique, 'save_income_source').code).toBe('conflict')
    expect(toPlanError(unique, 'save_income_source_categories').code).toBe(
      'category_already_linked',
    )
    expect(toPlanError(unique, 'save_allocations').code).toBe('conflict')
  })

  it('distingue los tres mensajes del trigger de vínculos', () => {
    const archivada = {
      code: 'P0001',
      message: 'No se puede vincular una categoría archivada.',
    }
    const tipo = {
      code: 'P0001',
      message:
        'Una fuente de ingreso solo puede vincularse a categorías de ingreso; la indicada es de tipo expense.',
    }
    const ausente = {
      code: 'P0001',
      message: 'La categoría indicada no existe o no pertenece al usuario.',
    }

    expect(toPlanError(archivada, 'save_income_source_categories').code).toBe('category_archived')
    expect(toPlanError(tipo, 'save_income_source_categories').code).toBe('category_not_income')
    expect(toPlanError(ausente, 'save_income_source_categories').code).toBe('category_missing')
  })

  it('un mensaje de trigger desconocido cae en unknown, no en un código equivocado', () => {
    const raro = { code: 'P0001', message: 'Algo que nadie ha escrito todavía.' }

    expect(toPlanError(raro, 'save_income_source_categories').code).toBe('unknown')
  })

  it('traduce los códigos de permisos y de sesión', () => {
    expect(toPlanError({ code: '42501' }, 'save_income_source').code).toBe('forbidden')
    expect(toPlanError({ code: 'PGRST301' }, 'save_income_source').code).toBe('forbidden')
  })

  it('una fila que ya no está no es un error desconocido', () => {
    expect(toPlanError({ code: 'PGRST116' }, 'save_income_source').code).toBe('row_missing')
  })

  it('la falta de red llega como TypeError, sin código SQL', () => {
    expect(toPlanError(new TypeError('Failed to fetch'), 'save_income_source').code).toBe('network')
  })

  it('traduce la clave foránea y el CHECK del esquema', () => {
    expect(toPlanError({ code: '23503' }, 'save_income_source_categories').code).toBe(
      'category_missing',
    )
    expect(toPlanError({ code: '23514' }, 'save_income_source').code).toBe('invalid_input')
  })

  it('no re-envuelve un error de dominio que ya venía traducido', () => {
    const original = new PlanError('month_missing_after_conflict')

    expect(toPlanError(original, 'create_plan_month')).toBe(original)
  })

  it('cualquier otra cosa es unknown', () => {
    expect(toPlanError({ code: '99999' }, 'save_income_source').code).toBe('unknown')
    expect(toPlanError('texto suelto', 'save_income_source').code).toBe('unknown')
  })

  it('el trigger de la suma se identifica por la operación, no por el texto', () => {
    // `check_plan_allocations_sum` es el único trigger que puede saltar sobre
    // plan_allocations, así que la operación ya basta y no hay que fiarse de un
    // mensaje que una migración podría reescribir.
    const suma = {
      code: 'P0001',
      message:
        'Los porcentajes del reparto del mes 0f8d… deben sumar 10000 puntos base; suman 9900.',
    }

    expect(toPlanError(suma, 'save_allocations').code).toBe('allocation_sum')
  })

  it('el mismo P0001 sigue mirando el texto en las demás operaciones', () => {
    const archivada = { code: 'P0001', message: 'No se puede vincular una categoría archivada.' }

    expect(toPlanError(archivada, 'save_income_source_categories').code).toBe('category_archived')
  })

  it('el conflicto del reparto no cuenta el guardado como hecho ni filtra Postgres', () => {
    const { message } = new PlanError('conflict')

    expect(message).toMatch(/vuelve a guardar/i)
    expect(message).not.toMatch(/guardado con éxito|se guardó/i)
  })

  it('ningún mensaje filtra SQL, constraints ni identificadores', () => {
    const codes = [
      'month_conflict',
      'month_missing_after_conflict',
      'conflict',
      'category_already_linked',
      'category_not_income',
      'category_archived',
      'category_missing',
      'row_missing',
      'invalid_input',
      'allocation_sum',
      'forbidden',
      'network',
      'unknown',
    ] as const

    for (const code of codes) {
      const { message } = new PlanError(code)

      expect(message.length).toBeGreaterThan(0)
      expect(message).not.toMatch(/23505|P0001|PGRST|constraint|_key|_fkey|uuid/i)
    }
  })
})
