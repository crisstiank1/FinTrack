import { describe, expect, it } from 'vitest'

import { ClassificationError, toClassificationError } from './errors'

describe('toClassificationError', () => {
  it('el 23505 es siempre la misma regla: esa categoría ya tiene grupo', () => {
    const unique = { code: '23505', message: 'duplicate key value violates unique constraint' }

    expect(toClassificationError(unique).code).toBe('already_classified')
  })

  it('distingue los tres mensajes del trigger', () => {
    const archivada = {
      code: 'P0001',
      message: 'No se puede clasificar una categoría archivada.',
    }
    const tipo = {
      code: 'P0001',
      message: 'Solo se pueden clasificar categorías de gasto; la indicada es de tipo income.',
    }
    const ausente = {
      code: 'P0001',
      message: 'La categoría indicada no existe o no pertenece al usuario.',
    }

    expect(toClassificationError(archivada).code).toBe('category_archived')
    expect(toClassificationError(tipo).code).toBe('category_not_expense')
    expect(toClassificationError(ausente).code).toBe('category_missing')
  })

  it('un mensaje de trigger desconocido cae en unknown, no en un código equivocado', () => {
    const raro = { code: 'P0001', message: 'Algo que nadie ha escrito todavía.' }

    expect(toClassificationError(raro).code).toBe('unknown')
  })

  it('traduce los códigos de permisos y de sesión', () => {
    expect(toClassificationError({ code: '42501' }).code).toBe('forbidden')
    expect(toClassificationError({ code: 'PGRST301' }).code).toBe('forbidden')
  })

  it('una fila que ya no está no es un error desconocido', () => {
    expect(toClassificationError({ code: 'PGRST116' }).code).toBe('row_missing')
  })

  it('la falta de red llega como TypeError, sin código SQL', () => {
    expect(toClassificationError(new TypeError('Failed to fetch')).code).toBe('network')
  })

  it('la clave foránea diferida significa que la categoría ya no está', () => {
    expect(toClassificationError({ code: '23503' }).code).toBe('category_missing')
  })

  it('no re-envuelve un error de dominio que ya venía traducido', () => {
    const original = new ClassificationError('already_classified')

    expect(toClassificationError(original)).toBe(original)
  })

  it('cualquier otra cosa es unknown', () => {
    expect(toClassificationError({ code: '99999' }).code).toBe('unknown')
    expect(toClassificationError('texto suelto').code).toBe('unknown')
    expect(toClassificationError(null).code).toBe('unknown')
  })

  it('ningún mensaje filtra SQL, constraints ni identificadores', () => {
    const codes = [
      'already_classified',
      'category_not_expense',
      'category_archived',
      'category_missing',
      'row_missing',
      'forbidden',
      'network',
      'unknown',
    ] as const

    for (const code of codes) {
      const { message } = new ClassificationError(code)

      expect(message.length).toBeGreaterThan(0)
      expect(message).not.toMatch(/23505|P0001|PGRST|constraint|_key|_fkey|uuid/i)
    }
  })
})
