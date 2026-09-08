import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { BudgetError } from '@/features/budgets/errors'
import type { BudgetProgress } from '@/features/budgets/progress'
import type { Tables } from '@/types/database.types'

import Budgets from './Budgets'

const useBudgets = vi.fn()
const useBudgetProgress = vi.fn()
const saveBudget = vi.fn()
const deleteBudget = vi.fn()
const useAccounts = vi.fn()
const useCategories = vi.fn()
const toastError = vi.fn()
const toastSuccess = vi.fn()

vi.mock('@/features/budgets/hooks', () => ({
  useBudgets: () => useBudgets(),
  useBudgetProgress: (options: unknown) => useBudgetProgress(options),
  useSaveBudget: () => ({ mutateAsync: saveBudget, isPending: false }),
  useDeleteBudget: () => ({ mutateAsync: deleteBudget, isPending: false }),
}))
vi.mock('@/features/categories/hooks', () => ({
  useCategories: () => useCategories(),
}))
vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => useAccounts(),
}))
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: () => toastSuccess() },
}))

const MES = '2026-09'

const categories = [
  {
    id: 'cat-salary',
    name: 'Salario',
    type: 'income',
    is_archived: false,
    color: null,
    icon: null,
  },
  {
    id: 'cat-food',
    name: 'Alimentación',
    type: 'expense',
    is_archived: false,
    color: null,
    icon: null,
  },
  {
    id: 'cat-fun',
    name: 'Entretenimiento',
    type: 'expense',
    is_archived: false,
    color: null,
    icon: null,
  },
  { id: 'cat-gym', name: 'Gimnasio', type: 'expense', is_archived: true, color: null, icon: null },
  { id: 'cat-old', name: 'Revistas', type: 'expense', is_archived: true, color: null, icon: null },
] as Tables<'categories'>[]

