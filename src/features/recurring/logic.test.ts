import { describe, expect, it } from 'vitest'

import {
  parseProjectionResult,
  pendingTemplates,
  projectLabel,
  skipAction,
  skipReason,
  summarizeProjection,
  templateFromMovement,
  userMonthKey,
} from './logic'

describe('pendingTemplates', () => {
  const templates = [
    { id: 't1', is_active: true },
    { id: 't2', is_active: true },
    { id: 't3', is_active: false },
  ]

  it('solo activas sin proyección en el mes', () => {
    const projections = [
      { template_id: 't1', generated_for_month: '2026-09' },
      { template_id: 't2', generated_for_month: '2026-08' },
    ]
    expect(pendingTemplates(templates, projections, '2026-09').map((t) => t.id)).toEqual(['t2'])
  })

  it('sin plantillas o todas proyectadas: nada pendiente', () => {
    expect(pendingTemplates([], [], '2026-09')).toEqual([])
    expect(
      pendingTemplates(
        templates,
        [
          { template_id: 't1', generated_for_month: '2026-09' },
          { template_id: 't2', generated_for_month: '2026-09' },
        ],
        '2026-09',
      ),
    ).toEqual([])
  })
})

describe('userMonthKey', () => {
  it('usa la zona horaria del perfil', () => {
    // 1 de octubre a las 03:00 UTC sigue siendo 30 de septiembre en Bogotá.
    const instant = new Date('2026-10-01T03:00:00Z')
    expect(userMonthKey('America/Bogota', instant)).toBe('2026-09')
    expect(userMonthKey('UTC', instant)).toBe('2026-10')
  })

  it('con una zona inválida cae en la del navegador sin lanzar', () => {
    expect(userMonthKey('Zona/Inventada')).toMatch(/^\d{4}-\d{2}$/)
    expect(userMonthKey(null)).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('templateFromMovement', () => {
  it('conserva tipo, cuenta, categoría, monto y descripción; el día sale de la fecha', () => {
    expect(
      templateFromMovement({
        type: 'expense',
        accountId: 'acc',
        categoryId: 'cat',
        amount: 1500000,
        transactionDate: '2026-01-31',
        description: '  Arriendo ',
      }),
    ).toEqual({
      type: 'expense',
      account_id: 'acc',
      category_id: 'cat',
      amount_minor: 1500000,
      description: 'Arriendo',
      day_of_month: 31,
    })
  })

  it('el monto no se reescala: ya está en unidades mínimas de la cuenta', () => {
    const template = templateFromMovement({
      type: 'income',
      accountId: 'usd',
      categoryId: 'cat',
      amount: 4599,
      transactionDate: '2026-09-05',
      description: 'Pago',
    })
    expect(template.amount_minor).toBe(4599)
    expect(template.day_of_month).toBe(5)
  })

  it('rechaza una fecha sin día válido', () => {
    expect(() =>
      templateFromMovement({
        type: 'income',
        accountId: 'a',
        categoryId: 'c',
        amount: 1,
        transactionDate: '',
        description: 'x',
      }),
    ).toThrow()
  })
})

describe('resultado de la proyección', () => {
  const raw = {
    month: '2026-09',
    sheet_id: 'sheet-1',
    results: [
      { template_id: 't1', status: 'created', draft_id: 'd1', date: '2026-09-30' },
      { template_id: 't2', status: 'skipped_existing' },
      { template_id: 't3', status: 'skipped_archived_account' },
      { template_id: 't4', status: 'skipped_archived_category' },
      { template_id: 't5', status: 'invalid_template' },
    ],
  }

  it('valida la forma y resume', () => {
    const result = parseProjectionResult(raw)
    expect(summarizeProjection(result)).toEqual({ created: 1, existing: 1, skipped: 3 })
  })

  it('rechaza estados desconocidos', () => {
    expect(() =>
      parseProjectionResult({ ...raw, results: [{ template_id: 't', status: 'posted' }] }),
    ).toThrow()
  })

  it('explica cada omisión', () => {
    expect(skipReason('created')).toBeNull()
    expect(skipReason('skipped_existing')).toBeNull()
    expect(skipReason('skipped_archived_account')).toBe('su cuenta está archivada')
    expect(skipReason('skipped_archived_category')).toBe('su categoría está archivada')
    expect(skipReason('invalid_template')).toBe('la plantilla ya no es válida')
  })

  it('sugiere una acción para cada omisión', () => {
    expect(skipAction('created')).toBeNull()
    expect(skipAction('skipped_existing')).toBeNull()
    expect(skipAction('skipped_archived_account')).toMatch(/Reactiva la cuenta/)
    expect(skipAction('skipped_archived_category')).toMatch(/Reactiva la categoría/)
    expect(skipAction('invalid_template')).toMatch(/Elimina la plantilla/)
  })

  it('texto del botón en singular y plural', () => {
    expect(projectLabel(1)).toBe('Proyectar 1 movimiento recurrente de este mes')
    expect(projectLabel(3)).toBe('Proyectar 3 movimientos recurrentes de este mes')
  })
})
