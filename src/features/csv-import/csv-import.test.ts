import { describe, expect, it, vi } from 'vitest'

import { toCsv } from '@/lib/csv'

import { parseAmount, suggestDecimalSeparator } from './amounts'
import { createImportSheet, fetchExistingMovements, type ImportClient } from './api'
import { detectDateFormat, parseDate } from './dates'
import { importSheetName, SOURCE_COLUMN, toDraftCells } from './drafts'
import { canInclude, includedByDefault, markDuplicates, normalizeForMatch } from './duplicates'
import {
  EMPTY_MAPPING,
  normalizeRows,
  validateOptions,
  type ImportOptions,
  type ImportRow,
} from './normalize'
import { checkFileMeta, decodeBytes, MAX_DATA_ROWS, parseCsvText } from './read'

const COP = { id: '11111111-1111-4111-8111-111111111111', currency_code: 'COP', is_archived: false }
const USD = { id: '22222222-2222-4222-8222-222222222222', currency_code: 'USD', is_archived: false }

function parsed(text: string) {
  const result = parseCsvText(text)
  if (!result.ok) throw new Error(`no parseó: ${result.code}`)
  return result.csv
}

function options(overrides: Partial<ImportOptions> = {}): ImportOptions {
  return {
    mapping: { ...EMPTY_MAPPING, date: 0, description: 1, amount: 2 },
    amountMode: 'signed',
    signConvention: 'negative_is_expense',
    dateFormat: 'DMY',
    decimalSeparator: ',',
    account: COP,
    ...overrides,
  }
}

/* -------------------------------------------------------------------------- */

describe('lectura del archivo', () => {
  it('coma como separador', () => {
    const csv = parsed('Fecha,Concepto,Valor\n05/09/2026,Mercado,-45000\n')
    expect(csv.delimiter).toBe(',')
    expect(csv.headers).toEqual(['Fecha', 'Concepto', 'Valor'])
    expect(csv.rows).toEqual([['05/09/2026', 'Mercado', '-45000']])
  })

  it('punto y coma como separador, con coma decimal', () => {
    const csv = parsed('Fecha;Concepto;Valor\n05/09/2026;Mercado;-45.000,50\n')
    expect(csv.delimiter).toBe(';')
    expect(csv.rows[0]).toEqual(['05/09/2026', 'Mercado', '-45.000,50'])
  })

  it('tabulador como separador', () => {
    const csv = parsed('Fecha\tConcepto\tValor\n2026-09-05\tMercado\t-45000\n')
    expect(csv.delimiter).toBe('\t')
    expect(csv.rows[0]).toEqual(['2026-09-05', 'Mercado', '-45000'])
  })

  it('encabezados desconocidos o vacíos se conservan para el mapeo manual', () => {
    const csv = parsed('F. Operación;;Importe COP\n05/09/2026;Mercado;-45000\n')
    expect(csv.headers).toEqual(['F. Operación', 'Columna 2', 'Importe COP'])
  })

  it('quita el BOM y rellena filas cortas', () => {
    const csv = parsed('﻿Fecha;Concepto;Valor\n05/09/2026;Mercado\n')
    expect(csv.headers[0]).toBe('Fecha')
    expect(csv.rows[0]).toEqual(['05/09/2026', 'Mercado', ''])
  })

  it('archivo vacío, solo encabezados o binario', () => {
    expect(parseCsvText('')).toEqual({ ok: false, code: 'empty' })
    expect(parseCsvText('   \n  ')).toEqual({ ok: false, code: 'empty' })
    expect(parseCsvText('Fecha;Concepto;Valor\n')).toEqual({ ok: false, code: 'no_data_rows' })
    expect(parseCsvText('PK\u0003\u0004\u0000\u0000')).toEqual({ ok: false, code: 'looks_binary' })
  })

  it('una sola columna no es un extracto con separador reconocible', () => {
    expect(parseCsvText('solo texto\notra línea\n')).toEqual({
      ok: false,
      code: 'unsupported_delimiter',
    })
  })

  it('rechaza más filas del máximo', () => {
    const body = Array.from({ length: MAX_DATA_ROWS + 1 }, () => '05/09/2026;x;-1').join('\n')
    expect(parseCsvText(`Fecha;Concepto;Valor\n${body}`)).toEqual({
      ok: false,
      code: 'too_many_rows',
    })
  })

  it('valida extensión y tamaño antes de leer', () => {
    expect(checkFileMeta({ name: 'extracto.csv', size: 10 })).toBeNull()
    expect(checkFileMeta({ name: 'extracto.xlsx', size: 10 })).toBe('not_csv')
    expect(checkFileMeta({ name: 'extracto.pdf', size: 10, type: 'application/pdf' })).toBe(
      'not_csv',
    )
    expect(checkFileMeta({ name: 'extracto.csv', size: 0 })).toBe('empty')
    expect(checkFileMeta({ name: 'extracto.csv', size: 6 * 1024 * 1024 })).toBe('too_large')
  })

  it('decodifica UTF-8 y cae a Windows-1252 cuando no lo es', () => {
    expect(decodeBytes(new TextEncoder().encode('Canción'))).toEqual({
      text: 'Canción',
      encoding: 'utf-8',
    })
    // «Canción» en Windows-1252: la ó es 0xF3, inválida como UTF-8 suelto.
    const latin1 = new Uint8Array([0x43, 0x61, 0x6e, 0x63, 0x69, 0xf3, 0x6e])
    expect(decodeBytes(latin1)).toEqual({ text: 'Canción', encoding: 'windows-1252' })
  })
})

