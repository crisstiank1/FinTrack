import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Tables } from '@/types/database.types'

import type { SheetDraftRow } from './api'
import { SheetGrid, type RegisterSummary } from './components/sheet-grid'
import type { SheetColumn } from './schemas'

function account(id: string, currencyCode: string, name: string): Tables<'accounts'> {
  return {
    id,
    user_id: 'user-1',
    name,
    type: 'checking',
    currency_code: currencyCode,
    color: null,
    icon: null,
    initial_balance_minor: 0,
    is_archived: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  }
}

function category(id: string, type: string, name: string): Tables<'categories'> {
  return {
    id,
    user_id: 'user-1',
    name,
    type,
    color: null,
    icon: null,
    is_archived: false,
    is_system: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  }
}

function draft(id: string, cells: Record<string, string>, position: number): SheetDraftRow {
  return {
    id,
    user_id: 'user-1',
    sheet_id: 'sheet-1',
    position,
    cells,
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
  }
}

const ACCOUNTS = [
  account('11111111-1111-4111-8111-111111111111', 'COP', 'Efectivo'),
  account('22222222-2222-4222-8222-222222222222', 'USD', 'Dólares'),
]
const CATEGORIES = [
  category('33333333-3333-4333-8333-333333333333', 'expense', 'Comida'),
  category('44444444-4444-4444-8444-444444444444', 'income', 'Sueldo'),
]
const COLUMNS: SheetColumn[] = [{ id: 'proveedor', label: 'Proveedor', type: 'text', position: 0 }]

const VALID_CELLS = {
  transaction_date: '2026-09-16',
  description: 'Mercado',
  account_id: '11111111-1111-4111-8111-111111111111',
  category_id: '33333333-3333-4333-8333-333333333333',
  type: 'expense',
  amount_minor: '45000',
  notes: '',
}

interface RenderOptions {
  drafts: SheetDraftRow[]
  onRegister?: (draftIds: string[]) => Promise<RegisterSummary>
}

function renderGrid(overrides: RenderOptions) {
  const onSave = vi.fn()
  const onAddRow = vi.fn()
  const onRemoveRow = vi.fn()
  const onViewMovements = vi.fn()
  const onRegister =
    overrides.onRegister ??
    vi.fn(async (): Promise<RegisterSummary> => ({ requested: 0, registered: 0, remaining: 0 }))

  const utils = render(
    <SheetGrid
      drafts={overrides.drafts}
      columnDefs={COLUMNS}
      accounts={ACCOUNTS}
      categories={CATEGORIES}
      isRegistering={false}
      onSave={onSave}
      onAddRow={onAddRow}
      onRemoveRow={onRemoveRow}
      onRegister={onRegister}
      onViewMovements={onViewMovements}
    />,
  )

  return { ...utils, onSave, onAddRow, onRemoveRow, onViewMovements, onRegister }
}

describe('SheetGrid — estructura', () => {
  it('muestra los campos fijos y las columnas propias en la cabecera', () => {
    renderGrid({ drafts: [] })

    for (const header of [
      'Fecha',
      'Descripción',
      'Cuenta',
      'Tipo',
      'Categoría',
      'Monto',
      'Notas',
      'Proveedor',
    ]) {
      expect(screen.getAllByRole('columnheader').map((node) => node.textContent)).toContain(header)
    }
  })

  it('con una hoja vacía invita a añadir la primera fila', () => {
    renderGrid({ drafts: [] })

    expect(
      screen.getByText('Añade la primera fila para empezar a cargar movimientos.'),
    ).toBeInTheDocument()
  })

  it('Añadir fila notifica al padre', async () => {
    const user = userEvent.setup()
    const { onAddRow } = renderGrid({ drafts: [] })

    await user.click(screen.getByRole('button', { name: 'Añadir fila' }))

    expect(onAddRow).toHaveBeenCalledTimes(1)
  })
})

