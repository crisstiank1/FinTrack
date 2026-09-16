import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import { supabase } from '@/lib/supabase'

import {
  createDraft,
  createSheet,
  deleteDraft,
  fetchDrafts,
  fetchSheets,
  isUniquePositionViolation,
  nextDraftPosition,
  registerSheetDraft,
  updateDraftCells,
  updateSheetColumns,
} from './api'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}))

const fromMock = supabase.from as unknown as Mock
const rpcMock = supabase.rpc as unknown as Mock

interface QueryCall {
  method: string
  args: unknown[]
}

function makeChain(calls: QueryCall[], result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  }

  for (const method of ['select', 'eq', 'order', 'single', 'insert', 'update', 'delete'] as const) {
    chain[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return chain
    }
  }

  return chain
}

const sheet = {
  id: 'sheet-1',
  user_id: 'user-1',
  name: 'Gastos',
  columns: [],
  created_at: '2026-09-16T10:00:00.000Z',
  updated_at: '2026-09-16T10:00:00.000Z',
}

const draft = {
  id: 'draft-1',
  user_id: 'user-1',
  sheet_id: 'sheet-1',
  position: 0,
  cells: { transaction_date: '2026-09-16' },
  created_at: '2026-09-16T10:00:00.000Z',
  updated_at: '2026-09-16T10:00:00.000Z',
}

beforeEach(() => {
  fromMock.mockReset()
  rpcMock.mockReset()
})

describe('fetchSheets', () => {
  it('lista las hojas del usuario ordenadas por nombre', async () => {
    const calls: QueryCall[] = []
    fromMock.mockReturnValue(makeChain(calls, { data: [sheet], error: null }))

    const result = await fetchSheets('user-1')

    expect(result).toEqual([sheet])
    expect(fromMock).toHaveBeenCalledWith('sheets')
    expect(calls).toEqual([
      { method: 'select', args: ['*'] },
      { method: 'eq', args: ['user_id', 'user-1'] },
      { method: 'order', args: ['name', { ascending: true }] },
    ])
  })

  it('propaga el error crudo de la lectura', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(makeChain([], { data: null, error }))

    await expect(fetchSheets('user-1')).rejects.toBe(error)
  })
})

describe('createSheet', () => {
  it('crea la hoja con nombre y columnas', async () => {
    const calls: QueryCall[] = []
    fromMock.mockReturnValue(makeChain(calls, { data: sheet, error: null }))

    const result = await createSheet('user-1', 'Gastos', [
      { id: 'proveedor', label: 'Proveedor', type: 'text', position: 0 },
    ])

    expect(result).toEqual(sheet)
    calls.shift()
    expect(calls).toEqual([
      { method: 'select', args: [] },
      { method: 'single', args: [] },
    ])
  })

  it('propaga el error crudo de la escritura', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(makeChain([], { data: null, error }))

    await expect(createSheet('user-1', 'Gastos', [])).rejects.toBe(error)
  })
})

describe('updateSheetColumns', () => {
  it('actualiza la definición de columnas de la hoja', async () => {
    const calls: QueryCall[] = []
    fromMock.mockReturnValue(makeChain(calls, { data: sheet, error: null }))

    await updateSheetColumns('sheet-1', [{ id: 'x', label: 'X', type: 'text', position: 0 }])

    expect(fromMock).toHaveBeenCalledWith('sheets')
    expect(calls).toEqual([
      {
        method: 'update',
        args: [{ columns: [{ id: 'x', label: 'X', type: 'text', position: 0 }] }],
      },
      { method: 'eq', args: ['id', 'sheet-1'] },
      { method: 'select', args: [] },
      { method: 'single', args: [] },
    ])
  })

  it('propaga el error crudo', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(makeChain([], { data: null, error }))

    await expect(updateSheetColumns('sheet-1', [])).rejects.toBe(error)
  })
})

describe('fetchDrafts', () => {
  it('lista los borradores de la hoja por posición', async () => {
    const calls: QueryCall[] = []
    fromMock.mockReturnValue(makeChain(calls, { data: [draft], error: null }))

    const result = await fetchDrafts('sheet-1')

    expect(result).toEqual([draft])
    expect(fromMock).toHaveBeenCalledWith('sheet_drafts')
    expect(calls).toEqual([
      { method: 'select', args: ['*'] },
      { method: 'eq', args: ['sheet_id', 'sheet-1'] },
      { method: 'order', args: ['position', { ascending: true }] },
    ])
  })

  it('propaga el error crudo', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(makeChain([], { data: null, error }))

    await expect(fetchDrafts('sheet-1')).rejects.toBe(error)
  })
})

