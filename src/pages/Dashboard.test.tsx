import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import Dashboard, { FILTERS_HELP_TEXT } from './Dashboard'
import type { Tables } from '@/types/database.types'

// Recharts mide su contenedor con getBoundingClientRect, que en jsdom siempre
// devuelve 0: sin este mock los gráficos no se montan y ensucian la salida con
// advertencias. Las aserciones van sobre los datos, no sobre el SVG.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 600, height: 300 }}>{children}</div>
    ),
  }
})

const useAllTransactions = vi.fn()
const useAccounts = vi.fn()
const useCategories = vi.fn()
const useBudgets = vi.fn()
const useBudgetProgress = vi.fn()
const usePrimaryCurrency = vi.fn()
const createTransactionMutate = vi.fn()
const createCategoryMutate = vi.fn()
const saveBudgetMutate = vi.fn()

vi.mock('@/features/dashboard/hooks', () => ({
  useAllTransactions: () => useAllTransactions(),
}))
vi.mock('@/features/budgets/hooks', () => ({
  useBudgets: () => useBudgets(),
  useBudgetProgress: (options: unknown) => useBudgetProgress(options),
  useSaveBudget: () => ({ mutateAsync: saveBudgetMutate, isPending: false }),
}))
vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => useAccounts(),
}))
vi.mock('@/features/categories/hooks', () => ({
  useCategories: () => useCategories(),
  useCreateCategory: () => ({ mutateAsync: createCategoryMutate, isPending: false }),
}))
vi.mock('@/features/profile/hooks', () => ({
  usePrimaryCurrency: () => usePrimaryCurrency(),
}))
vi.mock('@/features/transactions/hooks', () => ({
  useCreateTransaction: () => ({ mutateAsync: createTransactionMutate, isPending: false }),
}))

const accounts = [
  {
    id: 'acc-1',
    name: 'Efectivo',
    currency_code: 'COP',
    initial_balance_minor: 100_000,
    is_archived: false,
  },
  {
    id: 'acc-2',
    name: 'Ahorros',
    currency_code: 'COP',
    initial_balance_minor: 50_000,
    is_archived: false,
  },
] as Tables<'accounts'>[]

const categories = [
  { id: 'cat-salary', name: 'Salario', type: 'income', color: '#0F0', is_archived: false },
  { id: 'cat-food', name: 'Alimentación', type: 'expense', color: '#F00', is_archived: false },
  { id: 'cat-fun', name: 'Entretenimiento', type: 'expense', color: '#00F', is_archived: false },
] as Tables<'categories'>[]

/** Mes en pantalla por defecto: el dashboard arranca en el mes actual. */
const month = new Date().toISOString().slice(0, 7)

function transaction(overrides: Partial<Tables<'transactions'>>) {
  return {
    id: crypto.randomUUID(),
    type: 'expense',
    transfer_direction: null,
    transfer_group_id: null,
    account_id: 'acc-1',
    category_id: 'cat-food',
    amount_minor: 0,
    transaction_date: `${month}-10`,
    description: 'Movimiento',
    notes: null,
    is_reconciled: false,
    user_id: 'user-1',
    created_at: '',
    updated_at: '',
    ...overrides,
  } as Tables<'transactions'>
}

const transactions = [
  transaction({
    type: 'income',
    category_id: 'cat-salary',
    amount_minor: 300_000,
    transaction_date: `${month}-05`,
    description: 'Salario',
  }),
  transaction({
    amount_minor: 120_000,
    transaction_date: `${month}-10`,
    description: 'Mercado del mes',
  }),
  transaction({
    account_id: 'acc-2',
    category_id: 'cat-fun',
    amount_minor: 30_000,
    transaction_date: `${month}-12`,
    description: 'Cine',
  }),
]

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  )
}

/** Filtros de la cabecera: el mes y la cuenta de la vista, no el formulario de carga. */
function viewControls() {
  return within(screen.getByRole('group', { name: 'Mes y cuenta' }))
}

