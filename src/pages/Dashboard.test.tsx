import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import Dashboard from './Dashboard'
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

vi.mock('@/features/dashboard/hooks', () => ({
  useAllTransactions: () => useAllTransactions(),
}))
vi.mock('@/features/budgets/hooks', () => ({
  useBudgets: () => useBudgets(),
  useBudgetProgress: (options: unknown) => useBudgetProgress(options),
}))
vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => useAccounts(),
}))
vi.mock('@/features/categories/hooks', () => ({
  useCategories: () => useCategories(),
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

  it('lista los últimos movimientos del mes', () => {
    renderDashboard()

    const panel = within(screen.getByRole('region', { name: 'Últimos movimientos' }))
    expect(panel.getByText('Cine')).toBeInTheDocument()
    expect(panel.getByText('Mercado del mes')).toBeInTheDocument()
    expect(panel.getByText('Salario')).toBeInTheDocument()
  })

  it('«Ver todos» de los últimos movimientos abre Movimientos en el mes que se está viendo', () => {
    renderDashboard()

    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2026-03' } })

    const panel = within(screen.getByRole('region', { name: 'Últimos movimientos' }))
    expect(panel.getByRole('link', { name: 'Ver todos' })).toHaveAttribute(
      'href',
      '/transactions?month=2026-03',
    )
  })

  it('recalcula todo al filtrar por una cuenta', async () => {
    const user = userEvent.setup()
    renderDashboard()

    await user.selectOptions(screen.getByLabelText('Cuenta'), 'acc-2')

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

    const panel = within(screen.getByRole('region', { name: 'Últimos movimientos' }))
    expect(panel.getByText(/Sin movimientos en enero 2020/i)).toBeInTheDocument()
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

    it('los últimos movimientos incluyen todas las monedas, cada uno en la suya', () => {
      renderDashboard()

      const panel = within(screen.getByRole('region', { name: 'Últimos movimientos' }))
      expect(panel.getByText('Pago en dólares')).toBeInTheDocument()
      expect(panel.getByText(/USD 500/)).toBeInTheDocument()
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

      await user.selectOptions(screen.getByLabelText('Cuenta'), 'acc-usd')

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

      await user.selectOptions(screen.getByLabelText('Cuenta'), 'acc-usd')

      expect(kpi('Saldo consolidado').getByText('USD 1.300')).toBeInTheDocument()
      expect(kpi('Gastos del mes').getByText('USD 200')).toBeInTheDocument()
      expect(screen.queryByText(/Otras monedas/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Cifras en/)).not.toBeInTheDocument()
    })
  })
})
