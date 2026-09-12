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

  describe('líneas de plan', () => {
    it('distingue los dos índices únicos que comparten 23505', () => {
      // U10 y U12 llegan con el mismo SQLSTATE en la misma operación, así que
      // aquí la operación no basta y hay que mirar qué índice nombra el texto.
      const categoria = {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "plan_lines_plan_month_id_category_id_key"',
      }
      const posicion = {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "plan_lines_plan_month_id_position_key"',
      }

      expect(toPlanError(categoria, 'save_plan_line').code).toBe('line_category_taken')
      expect(toPlanError(posicion, 'save_plan_line').code).toBe('conflict')
    })

    it('un 23505 que no nombra ningún índice cae en el conflicto seguro', () => {
      const opaco = { code: '23505', message: 'duplicate key value' }

      expect(toPlanError(opaco, 'save_plan_line').code).toBe('conflict')
    })

    it('el trigger de líneas habla de categorías de gasto, no de ingreso', () => {
      const tipo = {
        code: 'P0001',
        message:
          'Una línea de plan solo puede apuntar a categorías de gasto; la indicada es de tipo income.',
      }
      const archivada = {
        code: 'P0001',
        message: 'No se puede planificar sobre una categoría archivada.',
      }

      expect(toPlanError(tipo, 'save_plan_line').code).toBe('category_not_expense')
      expect(toPlanError(archivada, 'save_plan_line').code).toBe('category_archived')
    })

    it('el CHECK de una línea nombra la fecha, no un monto que no tiene', () => {
      expect(toPlanError({ code: '23514' }, 'save_plan_line').code).toBe('invalid_line')
      expect(new PlanError('invalid_line').message).toMatch(/fecha/i)
      expect(new PlanError('invalid_line').message).not.toMatch(/monto/i)
    })

    it('las demás operaciones siguen mapeando el 23514 a su propio mensaje', () => {
      expect(toPlanError({ code: '23514' }, 'save_income_source').code).toBe('invalid_input')
    })

    it('borrar una línea que ya no está no es un error desconocido', () => {
      expect(toPlanError({ code: 'PGRST116' }, 'delete_plan_line').code).toBe('row_missing')
    })
  })

  describe('servicio no disponible', () => {
    it('un 503 explícito se distingue de un error desconocido', () => {
      expect(
        toPlanError({ status: 503, message: 'Service Unavailable' }, 'save_plan_line').code,
      ).toBe('service_unavailable')
      expect(
        toPlanError({ statusCode: 503, message: 'Service Unavailable' }, 'save_income_source').code,
      ).toBe('service_unavailable')
    })

    it('los SQLSTATE de indisponibilidad también, vengan de donde vengan', () => {
      // 53300 sin conexiones libres, 57P03 arrancando, 08006 conexión caída.
      expect(toPlanError({ code: '53300' }, 'save_plan_line').code).toBe('service_unavailable')
      expect(toPlanError({ code: '57P03' }, 'save_plan_line').code).toBe('service_unavailable')
      expect(toPlanError({ code: '08006' }, 'delete_plan_line').code).toBe('service_unavailable')
    })

    it('no depende de la operación: un servicio caído no sabe qué guardabas', () => {
      for (const operation of [
        'create_plan_month',
        'save_allocations',
        'delete_income_source',
      ] as const) {
        expect(toPlanError({ status: 503 }, operation).code).toBe('service_unavailable')
      }
    })

    it('un 500 sigue siendo unknown: no todo 5xx es indisponibilidad', () => {
      expect(
        toPlanError({ status: 500, message: 'Internal Server Error' }, 'save_plan_line').code,
      ).toBe('unknown')
      expect(toPlanError({ status: 502 }, 'save_plan_line').code).toBe('unknown')
    })

    it('un TypeError sigue siendo network, no indisponibilidad', () => {
      // Son cosas distintas: aquí el navegador no llegó a hablar con nadie.
      expect(toPlanError(new TypeError('Failed to fetch'), 'save_plan_line').code).toBe('network')
    })

    it('los dos mensajes no se confunden entre sí', () => {
      const red = new PlanError('network').message
      const servicio = new PlanError('service_unavailable').message

      expect(red).toMatch(/conexión/i)
      expect(servicio).toMatch(/no está disponible temporalmente/i)
      expect(servicio).not.toMatch(/sin conexión|revisa tu conexión/i)
    })

    it('el mensaje no expone el estado HTTP ni detalles del servidor', () => {
      const { message } = new PlanError('service_unavailable')

      expect(message).not.toMatch(/503|5xx|HTTP|PostgREST|postgres|SQLSTATE|53300|57P03/i)
    })

    it('sin señal estructural cae al fallback seguro, no se adivina por texto', () => {
      // Un 503 de pasarela sin cuerpo de PostgREST llega sin status ni código:
      // se prefiere `unknown` antes que deducirlo del HTML de la respuesta.
      const opaco = { message: '<html><body>503 Service Unavailable</body></html>' }

      expect(toPlanError(opaco, 'save_plan_line').code).toBe('unknown')
    })
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
      'line_category_taken',
      'category_not_expense',
      'invalid_line',
      'forbidden',
      'network',
      'service_unavailable',
      'unknown',
    ] as const

    for (const code of codes) {
      const { message } = new PlanError(code)

      expect(message.length).toBeGreaterThan(0)
      expect(message).not.toMatch(/23505|P0001|PGRST|constraint|_key|_fkey|uuid/i)
    }
  })
})