/** Lee el valor mostrado dentro de la tarjeta de KPI con ese nombre. */
function kpi(name: string) {
  return within(screen.getByRole('region', { name }))
}

/** Plantilla vigente para Alimentación, para que el panel tenga algo que mostrar. */
const budgetRows = [
  {
    id: 'tpl-food',
    user_id: 'user-1',
    category_id: 'cat-food',
    period_month: null,
    effective_from: `${month}-01`,
    amount_minor: 130_000,
    created_at: '',
    updated_at: '',
  },
] as Tables<'budgets'>[]

beforeEach(() => {
  vi.clearAllMocks()
  createTransactionMutate.mockResolvedValue({})
  createCategoryMutate.mockResolvedValue({ id: 'cat-new', name: 'Gimnasio', type: 'expense' })
  saveBudgetMutate.mockResolvedValue({})
  useAccounts.mockReturnValue({ data: accounts })
  usePrimaryCurrency.mockReturnValue({ data: 'COP', isPending: false })
  useCategories.mockReturnValue({ data: categories })
  useBudgets.mockReturnValue({ data: [], isPending: false, isError: false })
  useBudgetProgress.mockReturnValue({ data: [], isPending: false, isError: false })
  useAllTransactions.mockReturnValue({
    data: transactions,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
})

describe('Dashboard', () => {
  it('muestra los KPIs calculados a partir de los movimientos', () => {
    renderDashboard()

    // 150.000 de saldos iniciales + 300.000 de ingresos - 150.000 de gastos.
    expect(kpi('Saldo consolidado').getByText('COP 300.000')).toBeInTheDocument()
    expect(kpi('Ingresos del mes').getByText('COP 300.000')).toBeInTheDocument()
    expect(kpi('Gastos del mes').getByText('COP 150.000')).toBeInTheDocument()
    expect(kpi('Ahorro neto').getByText('COP 150.000')).toBeInTheDocument()
    expect(kpi('Tasa de ahorro').getByText('50 %')).toBeInTheDocument()
  })

  it('con una sola moneda no añade notas ni saldos aparte', () => {
    renderDashboard()

    expect(kpi('Saldo consolidado').getByText('Todas las cuentas')).toBeInTheDocument()
    expect(screen.queryByText(/Otras monedas/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Cifras en/)).not.toBeInTheDocument()
  })

  it('reparte el gasto del mes por categoría', () => {
    renderDashboard()

    const panel = within(screen.getByRole('region', { name: 'Gasto por categoría' }))
    expect(panel.getByText('Alimentación')).toBeInTheDocument()
    expect(panel.getByText('COP 120.000')).toBeInTheDocument()
    expect(panel.getByText('80 %')).toBeInTheDocument()
    expect(panel.getByText('Entretenimiento')).toBeInTheDocument()
    expect(panel.getByText('20 %')).toBeInTheDocument()
  })

  it('recalcula todo al filtrar por una cuenta', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.selectOptions(viewControls().getByLabelText('Cuenta'), 'acc-2')

    // acc-2: 50.000 iniciales - 30.000 del único gasto de esa cuenta.
    expect(kpi('Saldo consolidado').getByText('COP 20.000')).toBeInTheDocument()
    expect(kpi('Ingresos del mes').getByText('COP 0')).toBeInTheDocument()
    expect(kpi('Gastos del mes').getByText('COP 30.000')).toBeInTheDocument()
    expect(kpi('Tasa de ahorro').getByText('Sin ingresos')).toBeInTheDocument()
  })

  it('muestra el estado vacío cuando el usuario no tiene ningún movimiento', () => {
    useAllTransactions.mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderDashboard()

    const emptyState = within(screen.getByRole('region', { name: 'Tu dashboard está listo' }))
    expect(emptyState.getByRole('button', { name: /registrar movimiento/i })).toBeInTheDocument()
    // Sin datos no se dibujan KPIs ni gráficos.
    expect(screen.queryByRole('region', { name: 'Saldo consolidado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Gasto por categoría' })).not.toBeInTheDocument()
  })

  it('mantiene los KPIs en cero y explica el vacío en un mes sin movimientos', () => {
    renderDashboard()

    // userEvent no sabe teclear en un input[type=month] de jsdom; el cambio de
    // valor se dispara directamente.
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2020-01' } })

    expect(kpi('Ingresos del mes').getByText('COP 0')).toBeInTheDocument()
    expect(kpi('Gastos del mes').getByText('COP 0')).toBeInTheDocument()

    const panel = within(screen.getByRole('region', { name: 'Gasto por categoría' }))
    expect(panel.getByText(/No registraste gastos en enero 2020/i)).toBeInTheDocument()
  })

  it('muestra el estado de carga mientras llegan los movimientos', () => {
    useAllTransactions.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    })

    renderDashboard()

    expect(screen.queryByRole('region', { name: 'Saldo consolidado' })).not.toBeInTheDocument()
    expect(screen.queryByText('Tu dashboard está listo')).not.toBeInTheDocument()
  })

  it('muestra el progreso de los presupuestos del mes', () => {
    useBudgets.mockReturnValue({ data: budgetRows, isPending: false, isError: false })
    useBudgetProgress.mockReturnValue({
      data: [
        {
          categoryId: 'cat-food',
          budgetMinor: 130_000,
          spentMinor: 120_000,
          remainingMinor: 10_000,
          ratio: 120_000 / 130_000,
          status: 'warning_90',
          source: 'template',
        },
      ],
      isPending: false,
      isError: false,
    })

    renderDashboard()

    const panel = within(screen.getByRole('region', { name: 'Presupuestos' }))
    expect(panel.getByText('Alimentación')).toBeInTheDocument()
    expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '92')
    expect(panel.getByText(/va por el 92 % de su presupuesto/)).toBeInTheDocument()
  })

  it('las alertas enlazan al mes que se está viendo', () => {
    useBudgets.mockReturnValue({ data: budgetRows, isPending: false, isError: false })
    useBudgetProgress.mockReturnValue({
      data: [
        {
          categoryId: 'cat-food',
          budgetMinor: 100_000,
          spentMinor: 120_000,
          remainingMinor: -20_000,
          ratio: 1.2,
          status: 'over',
          source: 'template',
        },
      ],
      isPending: false,
      isError: false,
    })

    renderDashboard()

    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2026-03' } })

    const panel = within(screen.getByRole('region', { name: 'Presupuestos' }))
    expect(panel.getByRole('link', { name: 'Ajustar presupuesto' })).toHaveAttribute(
      'href',
      '/budgets?month=2026-03',
    )
  })

  it('no propone ajustar el presupuesto de una categoría archivada', () => {
    useCategories.mockReturnValue({
      data: [
        ...categories,
        { id: 'cat-gym', name: 'Gimnasio', type: 'expense', color: '#0FF', is_archived: true },
      ] as Tables<'categories'>[],
    })
    useBudgets.mockReturnValue({
      data: [{ ...budgetRows[0], id: 'tpl-gym', category_id: 'cat-gym' }],
      isPending: false,
      isError: false,
    })
    useBudgetProgress.mockReturnValue({
      data: [
        {
          categoryId: 'cat-gym',
          budgetMinor: 100_000,
          spentMinor: 200_000,
          remainingMinor: -100_000,
          ratio: 2,
          status: 'over',
          source: 'template',
        },
      ],
      isPending: false,
      isError: false,
    })

    renderDashboard()

    const panel = within(screen.getByRole('region', { name: 'Presupuestos' }))
    expect(panel.getByText(/Gimnasio superó su presupuesto/)).toBeInTheDocument()
    expect(panel.queryByRole('link', { name: 'Ajustar presupuesto' })).not.toBeInTheDocument()
    expect(panel.getAllByText('Categoría archivada').length).toBeGreaterThan(0)
  })

  it('avisa cuando el mes cierra con ahorro neto negativo', () => {
    useAllTransactions.mockReturnValue({
      data: [
        transaction({
          type: 'income',
          category_id: 'cat-salary',
          amount_minor: 300_000,
          description: 'Salario',
        }),
        transaction({ amount_minor: 400_000, description: 'Mercado' }),
      ],
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderDashboard()

    const panel = within(screen.getByRole('region', { name: 'Presupuestos' }))
    expect(panel.getByText(/Gastaste COP 100.000 más de lo que ingresaste/)).toBeInTheDocument()
  })

  it('no avisa de ahorro neto negativo cuando el mes cierra en positivo', () => {
    renderDashboard()

    const panel = within(screen.getByRole('region', { name: 'Presupuestos' }))
    expect(panel.queryByText(/más de lo que ingresaste/)).not.toBeInTheDocument()
  })

  it('muestra el estado de carga mientras llega la moneda principal', () => {
    usePrimaryCurrency.mockReturnValue({ data: undefined, isPending: true })

    renderDashboard()

    expect(screen.queryByRole('region', { name: 'Saldo consolidado' })).not.toBeInTheDocument()
  })

  it('ofrece reintentar cuando la consulta falla', async () => {
    const refetch = vi.fn()
    useAllTransactions.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    })

    const user = userEvent.setup()
    renderDashboard()

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar tus movimientos')

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  describe('con cuentas en varias monedas', () => {
    const usdAccount = {
      id: 'acc-usd',
      name: 'Cuenta USD',
      currency_code: 'USD',
      initial_balance_minor: 1_000,
      is_archived: false,
    } as Tables<'accounts'>
    const arsAccount = {
      id: 'acc-ars',
      name: 'Cuenta ARS',
      currency_code: 'ARS',
      initial_balance_minor: 20_000,
      is_archived: true,
    } as Tables<'accounts'>

    beforeEach(() => {
      useAccounts.mockReturnValue({ data: [...accounts, usdAccount, arsAccount] })
      useAllTransactions.mockReturnValue({
        data: [
          ...transactions,
          transaction({
            type: 'income',
            account_id: 'acc-usd',
            category_id: 'cat-salary',
            amount_minor: 500,
            description: 'Pago en dólares',
          }),
          transaction({
            account_id: 'acc-usd',
            category_id: 'cat-fun',
            amount_minor: 200,
            description: 'Suscripción',
          }),
        ],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      })
    })

    it('calcula los KPIs solo con las cuentas de la moneda principal', () => {
      renderDashboard()

      // Las mismas cifras que sin la cuenta en USD: 500 y 200 no se suman a COP.
      expect(kpi('Saldo consolidado').getByText('COP 300.000')).toBeInTheDocument()
      expect(kpi('Ingresos del mes').getByText('COP 300.000')).toBeInTheDocument()
      expect(kpi('Gastos del mes').getByText('COP 150.000')).toBeInTheDocument()
      expect(kpi('Tasa de ahorro').getByText('50 %')).toBeInTheDocument()

      const panel = within(screen.getByRole('region', { name: 'Gasto por categoría' }))
      expect(panel.getByText('COP 30.000')).toBeInTheDocument()
    })

    it('muestra aparte el saldo de las otras monedas, incluidas cuentas archivadas', () => {
      renderDashboard()

      const hero = kpi('Saldo consolidado')
      expect(hero.getByText('Cuentas en COP')).toBeInTheDocument()
      // USD: 1.000 + 500 - 200. ARS: saldo inicial de una cuenta archivada.
      expect(hero.getByText('USD 1.300 · ARS 20.000')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Cifras en COP. Tus cuentas en USD y ARS no se suman: su saldo aparece aparte, sin convertir.',
        ),
      ).toBeInTheDocument()
    })

    it('presenta en la moneda principal del perfil aunque no sea la de la primera cuenta', () => {
      usePrimaryCurrency.mockReturnValue({ data: 'USD', isPending: false })

      renderDashboard()

      expect(kpi('Saldo consolidado').getByText('USD 1.300')).toBeInTheDocument()
      expect(kpi('Ingresos del mes').getByText('USD 500')).toBeInTheDocument()
      expect(kpi('Saldo consolidado').getByText('COP 300.000 · ARS 20.000')).toBeInTheDocument()
    })

    it('usa la primera cuenta si no hay cuentas en la moneda principal', () => {
      usePrimaryCurrency.mockReturnValue({ data: 'EUR', isPending: false })

      renderDashboard()

      expect(kpi('Ingresos del mes').getByText('COP 300.000')).toBeInTheDocument()
    })

    it('usa la primera cuenta si no se pudo leer la moneda principal', () => {
      usePrimaryCurrency.mockReturnValue({ data: undefined, isPending: false, isError: true })

      renderDashboard()

      expect(kpi('Ingresos del mes').getByText('COP 300.000')).toBeInTheDocument()
    })

    it('los presupuestos siguen en la moneda principal aunque se elija una cuenta en otra', async () => {
      useBudgets.mockReturnValue({ data: budgetRows, isPending: false, isError: false })
      useBudgetProgress.mockReturnValue({
        data: [
          {
            categoryId: 'cat-food',
            budgetMinor: 100_000,
            spentMinor: 120_000,
            remainingMinor: -20_000,
            ratio: 1.2,
            status: 'over',
            source: 'template',
          },
        ],
        isPending: false,
        isError: false,
      })
      useAllTransactions.mockReturnValue({
        data: [
          ...transactions,
          transaction({
            account_id: 'acc-usd',
            category_id: 'cat-fun',
            amount_minor: 900,
            description: 'Viaje',
          }),
        ],
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      })
      const user = userEvent.setup()
      renderDashboard()

      await user.selectOptions(viewControls().getByLabelText('Cuenta'), 'acc-usd')

      expect(useBudgetProgress).toHaveBeenLastCalledWith(
        expect.objectContaining({ currencyCode: 'COP' }),
      )
      const panel = within(screen.getByRole('region', { name: 'Presupuestos' }))
      expect(panel.getByText(/superó su presupuesto por COP 20.000/)).toBeInTheDocument()
      expect(panel.queryByText(/USD 20.000/)).not.toBeInTheDocument()
      // La alerta global sale del resumen de la cuenta USD y va en USD.
      expect(panel.getByText(/Gastaste USD 900 más de lo que ingresaste/)).toBeInTheDocument()
    })

    it('al elegir una cuenta en otra moneda todo pasa a esa moneda, sin saldos aparte', async () => {
      const user = userEvent.setup()
      renderDashboard()

      await user.selectOptions(viewControls().getByLabelText('Cuenta'), 'acc-usd')

      expect(kpi('Saldo consolidado').getByText('USD 1.300')).toBeInTheDocument()
      expect(kpi('Gastos del mes').getByText('USD 200')).toBeInTheDocument()
      expect(screen.queryByText(/Otras monedas/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Cifras en/)).not.toBeInTheDocument()
    })
  })
})