describe('montos', () => {
  it('COP con punto de miles y sin decimales', () => {
    expect(parseAmount('-45.000', ',', 0)).toEqual({ ok: true, negative: true, minor: 45000 })
    expect(parseAmount('$ 1.250.000', ',', 0)).toEqual({
      ok: true,
      negative: false,
      minor: 1250000,
    })
  })

  it('coma decimal: ceros sobrantes se aceptan en COP, céntimos no', () => {
    expect(parseAmount('15.000,00', ',', 0)).toEqual({ ok: true, negative: false, minor: 15000 })
    expect(parseAmount('15.000,50', ',', 0)).toEqual({ ok: false, code: 'too_many_decimals' })
  })

  it('punto decimal y coma de miles en USD, a centavos', () => {
    expect(parseAmount('1,234.56', '.', 2)).toEqual({ ok: true, negative: false, minor: 123456 })
    expect(parseAmount('45.9', '.', 2)).toEqual({ ok: true, negative: false, minor: 4590 })
    expect(parseAmount('USD -45.99', '.', 2)).toEqual({ ok: true, negative: true, minor: 4599 })
  })

  it('coma decimal en ARS', () => {
    expect(parseAmount('-1.234,5', ',', 2)).toEqual({ ok: true, negative: true, minor: 123450 })
  })

  it('negativos entre paréntesis y con signo al final', () => {
    expect(parseAmount('(2.500)', ',', 0)).toEqual({ ok: true, negative: true, minor: 2500 })
    expect(parseAmount('2.500-', ',', 0)).toEqual({ ok: true, negative: true, minor: 2500 })
  })

  it('un separador decimal mal elegido no se convierte en otra cifra', () => {
    // «1,5» con punto decimal no son 15 unidades.
    expect(parseAmount('1,5', '.', 0)).toEqual({ ok: false, code: 'bad_grouping' })
    expect(parseAmount('1.2.3', ',', 0)).toEqual({ ok: false, code: 'bad_grouping' })
  })

  it('texto, vacío, cero y desbordamiento', () => {
    expect(parseAmount('abc', ',', 0)).toEqual({ ok: false, code: 'not_a_number' })
    expect(parseAmount('', ',', 0)).toEqual({ ok: false, code: 'empty' })
    expect(parseAmount('0,00', ',', 2)).toEqual({ ok: false, code: 'zero' })
    expect(parseAmount('99999999999999999999', ',', 0)).toEqual({ ok: false, code: 'too_large' })
  })

  it('propone el separador decimal solo con evidencia inequívoca', () => {
    expect(suggestDecimalSeparator(['-45.000,50', '1.200,00'])).toBe(',')
    expect(suggestDecimalSeparator(['-45,000.50', '12.5'])).toBe('.')
    expect(suggestDecimalSeparator(['-45.000', '1.200'])).toBeNull()
    expect(suggestDecimalSeparator(['1,50', '2.25'])).toBeNull()
  })
})

