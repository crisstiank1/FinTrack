import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { BudgetError } from '@/features/budgets/errors'
import type { BudgetProgress } from '@/features/budgets/progress'
import { PAGE_HELP } from '@/components/shared/page-help'
import type { Tables } from '@/types/database.types'

import Budgets from './Budgets'

const useBudgets = vi.fn()
const useBudgetProgress = vi.fn()
const saveBudget = vi.fn()
const deleteBudget = vi.fn()
const useAccounts = vi.fn()
const useCategories = vi.fn()
const usePrimaryCurrency = vi.fn()
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
vi.mock('@/features/profile/hooks', () => ({
  usePrimaryCurrency: () => usePrimaryCurrency(),
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
  usePrimaryCurrency.mockReturnValue({ data: 'COP', isPending: false })
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
    expect(fun.getByText('Presupuesto en COP 0 · excepción de este mes')).toBeInTheDocument()
    expect(fun.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(fun.getByText('COP 30.000')).toBeInTheDocument()
  })

  it('un 0 explícito nunca se dice «Sin presupuesto»', () => {
    renderBudgets()

    expect(row('Entretenimiento').queryByText(/Sin presupuesto/)).not.toBeInTheDocument()
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

describe('Budgets — moneda de los presupuestos', () => {
  it('pide el progreso en la moneda de presentación', () => {
    renderBudgets()

    expect(useBudgetProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ monthKey: MES, currencyCode: 'COP' }),
    )
  })

  it('espera a la moneda principal antes de calcular el progreso', () => {
    usePrimaryCurrency.mockReturnValue({ data: undefined, isPending: true })

    renderBudgets()

    expect(useBudgetProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ currencyCode: undefined }),
    )
  })

  it('muestra los importes en la moneda principal aunque no sea la de la primera cuenta', () => {
    useAccounts.mockReturnValue({
      data: [
        { id: 'acc-1', currency_code: 'COP' },
        { id: 'acc-usd', currency_code: 'USD' },
      ],
    })
    usePrimaryCurrency.mockReturnValue({ data: 'USD', isPending: false })

    renderBudgets()

    expect(useBudgetProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ currencyCode: 'USD' }),
    )
    expect(row('Entretenimiento').getByText('USD 30.000')).toBeInTheDocument()
  })

  it('avisa de los gastos en otras monedas que no cuentan', () => {
    useBudgetProgress.mockReturnValue({
      data: progress,
      exclusions: { count: 2, currencyCodes: ['USD'] },
      isPending: false,
      isError: false,
    })

    renderBudgets()

    expect(screen.getByRole('note')).toHaveTextContent(
      '2 gastos en otras monedas (USD) no cuentan para estos presupuestos.',
    )
  })

  it('sin gastos en otras monedas no hay aviso', () => {
    useBudgetProgress.mockReturnValue({
      data: progress,
      exclusions: { count: 0, currencyCodes: [] },
      isPending: false,
      isError: false,
    })

    renderBudgets()

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

describe('Budgets — orden de la lista', () => {
  it('muestra primero las categorías con dinero asignado, luego las de 0 y al final las demás', () => {
    // «Arriendo» va primera por nombre, pero no tiene presupuesto: baja al final.
    useCategories.mockReturnValue({
      data: [
        {
          id: 'cat-rent',
          name: 'Arriendo',
          type: 'expense',
          is_archived: false,
          color: null,
          icon: null,
        },
        ...categories,
      ],
      isPending: false,
    })
    useBudgetProgress.mockReturnValue({
      data: [
        ...progress,
        {
          categoryId: 'cat-rent',
          budgetMinor: null,
          spentMinor: 0,
          remainingMinor: null,
          ratio: null,
          status: 'unbudgeted',
          source: null,
        },
      ],
      isPending: false,
      isError: false,
    })

    renderBudgets()

    const nombres = ['Alimentación', 'Entretenimiento', 'Gimnasio', 'Arriendo']
      .map((nombre) => ({ nombre, fila: screen.getByText(nombre).closest('li') as HTMLElement }))
      .sort((a, b) =>
        a.fila.compareDocumentPosition(b.fila) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
      .map(({ nombre }) => nombre)

    // Con dinero, en el orden de siempre (activas antes que archivadas); después
    // el 0 explícito; al final lo que no tiene presupuesto.
    expect(nombres).toEqual(['Alimentación', 'Gimnasio', 'Entretenimiento', 'Arriendo'])
  })
})

describe('Budgets — alerta solo al superar (M15)', () => {
  it('al 100 % exacto la barra va en verde y no hay alerta; al pasarse, sí', () => {
    useBudgetProgress.mockReturnValue({
      data: [
        {
          categoryId: 'cat-food',
          budgetMinor: 500_000,
          spentMinor: 500_000,
          remainingMinor: 0,
          ratio: 1,
          status: 'ok',
          source: 'template',
        },
        {
          categoryId: 'cat-gym',
          budgetMinor: 200_000,
          spentMinor: 250_000,
          remainingMinor: -50_000,
          ratio: 1.25,
          status: 'over',
          source: 'template',
        },
      ],
      isPending: false,
      isError: false,
    })

    renderBudgets()

    const alimentacion = row('Alimentación')
    expect(alimentacion.getByRole('progressbar').firstElementChild).toHaveClass('bg-success')
    expect(screen.queryByText(/Alimentación va por el/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Alimentación superó su presupuesto/)).not.toBeInTheDocument()

    expect(screen.getByText('Gimnasio superó su presupuesto por COP 50.000.')).toBeInTheDocument()
    expect(row('Gimnasio').getByRole('progressbar').firstElementChild).toHaveClass('bg-danger')
  })
})

describe('Budgets — ayuda de la pantalla (M18)', () => {
  it('el «?» junto al título explica la pantalla', async () => {
    renderBudgets()

    fireEvent.click(await screen.findByRole('button', { name: 'Ayuda: Presupuestos' }))

    expect(screen.getByRole('region', { name: 'Presupuestos' })).toHaveTextContent(
      PAGE_HELP.budgets,
    )
  })
})