describe('Dashboard — cabecera y ayuda (M14)', () => {
  it('el mes y la cuenta están en la cabecera y siguen filtrando toda la vista', async () => {
    const user = userEvent.setup()
    renderDashboard()

    expect(viewControls().getByLabelText('Mes')).toBeInTheDocument()

    await user.selectOptions(viewControls().getByLabelText('Cuenta'), 'acc-2')

    expect(kpi('Gastos del mes').getByText('COP 30.000')).toBeInTheDocument()
  })

  it('ya no hay panel lateral «Mes y cuenta» ni botón «Movimiento completo»', () => {
    renderDashboard()

    expect(screen.queryByRole('region', { name: 'Mes y cuenta' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Movimiento completo/ })).not.toBeInTheDocument()
  })

  it('el «?» muestra la ayuda de los filtros con el ratón y se cierra con Escape', async () => {
    const user = userEvent.setup()
    renderDashboard()

    const ayuda = viewControls().getByRole('button', { name: 'Ayuda: Mes y cuenta' })
    await user.hover(ayuda)

    const panel = screen.getByRole('region', { name: 'Mes y cuenta' })
    expect(panel).toHaveTextContent(FILTERS_HELP_TEXT)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Mes y cuenta' })).not.toBeInTheDocument()
  })

  it('el «?» se abre con el teclado y con un toque', async () => {
    const user = userEvent.setup()
    renderDashboard()

    const ayuda = viewControls().getByRole('button', { name: 'Ayuda: Mes y cuenta' })

    act(() => ayuda.focus())
    expect(ayuda).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard('{Escape}')
    expect(ayuda).toHaveAttribute('aria-expanded', 'false')

    await user.click(ayuda)
    await user.unhover(ayuda)
    expect(ayuda).toHaveAttribute('aria-expanded', 'true')
  })

  it('los filtros siguen a mano mientras cargan los movimientos', () => {
    useAllTransactions.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    })

    renderDashboard()

    expect(screen.getByRole('group', { name: 'Mes y cuenta' })).toBeInTheDocument()
  })
})