describe('fechas', () => {
  it('DD/MM/YYYY', () => {
    expect(parseDate('25/09/2026', 'DMY')).toBe('2026-09-25')
    expect(detectDateFormat(['25/09/2026', '01/09/2026'])).toEqual({
      candidates: ['DMY'],
      suggested: 'DMY',
      ambiguous: false,
    })
  })

  it('una fila corrupta no impide proponer el formato', () => {
    expect(detectDateFormat(['25/09/2026', 'xx', '']).suggested).toBe('DMY')
    expect(detectDateFormat(['xx', 'yy'])).toEqual({
      candidates: [],
      suggested: null,
      ambiguous: false,
    })
  })

  it('YYYY-MM-DD', () => {
    expect(parseDate('2026-09-05', 'YMD')).toBe('2026-09-05')
    expect(detectDateFormat(['2026-09-05', '2026-09-30']).suggested).toBe('YMD')
  })

  it('fecha ambigua: exige confirmación y no preselecciona', () => {
    const detection = detectDateFormat(['03/04/2026', '05/06/2026'])
    expect(detection).toEqual({ candidates: ['DMY', 'MDY'], suggested: null, ambiguous: true })
    expect(parseDate('03/04/2026', 'DMY')).toBe('2026-04-03')
    expect(parseDate('03/04/2026', 'MDY')).toBe('2026-03-04')
  })

  it('rechaza días inexistentes y años de dos cifras', () => {
    expect(parseDate('31/02/2026', 'DMY')).toBeNull()
    expect(parseDate('29/02/2027', 'DMY')).toBeNull()
    expect(parseDate('29/02/2028', 'DMY')).toBe('2028-02-29')
    expect(parseDate('05/09/26', 'DMY')).toBeNull()
  })

  it('ignora la hora si viene pegada a la fecha', () => {
    expect(parseDate('2026-09-05 13:45:00', 'YMD')).toBe('2026-09-05')
  })
})

