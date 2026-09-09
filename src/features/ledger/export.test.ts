import { describe, expect, it } from 'vitest'

import { escapeSearchTerm } from './api'
import { buildLedgerCsv } from './export'
import type { Tables } from '@/types/database.types'

const context = {
  accountsById: new Map([
    ['acc-1', { name: 'Bancolombia', currency_code: 'COP' }],
    ['acc-2', { name: 'Ahorros', currency_code: 'COP' }],
  ]),
  categoriesById: new Map([['cat-1', { name: 'Alimentación' }]]),
  fallbackCurrency: 'COP',
}

function tx(overrides: Partial<Tables<'transactions'>>): Tables<'transactions'> {
  return {
    id: 't1',
    user_id: 'u1',
    account_id: 'acc-1',
    category_id: 'cat-1',
    type: 'expense',
    transfer_direction: null,
    transfer_group_id: null,
    amount_minor: 50_000,
    transaction_date: '2026-09-10',
    description: 'Mercado',
    notes: null,
    is_reconciled: false,
    custom_fields: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function rows(csv: string) {
  return csv.split('\r\n')
}

describe('buildLedgerCsv', () => {
  it('escribe la cabecera y una fila por movimiento', () => {
    const csv = buildLedgerCsv([tx({}), tx({ id: 't2' })], context)
    const lines = rows(csv)

    expect(lines[0]).toBe(
      'Fecha;Descripción;Cuenta;Categoría;Tipo;Dirección;Grupo de transferencia;Monto;Moneda;Notas',
    )
    expect(lines).toHaveLength(3)
  })

  it('resuelve el nombre de la cuenta y de la categoría', () => {
    const csv = buildLedgerCsv([tx({})], context)

    expect(rows(csv)[1]).toContain('Bancolombia')
    expect(rows(csv)[1]).toContain('Alimentación')
  })

  it('exporta el monto con signo para que sea sumable en la hoja de cálculo', () => {
    const csv = buildLedgerCsv(
      [
        tx({ id: 'a', type: 'income', amount_minor: 300_000 }),
        tx({ id: 'b', type: 'expense', amount_minor: 120_000 }),
        tx({
          id: 'c',
          type: 'transfer',
          transfer_direction: 'outgoing',
          category_id: null,
          amount_minor: 80_000,
        }),
        tx({
          id: 'd',
          type: 'transfer',
          transfer_direction: 'incoming',
          category_id: null,
          amount_minor: 80_000,
        }),
      ],
      context,
    )

    const amounts = rows(csv)
      .slice(1)
      .map((line) => line.split(';')[7])

    expect(amounts).toEqual(['300000', '-120000', '-80000', '80000'])
  })

  it('las dos mitades de una transferencia se anulan al sumar la columna Monto', () => {
    const csv = buildLedgerCsv(
      [
        tx({
          id: 'c',
          type: 'transfer',
          transfer_direction: 'outgoing',
          transfer_group_id: 'grupo-1',
          category_id: null,
          amount_minor: 200_000,
        }),
        tx({
          id: 'd',
          type: 'transfer',
          transfer_direction: 'incoming',
          transfer_group_id: 'grupo-1',
          account_id: 'acc-2',
          category_id: null,
          amount_minor: 200_000,
        }),
      ],
      context,
    )

    const total = rows(csv)
      .slice(1)
      .reduce((sum, line) => sum + Number(line.split(';')[7]), 0)

    expect(total).toBe(0)
  })

  it('marca dirección y grupo de la transferencia para poder auditarla', () => {
    const csv = buildLedgerCsv(
      [
        tx({
          type: 'transfer',
          transfer_direction: 'outgoing',
          transfer_group_id: 'grupo-1',
          category_id: null,
        }),
      ],
      context,
    )
    const cells = rows(csv)[1].split(';')

    expect(cells[4]).toBe('Transferencia')
    expect(cells[5]).toBe('Enviada')
    expect(cells[6]).toBe('grupo-1')
  })

  it('deja vacías dirección y grupo en un movimiento normal', () => {
    const cells = rows(buildLedgerCsv([tx({})], context))[1].split(';')

    expect(cells[5]).toBe('')
    expect(cells[6]).toBe('')
  })

  it('usa punto y coma como separador, no coma', () => {
    // Con `,` Excel en español abriría todo el archivo en una sola columna.
    const csv = buildLedgerCsv([tx({})], context)

    expect(rows(csv)[0]).toContain(';')
    expect(rows(csv)[0]).not.toContain(',')
  })

  it('entrecomilla los valores que contienen el separador', () => {
    const csv = buildLedgerCsv([tx({ description: 'Mercado; frutas' })], context)

    expect(rows(csv)[1]).toContain('"Mercado; frutas"')
  })

  it('deja vacías la categoría y las notas ausentes', () => {
    const csv = buildLedgerCsv([tx({ category_id: null, notes: null })], context)
    const cells = rows(csv)[1].split(';')

    expect(cells[3]).toBe('')
    expect(cells[9]).toBe('')
  })
})

describe('escapeSearchTerm', () => {
  it('neutraliza los comodines de LIKE para que se busquen como texto', () => {
    expect(escapeSearchTerm('50%')).toBe('50\\%')
    expect(escapeSearchTerm('a_b')).toBe('a\\_b')
    expect(escapeSearchTerm('c:\\ruta')).toBe('c:\\\\ruta')
  })

  it('deja intacto el texto corriente', () => {
    expect(escapeSearchTerm('mercado del mes')).toBe('mercado del mes')
  })
})