function budgetRow(overrides: Partial<Tables<'budgets'>>): Tables<'budgets'> {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    category_id: 'cat-food',
    period_month: null,
    effective_from: '2026-08-01',
    amount_minor: 500_000,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

// Gimnasio está archivada pero conserva una plantilla vigente en el mes; sin
// ella no debería aparecer. Revistas está archivada y no tiene ninguna.
const budgets = [
  budgetRow({ id: 'tpl-food', category_id: 'cat-food' }),
  budgetRow({ id: 'tpl-gym', category_id: 'cat-gym', amount_minor: 200_000 }),
]

const progress: BudgetProgress[] = [
  {
    categoryId: 'cat-food',
    budgetMinor: 500_000,
    spentMinor: 100_000,
    remainingMinor: 400_000,
    ratio: 0.2,
    status: 'ok',
    source: 'template',
  },
  {
    // Excepción de 0: decisión deliberada de no presupuestar este mes.
    categoryId: 'cat-fun',
    budgetMinor: null,
    spentMinor: 30_000,
    remainingMinor: null,
    ratio: null,
    status: 'unbudgeted',
    source: 'exception',
  },
  {
    categoryId: 'cat-gym',
    budgetMinor: 200_000,
    spentMinor: 50_000,
    remainingMinor: 150_000,
    ratio: 0.25,
    status: 'ok',
    source: 'template',
  },
]

function renderBudgets(month = MES) {
  return render(
    <MemoryRouter initialEntries={[`/budgets?month=${month}`]}>
      <Budgets />
    </MemoryRouter>,
  )
}

/** Fila de la lista correspondiente a esa categoría. */
function row(categoryName: string) {
  const item = screen.getByText(categoryName).closest('li')
  if (!item) throw new Error(`No se encontró la fila de ${categoryName}`)
  return within(item)
}

beforeEach(() => {
  vi.clearAllMocks()
  useAccounts.mockReturnValue({ data: [{ id: 'acc-1', currency_code: 'COP' }] })
  useCategories.mockReturnValue({ data: categories, isPending: false })
  useBudgets.mockReturnValue({ data: budgets, isPending: false, isError: false, refetch: vi.fn() })
  useBudgetProgress.mockReturnValue({ data: progress, isPending: false, isError: false })
})

describe('Budgets — qué categorías se listan', () => {
  it('nunca muestra categorías de ingreso', () => {
    renderBudgets()

    expect(screen.queryByText('Salario')).not.toBeInTheDocument()
  })

  it('muestra las de gasto activas', () => {
    renderBudgets()

    expect(screen.getByText('Alimentación')).toBeInTheDocument()
    expect(screen.getByText('Entretenimiento')).toBeInTheDocument()
  })

  it('muestra una archivada con presupuesto del mes, marcada como archivada', () => {
    renderBudgets()

    expect(row('Gimnasio').getByText('Archivada')).toBeInTheDocument()
  })

  it('oculta una archivada sin presupuesto en el mes', () => {
    renderBudgets()

    expect(screen.queryByText('Revistas')).not.toBeInTheDocument()
  })

  it('una archivada no puede estrenar presupuesto, pero sí abrir su historial', () => {
    renderBudgets()

    const gimnasio = row('Gimnasio')
    expect(gimnasio.queryByRole('button', { name: /Editar presupuesto/ })).not.toBeInTheDocument()
    expect(gimnasio.getByRole('button', { name: 'Historial' })).toBeInTheDocument()

    expect(
      row('Alimentación').getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    ).toBeInTheDocument()
  })
})

describe('Budgets — presupuesto de cero', () => {
  it('no dibuja barra ni porcentaje, y separa el gasto real', () => {
    renderBudgets()

    const fun = row('Entretenimiento')
    expect(fun.getByText(/Sin presupuesto este mes/)).toBeInTheDocument()
    expect(fun.getByText(/excepción de este mes/)).toBeInTheDocument()
    expect(fun.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(fun.getByText('COP 30.000')).toBeInTheDocument()
  })
})

describe('Budgets — meses cerrados', () => {
  it('avisa de que el mes ya pasó y solo permite excepciones', async () => {
    const user = userEvent.setup()
    renderBudgets('2020-01')

    expect(screen.getByText(/ya está cerrado/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Editar presupuesto de Alimentación' }))

    expect(
      screen.queryByRole('radio', { name: /Desde este mes en adelante/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Solo este mes/ })).toBeChecked()
  })
})

describe('Budgets — conflicto con otra sesión', () => {
  it('avisa sin exponer detalles técnicos y no reintenta', async () => {
    saveBudget.mockRejectedValueOnce(new BudgetError('conflict'))

    const user = userEvent.setup()
    renderBudgets()

    await user.click(screen.getByRole('button', { name: 'Editar presupuesto de Alimentación' }))
    await user.type(screen.getByLabelText('Monto mensual'), '600000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(saveBudget).toHaveBeenCalledTimes(1)

    const [title, options] = toastError.mock.calls[0] as [string, { description: string }]
    expect(title).toBe('El presupuesto cambió en otra sesión')
    expect(options.description).toMatch(/otra pestaña o dispositivo/)
    // Ni códigos SQL, ni nombres de índices, ni restricciones.
    expect(options.description).not.toMatch(/\d{5}|PGRST|_idx|_fkey|constraint|policy/i)
  })

  it('guarda con la intención elegida cuando no hay conflicto', async () => {
    saveBudget.mockResolvedValueOnce(undefined)

    const user = userEvent.setup()
    renderBudgets()

    await user.click(screen.getByRole('button', { name: 'Editar presupuesto de Alimentación' }))
    await user.type(screen.getByLabelText('Monto mensual'), '600.000')
    await user.click(screen.getByRole('radio', { name: /Solo este mes/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(saveBudget).toHaveBeenCalledWith({
      amountMinor: 600_000,
      intent: { kind: 'exception', categoryId: 'cat-food', monthKey: MES },
    })
  })
})

describe('Budgets — gasto acotado al mes', () => {
  it('pide solo los gastos del mes consultado, no el historial completo', () => {
    renderBudgets()

    expect(useBudgetProgress).toHaveBeenCalledWith(
      expect.objectContaining({ monthKey: MES, categoryIds: ['cat-food', 'cat-fun', 'cat-gym'] }),
    )
  })
})