describe('normalización', () => {
  const rows = [
    ['05/09/2026', 'Mercado Éxito', '-45.000'],
    ['06/09/2026', 'Nómina', '3.500.000'],
    ['xx', 'Café', '-8.000'],
    ['07/09/2026', '', '-1.000'],
    ['08/09/2026', 'Algo', 'abc'],
  ]

  it('filas válidas con tipo por convención de signo confirmada', () => {
    const result = normalizeRows(rows, options())

    expect(result[0]).toMatchObject({
      sourceLine: 2,
      date: '2026-09-05',
      description: 'Mercado Éxito',
      amountMinor: 45000,
      type: 'expense',
      status: 'valid',
    })
    expect(result[1]).toMatchObject({ type: 'income', amountMinor: 3500000, status: 'valid' })
  })

  it('las filas inválidas llevan su error y no bloquean las válidas', () => {
    const result = normalizeRows(rows, options())

    expect(result.map((row) => row.status)).toEqual([
      'valid',
      'valid',
      'invalid',
      'invalid',
      'invalid',
    ])
    expect(result[2].errors).toEqual([{ field: 'transaction_date', code: 'invalid_date' }])
    expect(result[3].errors).toEqual([{ field: 'description', code: 'required' }])
    expect(result[4].errors).toEqual([{ field: 'amount_minor', code: 'not_a_number' }])
  })

  it('la convención inversa invierte el tipo', () => {
    const [row] = normalizeRows([rows[0]], options({ signConvention: 'positive_is_expense' }))
    expect(row.type).toBe('income')
  })

  it('débito y crédito en columnas separadas', () => {
    const mapping = { ...EMPTY_MAPPING, date: 0, description: 1, debit: 2, credit: 3 }
    const result = normalizeRows(
      [
        ['05/09/2026', 'Compra', '45.000', ''],
        ['06/09/2026', 'Abono', '0', '100.000'],
        ['07/09/2026', 'Raro', '1.000', '2.000'],
        ['08/09/2026', 'Nada', '', ''],
      ],
      options({ mapping, amountMode: 'debit_credit', signConvention: null }),
    )

    expect(result[0]).toMatchObject({ type: 'expense', amountMinor: 45000, status: 'valid' })
    expect(result[1]).toMatchObject({ type: 'income', amountMinor: 100000, status: 'valid' })
    expect(result[2].errors).toEqual([{ field: 'amount_minor', code: 'debit_and_credit' }])
    expect(result[3].errors).toEqual([{ field: 'amount_minor', code: 'required' }])
  })

  it('la moneda sale de la cuenta: el mismo texto es otra escala en USD', () => {
    const [cop] = normalizeRows([['05/09/2026', 'x', '-45,99']], options({ account: COP }))
    const [usd] = normalizeRows([['05/09/2026', 'x', '-45,99']], options({ account: USD }))

    expect(cop.errors).toEqual([{ field: 'amount_minor', code: 'too_many_decimals' }])
    expect(usd).toMatchObject({ amountMinor: 4599, type: 'expense' })
  })

  it('una posible transferencia no se clasifica sola: requiere revisión', () => {
    const [row] = normalizeRows(
      [['05/09/2026', 'TRANSFERENCIA A CTA AHORROS', '-200.000']],
      options(),
    )
    expect(row.status).toBe('needs_review')
    expect(row.warnings).toContainEqual({ field: 'type', code: 'possible_transfer' })
    expect(includedByDefault(row)).toBe(false)
    expect(canInclude(row)).toBe(true)
  })

  it('valores que empiezan como fórmula se guardan como texto y se avisan', () => {
    const result = normalizeRows(
      [
        ['05/09/2026', '=HYPERLINK("http://x")', '-1.000'],
        ['05/09/2026', '+57 300', '-1.000'],
        ['05/09/2026', '-Retiro', '-1.000'],
        ['05/09/2026', '@SUM(A1)', '-1.000'],
      ],
      options(),
    )
    for (const row of result) {
      expect(row.warnings).toContainEqual({ field: 'description', code: 'formula_like' })
      expect(row.status).toBe('valid')
    }
    expect(result[0].description).toBe('=HYPERLINK("http://x")')
  })

  it('el HTML se conserva como texto plano, sin interpretarse', () => {
    const [row] = normalizeRows([['05/09/2026', '<img src=x onerror=alert(1)>', '-1']], options())
    expect(row.description).toBe('<img src=x onerror=alert(1)>')
  })

  it('recorta descripciones largas y limpia caracteres de control', () => {
    const [row] = normalizeRows(
      [['05/09/2026', `  Pago\u0007   ${'x'.repeat(300)}`, '-1']],
      options(),
    )
    expect(row.description.length).toBe(250)
    expect(row.description.startsWith('Pago x')).toBe(true)
    expect(row.warnings).toContainEqual({ field: 'description', code: 'description_truncated' })
  })

  it('sin configuración completa no normaliza nada', () => {
    expect(normalizeRows(rows, options({ dateFormat: null }))).toEqual([])
    expect(validateOptions(options({ dateFormat: null, decimalSeparator: null }))).toEqual([
      'date_format_required',
      'decimal_separator_required',
    ])
    expect(validateOptions(options({ signConvention: null }))).toEqual(['sign_convention_required'])
  })

  it('cuenta archivada: no se importa a ella', () => {
    expect(validateOptions(options({ account: { ...COP, is_archived: true } }))).toEqual([
      'account_archived',
    ])
    expect(validateOptions(options({ account: null }))).toEqual(['account_required'])
  })

  it('categoría por defecto: archivada o de otro tipo se rechaza; activa se asigna', () => {
    const food = { id: 'cat-food', type: 'expense', is_archived: false }
    const archived = { id: 'cat-old', type: 'expense', is_archived: true }
    const salary = { id: 'cat-salary', type: 'income', is_archived: false }

    expect(validateOptions(options({ defaultCategories: { expense: archived } }))).toEqual([
      'expense_category_invalid',
    ])
    expect(validateOptions(options({ defaultCategories: { expense: salary } }))).toEqual([
      'expense_category_invalid',
    ])

    const result = normalizeRows(
      rows.slice(0, 2),
      options({ defaultCategories: { expense: food, income: salary } }),
    )
    expect(result.map((row) => row.categoryId)).toEqual(['cat-food', 'cat-salary'])
  })
})