describe('createDraft', () => {
  it('inserta el borrador y devuelve la fila', async () => {
    const calls: QueryCall[] = []
    fromMock.mockReturnValue(makeChain(calls, { data: draft, error: null }))

    const input = { user_id: 'user-1', sheet_id: 'sheet-1', position: 3, cells: {} }
    const result = await createDraft(input)

    expect(result).toEqual(draft)
    expect(calls).toEqual([
      { method: 'insert', args: [input] },
      { method: 'select', args: [] },
      { method: 'single', args: [] },
    ])
  })

  it('propaga el error crudo', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(makeChain([], { data: null, error }))

    await expect(
      createDraft({ user_id: 'user-1', sheet_id: 'sheet-1', position: 0, cells: {} }),
    ).rejects.toBe(error)
  })
})

describe('updateDraftCells', () => {
  it('actualiza solo las celdas del borrador', async () => {
    const calls: QueryCall[] = []
    fromMock.mockReturnValue(makeChain(calls, { data: draft, error: null }))

    await updateDraftCells('draft-1', { transaction_date: '2026-09-17' })

    expect(fromMock).toHaveBeenCalledWith('sheet_drafts')
    expect(calls).toEqual([
      { method: 'update', args: [{ cells: { transaction_date: '2026-09-17' } }] },
      { method: 'eq', args: ['id', 'draft-1'] },
      { method: 'select', args: [] },
      { method: 'single', args: [] },
    ])
  })

  it('propaga el error crudo', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(makeChain([], { data: null, error }))

    await expect(updateDraftCells('draft-1', {})).rejects.toBe(error)
  })
})

describe('deleteDraft', () => {
  it('borra el borrador por id', async () => {
    const calls: QueryCall[] = []
    fromMock.mockReturnValue(makeChain(calls, { error: null }))

    await deleteDraft('draft-1')

    expect(fromMock).toHaveBeenCalledWith('sheet_drafts')
    expect(calls).toEqual([
      { method: 'delete', args: [] },
      { method: 'eq', args: ['id', 'draft-1'] },
    ])
  })

  it('propaga el error crudo', async () => {
    const error = new Error('boom')
    fromMock.mockReturnValue(makeChain([], { error }))

    await expect(deleteDraft('draft-1')).rejects.toBe(error)
  })
})

describe('registerSheetDraft', () => {
  it('invoca la RPC con el id del borrador y razona el JSON registrado', async () => {
    rpcMock.mockResolvedValue({
      data: { status: 'registered', draft_id: 'draft-1', transaction_id: 't-1' },
      error: null,
    })

    const result = await registerSheetDraft('draft-1')

    expect(rpcMock).toHaveBeenCalledWith('register_sheet_draft', { p_draft_id: 'draft-1' })
    expect(result).toEqual({ status: 'registered', draft_id: 'draft-1', transaction_id: 't-1' })
  })

  it('razona el JSON invalid con sus errores por campo', async () => {
    rpcMock.mockResolvedValue({
      data: {
        status: 'invalid',
        draft_id: 'draft-1',
        errors: [
          { field: 'transaction_date', code: 'required' },
          { field: 'type', code: 'transfer_not_allowed' },
        ],
      },
      error: null,
    })

    const result = await registerSheetDraft('draft-1')

    expect(result).toEqual({
      status: 'invalid',
      draft_id: 'draft-1',
      errors: [
        { field: 'transaction_date', code: 'required' },
        { field: 'type', code: 'transfer_not_allowed' },
      ],
    })
  })

  it('razona el JSON not_found', async () => {
    rpcMock.mockResolvedValue({ data: { status: 'not_found', draft_id: 'draft-1' }, error: null })

    const result = await registerSheetDraft('draft-1')

    expect(result).toEqual({ status: 'not_found', draft_id: 'draft-1' })
  })

  it('un JSON inesperado no pasa como si fuera un estado válido', async () => {
    rpcMock.mockResolvedValue({ data: { status: 'surprise' }, error: null })

    await expect(registerSheetDraft('draft-1')).rejects.toThrow()
  })

  it('propaga la excepción PostgreSQL cruda (llega como error de la RPC)', async () => {
    const error = new Error('23502: viola not-null')
    rpcMock.mockResolvedValue({ data: null, error })

    await expect(registerSheetDraft('draft-1')).rejects.toBe(error)
  })
})

describe('nextDraftPosition', () => {
  it('devuelve la mayor posición más uno, y 0 con una hoja vacía', () => {
    expect(nextDraftPosition([{ position: 0 }, { position: 5 }, { position: 2 }])).toBe(6)
    expect(nextDraftPosition([])).toBe(0)
  })
})

describe('isUniquePositionViolation', () => {
  it('reconoce el código 23505 de PostgreSQL', () => {
    expect(isUniquePositionViolation({ code: '23505' })).toBe(true)
    expect(isUniquePositionViolation({ code: '23502' })).toBe(false)
    expect(isUniquePositionViolation(new Error('boom'))).toBe(false)
    expect(isUniquePositionViolation('23505')).toBe(false)
  })
})