describe('Dashboard — cargar movimiento (M14)', () => {
  function quickForm() {
    return within(screen.getByRole('region', { name: 'Cargar movimiento' }))
  }

  function amountField() {
    return quickForm().getByLabelText(/^Monto \(/) as HTMLInputElement
  }

  function chip(name: string) {
    return within(quickForm().getByRole('radiogroup', { name: 'Categoría' })).getByRole('radio', {
      name,
    })
  }

  it('registra un gasto sin abrir ningún diálogo', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.type(amountField(), '15000')
    await user.click(chip('Alimentación'))
    await user.click(quickForm().getByRole('button', { name: 'Agregar' }))

    expect(createTransactionMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'expense',
        account_id: 'acc-1',
        category_id: 'cat-food',
        amount_minor: 15000,
        description: 'Alimentación',
      }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('registra un ingreso con las categorías de ingreso', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.click(quickForm().getByRole('radio', { name: 'Ingreso' }))
    await user.type(amountField(), '300000')
    await user.click(chip('Salario'))
    await user.click(quickForm().getByRole('button', { name: 'Agregar' }))

    expect(createTransactionMutate).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'income', category_id: 'cat-salary', amount_minor: 300000 }),
    )
  })

  it('arranca en una cuenta de la moneda de la vista y dice cómo se registrará', async () => {
    const user = userEvent.setup()
    renderDashboard()

    expect((quickForm().getByLabelText('Cuenta del movimiento') as HTMLSelectElement).value).toBe(
      'acc-1',
    )
    expect(quickForm().getByLabelText('Monto (COP)')).toHaveValue('')

    await user.type(amountField(), '15000')

    expect(quickForm().getByText('Se registrará como COP 15.000')).toBeInTheDocument()
    expect(quickForm().queryByText(/Equivale a/)).not.toBeInTheDocument()
  })

  it('sin movimientos en el mes, los chips van en orden alfabético', () => {
    useCategories.mockReturnValue({
      data: [
        { id: 'cat-z', name: 'Viajes', type: 'expense', icon: null, is_archived: false },
        { id: 'cat-a', name: 'Arriendo', type: 'expense', icon: null, is_archived: false },
        { id: 'cat-m', name: 'Mascotas', type: 'expense', icon: null, is_archived: false },
      ],
    })
    renderDashboard()
    fireEvent.change(viewControls().getByLabelText('Mes'), { target: { value: '2020-01' } })

    const nombres = within(quickForm().getByRole('radiogroup', { name: 'Categoría' }))
      .getAllByRole('radio')
      .map((radio) => radio.textContent)
    expect(nombres).toEqual(['Arriendo', 'Mascotas', 'Viajes'])
  })

  it('con más de ocho categorías muestra ocho y el resto tras «Más…»', () => {
    useCategories.mockReturnValue({
      data: Array.from({ length: 11 }, (_, index) => ({
        id: 'cat-' + index,
        name: 'Categoría ' + String(index).padStart(2, '0'),
        type: 'expense',
        icon: null,
        is_archived: false,
      })),
    })
    renderDashboard()

    const grupo = within(quickForm().getByRole('radiogroup', { name: 'Categoría' }))
    expect(grupo.getAllByRole('radio')).toHaveLength(8)
    expect(quickForm().getByRole('button', { name: 'Más…' })).toBeInTheDocument()
  })

  it('por debajo de 1024px el formulario no va en línea y el botón flotante sigue', async () => {
    const user = userEvent.setup()
    renderDashboard()

    // jsdom no aplica media queries: se comprueban las clases que las declaran.
    const columna = screen.getByRole('region', { name: 'Cargar movimiento' }).parentElement
    expect(columna?.className).toContain('hidden')
    expect(columna?.className).toContain('lg:flex')

    const fab = screen.getByRole('button', { name: 'Registrar movimiento' })
    expect(fab.className).toContain('lg:hidden')

    await user.click(fab)
    expect(within(screen.getByRole('dialog')).getByText('Nuevo movimiento')).toBeInTheDocument()
  })
})