describe('duplicados', () => {
  const base = normalizeRows(
    [
      ['05/09/2026', 'Mercado Éxito', '-45.000'],
      ['05/09/2026', 'Mercado Éxito', '-45.000'],
      ['06/09/2026', 'Farmacia', '-12.000'],
      ['07/09/2026', 'Cine', '-20.000'],
    ],
    options(),
  )

  const existing = [
    {
      account_id: COP.id,
      transaction_date: '2026-09-05',
      amount_minor: 45000,
      type: 'expense',
      description: 'MERCADO EXITO',
    },
    {
      account_id: COP.id,
      transaction_date: '2026-09-06',
      amount_minor: 12000,
      type: 'expense',
      description: 'Otra cosa',
    },
    // Misma fecha y monto, pero en otra cuenta: no cuenta.
    {
      account_id: USD.id,
      transaction_date: '2026-09-07',
      amount_minor: 20000,
      type: 'expense',
      description: 'Cine',
    },
  ]

  it('marca duplicados probables, posibles y repetidos sin bloquear', () => {
    const result = markDuplicates(base, COP.id, existing)

    expect(result[0].warnings.map((w) => w.code)).toEqual(['likely_duplicate'])
    expect(result[1].warnings.map((w) => w.code)).toEqual(['likely_duplicate', 'repeated_in_file'])
    expect(result[2].warnings.map((w) => w.code)).toEqual(['possible_duplicate'])
    expect(result[3].warnings).toEqual([])

    expect(result.map(includedByDefault)).toEqual([false, false, true, true])
    // La decisión sigue siendo del usuario.
    expect(result.every(canInclude)).toBe(true)
  })

  it('normaliza tildes, mayúsculas y signos para comparar', () => {
    expect(normalizeForMatch('  MERCADO  Éxito #12 ')).toBe('mercado exito 12')
  })
})

describe('borradores', () => {
  it('convierte una fila válida en las celdas que valida register_sheet_draft', () => {
    const [row] = normalizeRows([['05/09/2026', 'Mercado', '-45.000']], options())

    expect(toDraftCells(row, COP.id, 'extracto.csv')).toEqual({
      transaction_date: '2026-09-05',
      description: 'Mercado',
      account_id: COP.id,
      category_id: '',
      type: 'expense',
      amount_minor: '45000',
      notes: '',
      origen_csv: 'csv_import · extracto.csv · línea 2',
    })
  })

  it('nunca produce una transferencia', () => {
    const rows = normalizeRows(
      [
        ['05/09/2026', 'Transferencia', '-1'],
        ['05/09/2026', 'Pago tarjeta', '1'],
      ],
      options(),
    )
    for (const row of rows) {
      expect(['income', 'expense']).toContain(toDraftCells(row, COP.id, 'x.csv').type)
    }
  })

  it('una fila inválida no se convierte', () => {
    const [row] = normalizeRows([['xx', 'Mercado', '-1']], options())
    expect(() => toDraftCells(row as ImportRow, COP.id, 'x.csv')).toThrow()
  })

  it('nombre de hoja dentro del tope', () => {
    expect(importSheetName('extracto-sep.csv', '2026-09-27')).toBe('CSV extracto-sep (2026-09-27)')
    expect(importSheetName(`${'a'.repeat(200)}.csv`, '2026-09-27').length).toBe(80)
  })
})

/* -------------------------------------------------------------------------- */

interface Call {
  table: string
  op: string
  payload?: unknown
}

function fakeClient({ draftsError = false }: { draftsError?: boolean } = {}) {
  const calls: Call[] = []

  function builder(table: string) {
    const node: Record<string, unknown> = {}
    let op = 'select'
    let payload: unknown
    const result = () => {
      if (table === 'sheets' && op === 'insert') return { data: { id: 'sheet-1' }, error: null }
      if (table === 'sheet_drafts' && op === 'insert') {
        return { data: null, error: draftsError ? { message: 'boom' } : null }
      }
      if (table === 'sheet_drafts' && op === 'select') {
        return {
          data: [
            {
              cells: {
                account_id: COP.id,
                transaction_date: '2026-09-05',
                amount_minor: '45000',
                type: 'expense',
                description: 'Borrador',
              },
            },
            { cells: { account_id: USD.id, transaction_date: '2026-09-05', amount_minor: '1' } },
          ],
          error: null,
        }
      }
      return { data: [], error: null }
    }
    for (const method of ['select', 'insert', 'delete']) {
      node[method] = (value?: unknown) => {
        if (method !== 'select' || op === 'select') op = method
        if (method !== 'select') payload = value
        if (method !== 'select' || !calls.some((c) => c.table === table && c.op === 'insert')) {
          calls.push({ table, op: method, payload: value })
        }
        return node
      }
    }
    for (const method of ['eq', 'gte', 'lte', 'order', 'range']) node[method] = () => node
    node.single = () => Promise.resolve(result())
    node.then = (ok: (v: unknown) => unknown, ko?: (r: unknown) => unknown) =>
      Promise.resolve(result()).then(ok, ko)
    void payload
    return node
  }

  const client = { from: vi.fn((table: string) => builder(table)) }
  return { client: client as unknown as ImportClient, calls }
}