describe('SheetGrid — edición y autoguardado', () => {
  it('autoguarda al salir de la celda, con el conjunto completo de celdas', async () => {
    const user = userEvent.setup()
    const { onSave } = renderGrid({ drafts: [draft('d-1', VALID_CELLS, 0)] })

    const input = screen.getByPlaceholderText('Descripción')
    await user.clear(input)
    await user.type(input, 'Mercado del sábado')
    await user.tab()

    expect(onSave).toHaveBeenCalledWith(
      'd-1',
      expect.objectContaining({ description: 'Mercado del sábado', amount_minor: '45000' }),
    )
  })

  it('sin cambios, salir de la celda no dispara un guardado', async () => {
    const user = userEvent.setup()
    const { onSave } = renderGrid({ drafts: [draft('d-1', VALID_CELLS, 0)] })

    await user.click(screen.getByPlaceholderText('Descripción'))
    await user.tab()

    expect(onSave).not.toHaveBeenCalled()
  })

  it('cambiar el tipo limpia una categoría que ya no corresponde', async () => {
    const user = userEvent.setup()
    const { onSave } = renderGrid({ drafts: [draft('d-1', VALID_CELLS, 0)] })

    await user.selectOptions(screen.getByLabelText('Tipo'), 'income')
    await user.tab()

    expect(onSave).toHaveBeenCalledWith(
      'd-1',
      expect.objectContaining({ type: 'income', category_id: '' }),
    )
  })

  it('la moneda de la cuenta acompaña al monto; sin cuenta, el importe va sin código', () => {
    renderGrid({
      drafts: [
        draft('d-1', { ...VALID_CELLS, amount_minor: '15000' }, 0),
        draft('d-2', { ...VALID_CELLS, account_id: '', amount_minor: '15000' }, 1),
      ],
    })

    expect(screen.getByText('COP 15.000')).toBeInTheDocument()
    expect(screen.getByText('15.000')).toBeInTheDocument()
  })
})

describe('SheetGrid — validación previa al registro', () => {
  it('pinta los errores por celda con los textos que mapean los códigos de la RPC', () => {
    renderGrid({ drafts: [draft('d-1', {}, 0)] })

    expect(screen.getByText('Ingresa la fecha')).toBeInTheDocument()
    expect(screen.getByText('Elige una cuenta')).toBeInTheDocument()
    expect(screen.getByText('Elige una categoría')).toBeInTheDocument()
    expect(screen.getByText('Ingresa el monto')).toBeInTheDocument()
    expect(screen.getByText('Elige Gasto o Ingreso')).toBeInTheDocument()
    expect(screen.getByText('6 errores')).toBeInTheDocument()

    const input = screen.getByPlaceholderText('Descripción')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('una transferencia no se registra desde una hoja', () => {
    renderGrid({ drafts: [draft('d-1', { ...VALID_CELLS, type: 'transfer' }, 0)] })

    expect(
      screen.getByText('Las transferencias no se registran desde una hoja'),
    ).toBeInTheDocument()
  })

  it('deshabilita Registrar si ninguna fila es válida', () => {
    renderGrid({ drafts: [draft('d-1', {}, 0)] })

    expect(screen.getByRole('button', { name: 'Registrar' })).toBeDisabled()
  })
})

describe('SheetGrid — registro con confirmación', () => {
  it('confirma con los textos acordados (docs/07) y registra solo las válidas', async () => {
    const user = userEvent.setup()
    const valid = draft('d-valid', VALID_CELLS, 0)
    const incomplete = draft('d-inc', {}, 1)
    const onRegister = vi.fn(async (): Promise<RegisterSummary> => ({
      requested: 1,
      registered: 1,
      remaining: 1,
    }))
    const { onViewMovements } = renderGrid({ drafts: [valid, incomplete], onRegister })

    await user.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(
      screen.getByText(
        'Se registrarán 1 movimiento. 1 borrador incompleto permanecerá en esta hoja para que los corrijas.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Registrar 1 movimiento' }))

    expect(onRegister).toHaveBeenCalledWith(['d-valid'])
    expect(onRegister).not.toHaveBeenCalledWith(expect.arrayContaining(['d-inc']))

    expect(
      await screen.findByText(
        '1 movimiento registrado correctamente. 1 borrador permanece pendientes de completar.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ver movimientos' }))
    expect(onViewMovements).toHaveBeenCalledTimes(1)
  })

  it('con todas las filas válidas, la confirmación omite la frase de los incompletos', async () => {
    const user = userEvent.setup()
    const onRegister = vi.fn(async (): Promise<RegisterSummary> => ({
      requested: 2,
      registered: 2,
      remaining: 0,
    }))
    renderGrid({
      drafts: [draft('d-1', VALID_CELLS, 0), draft('d-2', VALID_CELLS, 1)],
      onRegister,
    })

    await user.click(screen.getByRole('button', { name: 'Registrar' }))

    expect(screen.getByText('Se registrarán 2 movimientos.')).toBeInTheDocument()
    expect(screen.queryByText(/incompletos permanecerán/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Registrar 2 movimientos' }))
    expect(onRegister).toHaveBeenCalledWith(['d-1', 'd-2'])
    expect(await screen.findByText('2 movimientos registrados correctamente.')).toBeInTheDocument()
  })
})

describe('SheetGrid — eliminar borrador', () => {
  it('confirma antes de eliminar', async () => {
    const user = userEvent.setup()
    const { onRemoveRow } = renderGrid({ drafts: [draft('d-1', VALID_CELLS, 0)] })

    await user.click(screen.getByRole('button', { name: 'Eliminar borrador' }))

    expect(
      screen.getByText('Se descartará esta fila. Todavía no afecta ni saldos ni movimientos.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    expect(onRemoveRow).toHaveBeenCalledWith('d-1')
  })
})