describe('Dashboard — presupuestos (M14)', () => {
  const conPresupuesto = {
    categoryId: 'cat-food',
    budgetMinor: 130_000,
    spentMinor: 120_000,
    remainingMinor: 10_000,
    ratio: 120_000 / 130_000,
    status: 'warning_90',
    source: 'template',
  }

  const sinPresupuesto = {
    categoryId: 'cat-fun',
    budgetMinor: null,
    spentMinor: 30_000,
    remainingMinor: null,
    ratio: null,
    status: 'unbudgeted',
    source: null,
  }

  function mockProgress(data: unknown[]) {
    useBudgets.mockReturnValue({ data: budgetRows, isPending: false, isError: false })
    useBudgetProgress.mockReturnValue({ data, isPending: false, isError: false })
  }

  function budgetPanel() {
    return within(screen.getByRole('region', { name: 'Presupuestos' }))
  }

  it('solo muestra las categorías con presupuesto en el mes', () => {
    mockProgress([conPresupuesto, sinPresupuesto])
    renderDashboard()

    expect(budgetPanel().getByText('Alimentación')).toBeInTheDocument()
    expect(budgetPanel().queryByText('Entretenimiento')).not.toBeInTheDocument()
    expect(budgetPanel().queryByText('Sin presupuesto este mes')).not.toBeInTheDocument()
  })

  it('un presupuesto explícito de 0 sí se muestra', () => {
    mockProgress([conPresupuesto, { ...sinPresupuesto, source: 'exception' }])
    renderDashboard()

    expect(budgetPanel().getByText('Entretenimiento')).toBeInTheDocument()
    expect(budgetPanel().getByText(/Presupuesto en COP 0/)).toBeInTheDocument()
  })

  it('sin presupuestos muestra un estado vacío con «Agregar presupuesto»', () => {
    mockProgress([sinPresupuesto])
    renderDashboard()

    expect(budgetPanel().getByText(/Todavía no tienes presupuestos en/)).toBeInTheDocument()
    // Uno en la cabecera del panel y otro en el estado vacío.
    expect(budgetPanel().getAllByRole('button', { name: 'Agregar presupuesto' })).toHaveLength(2)
  })

  it('la cabecera dice el mes, la moneda y que no cambia con el filtro de cuenta', () => {
    mockProgress([conPresupuesto])
    renderDashboard()

    expect(
      budgetPanel().getByText(/en COP · no cambia con el filtro de cuenta/),
    ).toBeInTheDocument()
  })

  it('crea el presupuesto de una categoría existente sin presupuesto', async () => {
    const user = userEvent.setup()
    mockProgress([conPresupuesto, sinPresupuesto])
    renderDashboard()

    await user.click(budgetPanel().getByRole('button', { name: 'Agregar presupuesto' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.selectOptions(dialog.getByLabelText('Categoría'), 'cat-fun')
    await user.click(dialog.getByRole('button', { name: 'Continuar' }))
    await user.type(dialog.getByLabelText('Monto mensual'), '80000')
    await user.click(dialog.getByRole('button', { name: 'Guardar' }))

    expect(saveBudgetMutate).toHaveBeenCalledWith({
      amountMinor: 80000,
      intent: { kind: 'template', categoryId: 'cat-fun', monthKey: month },
    })
  })

  it('crea una categoría de gasto desde el diálogo y le pone presupuesto', async () => {
    const user = userEvent.setup()
    mockProgress([conPresupuesto])
    renderDashboard()

    await user.click(budgetPanel().getByRole('button', { name: 'Agregar presupuesto' }))
    const dialog = within(screen.getByRole('dialog'))
    await user.click(dialog.getByRole('button', { name: 'Crear categoría de gasto' }))
    await user.type(dialog.getByLabelText('Nombre'), 'Gimnasio')
    await user.click(dialog.getByRole('button', { name: 'Crear categoría' }))

    expect(createCategoryMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Gimnasio', type: 'expense' }),
    )

    expect(await dialog.findByText('Presupuesto de Gimnasio')).toBeInTheDocument()
    await user.type(dialog.getByLabelText('Monto mensual'), '120000')
    await user.click(dialog.getByRole('button', { name: 'Guardar' }))

    expect(saveBudgetMutate).toHaveBeenCalledWith({
      amountMinor: 120000,
      intent: { kind: 'template', categoryId: 'cat-new', monthKey: month },
    })
  })

  it('edita un presupuesto en su diálogo, con «$» y el importe ya escrito', async () => {
    const user = userEvent.setup()
    mockProgress([conPresupuesto])
    renderDashboard()

    await user.click(
      budgetPanel().getByRole('button', { name: 'Editar presupuesto de Alimentación' }),
    )

    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByText('Presupuesto de Alimentación')).toBeInTheDocument()
    expect(dialog.getByText('$')).toBeInTheDocument()

    const campo = dialog.getByLabelText('Monto mensual') as HTMLInputElement
    expect(campo.value).toBe('130000')

    await user.clear(campo)
    await user.type(campo, '150000')
    await user.click(dialog.getByRole('radio', { name: /Solo este mes/ }))
    await user.click(dialog.getByRole('button', { name: 'Guardar' }))

    expect(saveBudgetMutate).toHaveBeenCalledWith({
      amountMinor: 150000,
      intent: { kind: 'exception', categoryId: 'cat-food', monthKey: month },
    })
  })

  it('un presupuesto de 0 se abre con 0 escrito, no vacío', async () => {
    const user = userEvent.setup()
    mockProgress([{ ...sinPresupuesto, source: 'exception' }])
    renderDashboard()

    await user.click(
      budgetPanel().getByRole('button', { name: 'Editar presupuesto de Entretenimiento' }),
    )

    const dialog = within(screen.getByRole('dialog'))
    expect((dialog.getByLabelText('Monto mensual') as HTMLInputElement).value).toBe('0')
  })
})

describe('Dashboard — sin últimos movimientos (M14)', () => {
  it('no hay bloque de movimientos ni forma de editar uno desde aquí', () => {
    renderDashboard()

    expect(screen.queryByRole('region', { name: 'Últimos movimientos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Editar Mercado/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Mercado del mes')).not.toBeInTheDocument()
  })

  it('los gráficos se apilan por debajo de 1280px y van lado a lado desde ahí', () => {
    renderDashboard()

    const fila = screen.getByRole('region', { name: 'Gasto por categoría' }).parentElement
    expect(fila?.className).toContain('xl:grid-cols-2')
    expect(fila?.className).not.toContain('lg:grid-cols-2')
  })
})