describe('api del importador', () => {
  it('crea una hoja con la columna de origen y los borradores en una sola inserción', async () => {
    const { client, calls } = fakeClient()
    const [row] = normalizeRows([['05/09/2026', 'Mercado', '-45.000']], options())

    const result = await createImportSheet(client, 'user-1', 'CSV x', [
      toDraftCells(row, COP.id, 'x.csv'),
    ])

    expect(result).toEqual({ sheetId: 'sheet-1', created: 1 })
    const inserts = calls.filter((call) => call.op === 'insert')
    expect(inserts.map((call) => call.table)).toEqual(['sheets', 'sheet_drafts'])
    expect(inserts[0].payload).toMatchObject({ user_id: 'user-1', columns: [SOURCE_COLUMN] })
    expect(inserts[1].payload).toEqual([
      expect.objectContaining({ user_id: 'user-1', sheet_id: 'sheet-1', position: 0 }),
    ])
  })

  it('no publica: nunca escribe en transactions ni llama a register_sheet_draft', async () => {
    const { client } = fakeClient()
    const [row] = normalizeRows([['05/09/2026', 'Mercado', '-45.000']], options())

    await createImportSheet(client, 'user-1', 'CSV x', [toDraftCells(row, COP.id, 'x.csv')])

    const tables = (client.from as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0])
    expect(tables).not.toContain('transactions')
    expect('rpc' in client).toBe(false)
  })

  it('si fallan los borradores, borra la hoja vacía y propaga el error', async () => {
    const { client, calls } = fakeClient({ draftsError: true })
    const [row] = normalizeRows([['05/09/2026', 'Mercado', '-45.000']], options())

    await expect(
      createImportSheet(client, 'user-1', 'CSV x', [toDraftCells(row, COP.id, 'x.csv')]),
    ).rejects.toMatchObject({ message: 'boom' })
    expect(calls.some((call) => call.table === 'sheets' && call.op === 'delete')).toBe(true)
  })

  it('reúne movimientos y borradores pendientes de la misma cuenta para duplicados', async () => {
    const { client } = fakeClient()

    const found = await fetchExistingMovements(client, 'user-1', COP.id, '2026-09-01', '2026-09-30')

    expect(found).toEqual([
      {
        account_id: COP.id,
        transaction_date: '2026-09-05',
        amount_minor: 45000,
        type: 'expense',
        description: 'Borrador',
      },
    ])
  })
})

describe('exportación CSV', () => {
  it('escapa textos que empiezan como fórmula y deja los números intactos', () => {
    const csv = toCsv(
      [{ text: '=SUM(A1)', amount: -1500 }],
      [
        { header: 'Descripción', value: (row) => row.text },
        { header: 'Monto', value: (row) => row.amount },
      ],
    )
    expect(csv).toContain(`"'=SUM(A1)"`)
    expect(csv).toContain(';-1500')
  })
})

describe('mapeo sugerido', () => {
  it('monto con signo', async () => {
    const { suggestMapping } = await import('./mapping')
    expect(suggestMapping(['Fecha', 'Descripción', 'Valor', 'Saldo'])).toEqual({
      mapping: { date: 0, description: 1, amount: 2, debit: null, credit: null, balance: 3 },
      amountMode: 'signed',
    })
  })

  it('débito y crédito separados', async () => {
    const { suggestMapping } = await import('./mapping')
    expect(suggestMapping(['F. Operación', 'Concepto', 'Débito', 'Crédito', 'Saldo'])).toEqual({
      mapping: { date: 0, description: 1, amount: null, debit: 2, credit: 3, balance: 4 },
      amountMode: 'debit_credit',
    })
  })

  it('encabezados desconocidos quedan sin asignar para el mapeo manual', async () => {
    const { suggestMapping } = await import('./mapping')
    expect(suggestMapping(['col_a', 'col_b', 'col_c']).mapping).toEqual(EMPTY_MAPPING)
  })
})
