import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlanError } from '@/features/plan/errors'
import { currentMonthKey, shiftMonthKey } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

import Plan from './Plan'

const usePlanMonth = vi.fn()
const usePlanLines = vi.fn()
const useCategoryClassifications = vi.fn()
const useEffectiveCategoryBudgets = vi.fn()
const usePlanActuals = vi.fn()
const usePlanIncomeSources = vi.fn()
const usePlanAllocations = vi.fn()
const usePlanIncomeSourceCategories = vi.fn()
const createPlanMonth = vi.fn()
const saveIncomeSource = vi.fn()
const deleteIncomeSource = vi.fn()
const saveAllocations = vi.fn()
const usePlanLineProgress = vi.fn()
const usePlanContributionBalances = vi.fn()
const useZeroBudgetCategoryIds = vi.fn()
const savePlanLine = vi.fn()
const deletePlanLine = vi.fn()
const saveContributionLine = vi.fn()
const useAccounts = vi.fn()
const usePrimaryCurrency = vi.fn()

vi.mock('@/features/plan/hooks', () => ({
  usePlanMonth: () => usePlanMonth(),
  usePlanLines: () => usePlanLines(),
  useEffectiveCategoryBudgets: () => useEffectiveCategoryBudgets(),
  usePlanActuals: (options: unknown) => usePlanActuals(options),
  usePlanIncomeSources: (planMonthId: unknown) => usePlanIncomeSources(planMonthId),
  usePlanAllocations: (planMonthId: unknown) => usePlanAllocations(planMonthId),
  usePlanIncomeSourceCategories: (planMonthId: unknown) =>
    usePlanIncomeSourceCategories(planMonthId),
  useCreatePlanMonth: () => ({ mutateAsync: createPlanMonth, isPending: false }),
  useSaveIncomeSource: () => ({ mutateAsync: saveIncomeSource, isPending: false }),
  useDeleteIncomeSource: () => ({ mutateAsync: deleteIncomeSource, isPending: false }),
  useSaveAllocations: () => ({ mutateAsync: saveAllocations, isPending: false }),
  usePlanLineProgress: (options: unknown) => usePlanLineProgress(options),
  usePlanContributionBalances: (monthKey: unknown, currencyCode: unknown) =>
    usePlanContributionBalances(monthKey, currencyCode),
  useZeroBudgetCategoryIds: (monthKey: unknown) => useZeroBudgetCategoryIds(monthKey),
  useSavePlanLine: () => ({ mutateAsync: savePlanLine, isPending: false }),
  useDeletePlanLine: () => ({ mutateAsync: deletePlanLine, isPending: false }),
  useSaveContributionLine: () => ({ mutateAsync: saveContributionLine, isPending: false }),
}))

vi.mock('@/features/categories/hooks', () => ({
  useCategories: () => ({ data: categories }),
}))

// La clasificación pertenece al dominio de las categorías: su hook vive ahí y
// `/plan` solo lo consume.
vi.mock('@/features/categories/classifications/hooks', () => ({
  useCategoryClassifications: () => useCategoryClassifications(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}))

vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => useAccounts(),
}))

vi.mock('@/features/profile/hooks', () => ({
  usePrimaryCurrency: () => usePrimaryCurrency(),
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()

const CAT_RENT = 'cat-rent'
const CAT_FOOD = 'cat-food'
const CAT_LOAN = 'cat-loan'
const ACC_SAVINGS = 'acc-ahorro'

/**
 * Cuentas del usuario. La primera fija la moneda de presentación; la de ahorro
 * alimenta la línea de aporte del fixture; la archivada no se ofrece para
 * aportes nuevos. No hay ninguna de inversión.
 */
const planAccounts = [
  { id: 'acc-1', name: 'Banco', type: 'checking', is_archived: false, currency_code: 'COP' },
  { id: ACC_SAVINGS, name: 'Fondo', type: 'savings', is_archived: false, currency_code: 'COP' },
  { id: 'acc-reserva', name: 'Reserva', type: 'savings', is_archived: false, currency_code: 'COP' },
  { id: 'acc-vieja', name: 'Vieja', type: 'savings', is_archived: true, currency_code: 'COP' },
] as Tables<'accounts'>[]

/** Estado de una consulta resuelta con éxito. */
function resolved<T>(data: T) {
  return { data, isPending: false, isError: false, error: null }
}

const planMonth = { id: 'plan-month-1', period_month: '2026-04-01' } as Tables<'plan_months'>

const lines = [
  {
    id: 'l1',
    kind: 'bill',
    category_id: CAT_RENT,
    planned_minor: null,
    name: 'Arriendo',
    due_date: null,
    position: 0,
  },
  {
    id: 'l2',
    kind: 'variable',
    category_id: CAT_FOOD,
    planned_minor: null,
    name: 'Mercado',
    due_date: null,
    position: 1,
  },
  {
    id: 'l3',
    kind: 'savings',
    category_id: null,
    account_id: ACC_SAVINGS,
    planned_minor: 400_000,
    name: 'Ahorro',
    due_date: null,
    position: 2,
  },
] as Tables<'plan_lines'>[]

const classifications = [
  { id: 'c1', category_id: CAT_LOAN, budget_group: 'debt' },
] as Tables<'category_classifications'>[]

const effectiveBudgets = { [CAT_RENT]: 400_000, [CAT_FOOD]: 350_000, [CAT_LOAN]: 60_000 }

const incomeSources = [
  { id: 'src-1', name: 'Salario', planned_minor: 1_400_000, position: 0 },
] as Tables<'plan_income_sources'>[]

const categories = [
  { id: 'cat-salario', name: 'Salario', type: 'income', is_archived: false },
  { id: 'cat-bono', name: 'Bono', type: 'income', is_archived: false },
  { id: 'cat-viejo', name: 'Antiguo', type: 'income', is_archived: true },
  { id: CAT_RENT, name: 'Arriendo', type: 'expense', is_archived: false },
  { id: CAT_FOOD, name: 'Alimentación', type: 'expense', is_archived: false },
  { id: 'cat-salud', name: 'Salud', type: 'expense', is_archived: false },
  // Con presupuesto y sin línea: alimenta la reconciliación.
  { id: CAT_LOAN, name: 'Préstamo', type: 'expense', is_archived: false },
] as Tables<'categories'>[]

const incomeSourceLinks = [
  { id: 'l1', plan_income_source_id: 'src-1', category_id: 'cat-salario' },
] as Tables<'plan_income_source_categories'>[]

const allocations = [
  { id: 'a1', budget_group: 'needs', percent_bp: 5_000 },
  { id: 'a2', budget_group: 'wants', percent_bp: 3_000 },
  { id: 'a3', budget_group: 'savings', percent_bp: 2_000 },
] as Tables<'plan_allocations'>[]

/** Progreso por categoría de las líneas del fixture, como lo da /budgets. */
const lineProgress = [
  {
    categoryId: CAT_RENT,
    budgetMinor: 400_000,
    spentMinor: 400_000,
    remainingMinor: 0,
    ratio: 1,
    status: 'ok',
    source: 'template',
  },
  {
    categoryId: CAT_FOOD,
    budgetMinor: 350_000,
    spentMinor: 300_000,
    remainingMinor: 50_000,
    ratio: 300_000 / 350_000,
    status: 'ok',
    source: 'template',
  },
]

const actuals = {
  incomeActualMinor: 1_400_000,
  expenseActualMinor: 800_000,
  byLine: { billsMinor: 400_000, variablesMinor: 300_000, unplannedMinor: 100_000 },
  byGroup: {
    needsMinor: 600_000,
    wantsMinor: 150_000,
    debtMinor: 50_000,
    sinClasificarMinor: 0,
  },
  savingsContributionsMinor: 400_000,
  investmentContributionsMinor: 0,
  incomeBySource: {
    bySource: { 'src-1': 1_400_000 },
    unattributedMinor: 0,
    ambiguousCategoryIds: [],
  },
  exclusions: { count: 0, currencyCodes: [] as string[] },
}

/** Saldos al cierre del mes, como los da `usePlanContributionBalances`. */
const contributionBalances = {
  savings: { balanceMinor: 700_000, accountCount: 2, archivedCount: 0, otherCurrencyCount: 0 },
  investment: { balanceMinor: 0, accountCount: 0, archivedCount: 0, otherCurrencyCount: 0 },
  asOfDate: '2026-04-30',
}

function renderPlan() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Plan />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Celdas de una fila del cuadro, en el orden planeado, actual y diferencia. */
function comparisonTable(): HTMLElement {
  return screen.getByRole('table', { name: /Presupuesto frente a lo real/ })
}

function rowCells(name: string): string[] {
  const table = comparisonTable()
  const header = within(table).getByRole('rowheader', { name })
  const row = header.closest('tr')
  if (!row) throw new Error(`No se encontró la fila «${name}»`)

  return Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')
}

/** Importe de una celda ya formateada: 'COP 400.000' → 400000. */
function amountOf(text: string): number {
  return Number(text.replace(/[^\d-]/g, ''))
}

beforeEach(() => {
  useAccounts.mockReturnValue({ data: planAccounts })
  usePrimaryCurrency.mockReturnValue({ data: 'COP', isPending: false })
  usePlanMonth.mockReturnValue(resolved(planMonth))
  usePlanLines.mockReturnValue(resolved(lines))
  useCategoryClassifications.mockReturnValue(resolved(classifications))
  useEffectiveCategoryBudgets.mockReturnValue(resolved(effectiveBudgets))
  usePlanActuals.mockReturnValue(resolved(actuals))
  usePlanIncomeSources.mockReturnValue(resolved(incomeSources))
  usePlanAllocations.mockReturnValue(resolved(allocations))
  usePlanIncomeSourceCategories.mockReturnValue(resolved(incomeSourceLinks))
  createPlanMonth.mockResolvedValue(planMonth)
  saveIncomeSource.mockResolvedValue(undefined)
  deleteIncomeSource.mockResolvedValue(undefined)
  saveAllocations.mockReset()
  saveAllocations.mockResolvedValue(undefined)
  usePlanLineProgress.mockReturnValue(resolved(lineProgress))
  usePlanContributionBalances.mockReturnValue(resolved(contributionBalances))
  useZeroBudgetCategoryIds.mockReturnValue(resolved(new Set<string>()))
  savePlanLine.mockReset()
  savePlanLine.mockResolvedValue(undefined)
  deletePlanLine.mockReset()
  deletePlanLine.mockResolvedValue(undefined)
  saveContributionLine.mockReset()
  saveContributionLine.mockResolvedValue(undefined)
  toastError.mockClear()
  toastSuccess.mockClear()
})

const GRUPOS = ['Necesidades', 'Deseos', 'Ahorro', 'Inversión', 'Deuda']

/** Celdas de una fila del reparto: porcentaje, planeado, actual y diferencia. */
function allocationCells(name: string): string[] {
  const table = screen.getByRole('table', { name: /Reparto del ingreso planeado/ })
  const header = within(table).getByRole('rowheader', { name })
  const row = header.closest('tr')
  if (!row) throw new Error(`No se encontro el grupo ${name}`)

  return Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')
}

describe('Plan', () => {
  it('muestra el mes en pantalla y permite cambiarlo', async () => {
    const user = userEvent.setup()
    renderPlan()

    expect(screen.getByRole('heading', { name: 'Plan mensual', level: 1 })).toBeInTheDocument()
    const month = screen.getByLabelText('Mes')
    const initial = (month as HTMLInputElement).value

    await user.click(screen.getByRole('button', { name: /Mes anterior/ }))

    expect((screen.getByLabelText('Mes') as HTMLInputElement).value).not.toBe(initial)
  })

  it('ningún valor «Actual» es editable: el mes es el único control de datos', () => {
    renderPlan()

    const editable = document.querySelectorAll(
      'input, textarea, select, [contenteditable="true"], button[aria-pressed]',
    )
    const inputs = Array.from(editable).filter(
      (element) => element.getAttribute('type') !== 'month',
    )

    expect(inputs).toHaveLength(0)
    expect(screen.getByLabelText('Mes')).toBeInTheDocument()
  })

  it('muestra las seis tarjetas del resumen, con el ahorro como aportes del mes', () => {
    renderPlan()

    const summary = screen.getByRole('region', { name: 'Resumen del mes' })

    for (const label of [
      'Ingreso total',
      'Total gastado',
      'Presupuesto asignado',
      'Por asignar',
      'Restante',
      'Aportes a ahorro',
    ]) {
      expect(within(summary).getByRole('heading', { name: label })).toBeInTheDocument()
    }

    expect(within(summary).queryByText('Total ahorrado')).not.toBeInTheDocument()
  })

  it('separa lo planeado de lo real en cada fila', () => {
    renderPlan()

    expect(rowCells('Facturas')).toEqual(['COP 400.000', 'COP 400.000', 'En objetivo'])
    expect(rowCells('Gastos variables')).toEqual([
      'COP 350.000',
      'COP 300.000',
      'Favorable por COP 50.000',
    ])
  })

  it('dice «Sin presupuesto» en No planeado, nunca un 0', () => {
    renderPlan()

    const [planned, actual] = rowCells('No planeado')

    expect(planned).toBe('Sin presupuesto')
    expect(actual).toBe('COP 100.000')
  })

  it('cumple la identidad facturas + variables + no planeado = gastos totales', () => {
    renderPlan()

    const bills = amountOf(rowCells('Facturas')[1])
    const variables = amountOf(rowCells('Gastos variables')[1])
    const unplanned = amountOf(rowCells('No planeado')[1])
    const total = amountOf(rowCells('Gastos totales')[1])

    expect(bills + variables + unplanned).toBe(total)
  })

  it('mantiene los indicadores fuera del desglose que suma los gastos', () => {
    renderPlan()

    const table = comparisonTable()
    const breakdown = within(table).getByText('Desglose de gastos').closest('tbody')
    const indicators = within(table).getByText('Indicadores').closest('tbody')
    if (!breakdown || !indicators) throw new Error('No se encontraron los grupos del cuadro')

    expect(within(breakdown).getByRole('rowheader', { name: 'Gastos totales' })).toBeInTheDocument()
    expect(within(breakdown).queryByRole('rowheader', { name: 'Ahorro' })).not.toBeInTheDocument()

    for (const name of ['Ahorro', 'Inversión', 'Deuda']) {
      expect(within(indicators).getByRole('rowheader', { name })).toBeInTheDocument()
    }
    expect(
      within(indicators).queryByRole('rowheader', { name: 'Facturas' }),
    ).not.toBeInTheDocument()
  })

  it('dice la diferencia en texto, no solo con color', () => {
    renderPlan()

    expect(rowCells('Gastos totales')[2]).toBe('Desfavorable por COP 50.000')
    expect(rowCells('Deuda')[2]).toBe('Favorable por COP 10.000')
    expect(rowCells('Ingresos')[2]).toBe('En objetivo')
  })

  it('conserva concepto, planeado, actual y diferencia en la versión móvil', () => {
    renderPlan()

    const cards = screen.getByRole('list', { name: /Presupuesto frente a lo real/ })
    const bills = within(cards).getByText('Facturas').closest('li')
    if (!bills) throw new Error('No se encontró la tarjeta de facturas')

    expect(within(bills).getByText('Planeado')).toBeInTheDocument()
    expect(within(bills).getByText('Actual')).toBeInTheDocument()
    expect(within(bills).getByText('Diferencia')).toBeInTheDocument()
    expect(within(bills).getAllByText('COP 400.000')).toHaveLength(2)
  })

  describe('sin ingreso planeado', () => {
    beforeEach(() => {
      usePlanIncomeSources.mockReturnValue(resolved([]))
    })

    it('no muestra «Sobreasignado» ni un negativo desnudo en Por asignar', () => {
      renderPlan()

      const summary = screen.getByRole('region', { name: 'Resumen del mes' })
      const card = within(summary).getByRole('heading', { name: 'Por asignar' }).closest('section')
      if (!card) throw new Error('No se encontró la tarjeta de Por asignar')

      expect(within(card).getByText('Sin ingreso planeado')).toBeInTheDocument()
      expect(within(card).queryByText(/Sobreasignado/)).not.toBeInTheDocument()
      expect(within(card).queryByText(/-/)).not.toBeInTheDocument()
    })

    it('tampoco lo muestra en la fila de Restante', () => {
      renderPlan()

      expect(rowCells('Restante')[0]).toBe('Sin ingreso planeado')
    })

    it('la diferencia dice lo mismo que el planeado: la fila no se contradice', () => {
      renderPlan()

      const ingresos = rowCells('Ingresos')
      const restante = rowCells('Restante')

      expect(ingresos[2]).toBe('Sin ingreso planeado')
      expect(restante[2]).toBe('Sin ingreso planeado')
      expect(ingresos[2]).toBe(ingresos[0])
      expect(restante[2]).toBe(restante[0])
    })

    it('las filas de gasto siguen diciendo «Sin presupuesto»', () => {
      renderPlan()

      expect(rowCells('No planeado')[2]).toBe('Sin presupuesto')
    })
  })

  describe('restante negativo', () => {
    beforeEach(() => {
      usePlanActuals.mockReturnValue(
        resolved({
          ...actuals,
          incomeActualMinor: 100_000,
          expenseActualMinor: 500_000,
        }),
      )
    })

    it('destaca la cifra, sin quitarle el signo al texto', () => {
      renderPlan()

      const summary = screen.getByRole('region', { name: 'Resumen del mes' })
      const card = within(summary).getByRole('heading', { name: 'Restante' }).closest('section')
      if (!card) throw new Error('No se encontró la tarjeta de Restante')

      // 100.000 − 500.000 − 400.000 de aportes.
      const value = within(card).getByText('COP -800.000')

      expect(value).toBeInTheDocument()
      expect(value.className).toContain('text-danger')
    })

    it('un restante positivo no se marca como problema', () => {
      usePlanActuals.mockReturnValue(resolved(actuals))
      renderPlan()

      const summary = screen.getByRole('region', { name: 'Resumen del mes' })
      const card = within(summary).getByRole('heading', { name: 'Restante' }).closest('section')
      if (!card) throw new Error('No se encontró la tarjeta de Restante')

      // 1.400.000 − 800.000 − 400.000 de aportes.
      expect(within(card).getByText('COP 200.000').className).not.toContain('text-danger')
    })
  })

  it('dice «Sobreasignado» cuando lo asignado supera el ingreso planeado', () => {
    usePlanIncomeSources.mockReturnValue(
      resolved([
        { id: 'src-1', planned_minor: 1_000_000, position: 0 },
      ] as Tables<'plan_income_sources'>[]),
    )
    renderPlan()

    const summary = screen.getByRole('region', { name: 'Resumen del mes' })

    // 1.210.000 asignados contra 1.000.000 planeados.
    expect(within(summary).getByText('Sobreasignado por COP 210.000')).toBeInTheDocument()
  })

  describe('mes sin plan', () => {
    beforeEach(() => {
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanIncomeSources.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
    })

    it('lo trata como un estado normal y no como un error', () => {
      renderPlan()

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText(/todavía no tiene plan/)).toBeInTheDocument()
    })

    it('sigue mostrando las cifras reales del mes', () => {
      renderPlan()

      expect(rowCells('Gastos totales')[1]).toBe('COP 800.000')
      expect(rowCells('Ingresos')[0]).toBe('Sin ingreso planeado')
    })

    it('sin plan y sin movimientos muestra un único vacío', () => {
      usePlanActuals.mockReturnValue(
        resolved({
          ...actuals,
          incomeActualMinor: 0,
          expenseActualMinor: 0,
          byLine: { billsMinor: 0, variablesMinor: 0, unplannedMinor: 0 },
          byGroup: { needsMinor: 0, wantsMinor: 0, debtMinor: 0, sinClasificarMinor: 0 },
          savingsContributionsMinor: 0,
          investmentContributionsMinor: 0,
        }),
      )
      renderPlan()

      expect(screen.getByText(/todavía no tiene nada que comparar/)).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Registrar movimiento' })).toHaveAttribute(
        'href',
        `/transactions?month=${currentMonthKey()}`,
      )
    })

    it('«Registrar movimiento» abre Movimientos en el mes elegido, no en el actual', async () => {
      usePlanActuals.mockReturnValue(
        resolved({
          ...actuals,
          incomeActualMinor: 0,
          expenseActualMinor: 0,
          byLine: { billsMinor: 0, variablesMinor: 0, unplannedMinor: 0 },
          byGroup: { needsMinor: 0, wantsMinor: 0, debtMinor: 0, sinClasificarMinor: 0 },
          savingsContributionsMinor: 0,
          investmentContributionsMinor: 0,
        }),
      )
      const user = userEvent.setup()
      renderPlan()

      await user.click(screen.getByRole('button', { name: /Mes anterior/ }))

      expect(screen.getByRole('link', { name: 'Registrar movimiento' })).toHaveAttribute(
        'href',
        `/transactions?month=${shiftMonthKey(currentMonthKey(), -1)}`,
      )
    })
  })

  it('anuncia el error con un aviso accesible y ofrece reintentar', () => {
    usePlanActuals.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: new Error('boom'),
    })
    renderPlan()

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('mientras carga no muestra cifras a medias', () => {
    usePlanActuals.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    })
    renderPlan()

    expect(screen.getByRole('status')).toHaveTextContent(/Cargando el plan/)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('reparto 50/30/20', () => {
    it('muestra los cinco grupos en el orden del desempate, con su porcentaje', () => {
      renderPlan()

      const table = screen.getByRole('table', { name: /Reparto del ingreso planeado/ })
      const grupos = within(table)
        .getAllByRole('rowheader')
        .map((header) => header.textContent?.trim())

      expect(grupos.slice(0, 5)).toEqual(['Necesidades', 'Deseos', 'Ahorro', 'Inversión', 'Deuda'])
      expect(allocationCells('Necesidades')[0]).toBe('50 %')
      expect(allocationCells('Deseos')[0]).toBe('30 %')
      expect(allocationCells('Ahorro')[0]).toBe('20 %')
      // Un grupo sin porcentaje propio recibe 0, no un valor sin definir.
      expect(allocationCells('Deuda')[0]).toBe('0 %')
    })

    it('reparte el ingreso planeado con resolveAllocation', () => {
      renderPlan()

      expect(allocationCells('Necesidades')[1]).toBe('COP 700.000')
      expect(allocationCells('Deseos')[1]).toBe('COP 420.000')
      expect(allocationCells('Ahorro')[1]).toBe('COP 280.000')
      expect(allocationCells('Inversión')[1]).toBe('COP 0')
    })

    it('la suma de los cinco grupos es exactamente el ingreso planeado', () => {
      renderPlan()

      const suma = GRUPOS.map((grupo) => amountOf(allocationCells(grupo)[1])).reduce(
        (total, amount) => total + amount,
        0,
      )

      expect(suma).toBe(1_400_000)
      expect(screen.getAllByText('Total repartido').length).toBeGreaterThan(0)
    })

    it('cuadra igual cuando el reparto exige desempatar por mayor resto', () => {
      usePlanIncomeSources.mockReturnValue(
        resolved([
          { id: 'src-1', planned_minor: 1_000_001, position: 0 },
        ] as Tables<'plan_income_sources'>[]),
      )
      renderPlan()

      const suma = GRUPOS.map((grupo) => amountOf(allocationCells(grupo)[1])).reduce(
        (total, amount) => total + amount,
        0,
      )

      // La unidad sobrante va al mayor resto, que aquí es Necesidades.
      expect(allocationCells('Necesidades')[1]).toBe('COP 500.001')
      expect(suma).toBe(1_000_001)
    })

    it('el ahorro y la inversion salen de aportes, no de gastos', () => {
      renderPlan()

      // 400.000 de aportes por transferencia, no de byGroup.
      expect(allocationCells('Ahorro')[2]).toBe('COP 400.000')
      expect(allocationCells('Inversión')[2]).toBe('COP 0')
      expect(allocationCells('Necesidades')[2]).toBe('COP 600.000')
    })

    it('gastar de menos es favorable y aportar de menos es desfavorable', () => {
      renderPlan()

      // Necesidades: 600.000 reales contra 700.000 asignados.
      expect(allocationCells('Necesidades')[3]).toBe('Favorable por COP 100.000')
      // Ahorro: 400.000 aportados contra 280.000 asignados.
      expect(allocationCells('Ahorro')[3]).toBe('Favorable por COP 120.000')
    })

    it('deja el gasto sin clasificar fuera de los cinco grupos', () => {
      usePlanActuals.mockReturnValue(
        resolved({ ...actuals, byGroup: { ...actuals.byGroup, sinClasificarMinor: 90_000 } }),
      )
      renderPlan()

      const table = screen.getByRole('table', { name: /Reparto del ingreso planeado/ })
      const fila = within(table).getByRole('rowheader', { name: /Sin clasificar/ })
      const cuerpoDelReparto = within(table)
        .getByRole('rowheader', { name: 'Necesidades' })
        .closest('tbody')

      expect(fila.closest('tbody')).not.toBe(cuerpoDelReparto)
      expect(within(table).getByText(/no entra en ningún grupo/)).toBeInTheDocument()
    })

    it('avisa de un grupo que no pertenece al reparto', () => {
      usePlanAllocations.mockReturnValue(
        resolved([
          ...allocations,
          { id: 'a4', budget_group: 'caprichos', percent_bp: 1_000 },
        ] as Tables<'plan_allocations'>[]),
      )
      renderPlan()

      expect(screen.getByText(/caprichos/)).toBeInTheDocument()
      expect(screen.getByText(/pueden no sumar 100 %/)).toBeInTheDocument()
    })

    it('sin reparto configurado lo dice, sin fingir porcentajes ni ceros', () => {
      usePlanAllocations.mockReturnValue(resolved([]))
      renderPlan()

      expect(allocationCells('Necesidades')[0]).toBe('Sin definir')
      expect(allocationCells('Necesidades')[1]).toBe('Sin reparto configurado')
      expect(allocationCells('Necesidades')[3]).toBe('Sin reparto configurado')
    })

    it('un mes sin reparto no es un error, y las cifras reales se siguen viendo', () => {
      usePlanAllocations.mockReturnValue(resolved([]))
      renderPlan()

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText(/no tiene reparto configurado/)).toBeInTheDocument()
      expect(allocationCells('Ahorro')[2]).toBe('COP 400.000')
    })

    it('con reparto pero sin ingreso planeado, no hay importes que repartir', () => {
      usePlanIncomeSources.mockReturnValue(resolved([]))
      renderPlan()

      expect(allocationCells('Necesidades')[0]).toBe('50 %')
      expect(allocationCells('Necesidades')[1]).toBe('Sin ingreso planeado')
      expect(allocationCells('Necesidades')[3]).toBe('Sin ingreso planeado')
    })

    it('explica que los cinco grupos no suman los gastos totales', () => {
      renderPlan()

      expect(screen.getByText(/transferencias registradas, no gastos/)).toBeInTheDocument()
    })
  })

  describe('ingresos planeados', () => {
    it('lista las fuentes con su monto y sus categorías vinculadas', () => {
      renderPlan()

      const panel = screen.getByRole('region', { name: 'Ingresos planeados' })
      const fuente = within(panel).getByRole('listitem')

      // «Salario» aparece dos veces a propósito: es el nombre de la fuente y
      // el de la categoría que la alimenta.
      expect(within(fuente).getAllByText('Salario')).toHaveLength(2)
      expect(within(fuente).getByText('COP 1.400.000')).toBeInTheDocument()
      expect(within(panel).getByRole('button', { name: 'Editar Salario' })).toBeInTheDocument()
    })

    it('un mes con plan y sin fuentes lo dice sin fingir que no hay plan', () => {
      usePlanIncomeSources.mockReturnValue(resolved([]))
      renderPlan()

      expect(screen.getByText(/está listo/)).toBeInTheDocument()
      expect(screen.getByText(/Añade una fuente de ingreso/)).toBeInTheDocument()
      expect(screen.queryByText(/todavía no tiene plan/)).not.toBeInTheDocument()
    })

    it('sin fuentes no hay ingreso planeado; con una de 0 sí lo hay', () => {
      usePlanIncomeSources.mockReturnValue(resolved([]))
      const { unmount } = renderPlan()

      const sinFuentes = screen.getByRole('region', { name: 'Ingresos planeados' })
      expect(within(sinFuentes).getByText('Sin ingreso planeado')).toBeInTheDocument()
      unmount()

      usePlanIncomeSources.mockReturnValue(
        resolved([
          { id: 'src-1', name: 'Salario', planned_minor: 0, position: 0 },
        ] as Tables<'plan_income_sources'>[]),
      )
      renderPlan()

      const conCero = screen.getByRole('region', { name: 'Ingresos planeados' })
      expect(within(conCero).getAllByText('COP 0').length).toBeGreaterThan(0)
      expect(within(conCero).queryByText('Sin ingreso planeado')).not.toBeInTheDocument()
    })

    it('el botón de crear plan solo aparece cuando el mes no tiene plan', async () => {
      const user = userEvent.setup()
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanIncomeSources.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      usePlanIncomeSourceCategories.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      renderPlan()

      await user.click(screen.getByRole('button', { name: /Crear plan de/ }))

      expect(createPlanMonth).toHaveBeenCalledWith('2026-09')
    })

    it('tras crear el plan abre el diálogo de la primera fuente', async () => {
      const user = userEvent.setup()
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanIncomeSources.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      usePlanIncomeSourceCategories.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      renderPlan()

      await user.click(screen.getByRole('button', { name: /Crear plan de/ }))

      expect(await screen.findByRole('dialog')).toBeInTheDocument()
      expect(screen.getByText('Nueva fuente de ingreso')).toBeInTheDocument()
    })

    it('si crear el plan falla, lo dice y no abre el diálogo', async () => {
      const user = userEvent.setup()
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanIncomeSources.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      usePlanIncomeSourceCategories.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      createPlanMonth.mockRejectedValue(new PlanError('month_missing_after_conflict'))
      renderPlan()

      await user.click(screen.getByRole('button', { name: /Crear plan de/ }))

      await waitFor(() => expect(toastError).toHaveBeenCalled())
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('guarda una fuente nueva con las fuentes ya cargadas, para la posición', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(screen.getByRole('button', { name: 'Añadir fuente' }))
      await user.type(screen.getByLabelText('Nombre'), 'Freelance')
      await user.type(screen.getByLabelText('Monto planeado'), '600000')
      await user.click(screen.getByRole('button', { name: 'Añadir fuente', hidden: false }))

      await waitFor(() => expect(saveIncomeSource).toHaveBeenCalled())
      expect(saveIncomeSource.mock.calls[0][0]).toMatchObject({
        planMonthId: 'plan-month-1',
        sourceId: undefined,
        name: 'Freelance',
        plannedMinor: 600_000,
        currentCategoryIds: [],
        sources: incomeSources,
      })
    })

    it('al editar envía solo el diff de categorías y conserva las existentes', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(screen.getByRole('button', { name: 'Editar Salario' }))
      await user.click(screen.getByLabelText('Bono'))
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(saveIncomeSource).toHaveBeenCalled())
      const input = saveIncomeSource.mock.calls[0][0]

      expect(input.sourceId).toBe('src-1')
      expect(input.currentCategoryIds).toEqual(['cat-salario'])
      expect(input.categoryIds).toEqual(['cat-salario', 'cat-bono'])
    })

    it('al editar, la categoría propia sigue seleccionable y marcada', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(screen.getByRole('button', { name: 'Editar Salario' }))

      expect(screen.getByLabelText('Salario')).toBeChecked()
    })

    it('no ofrece categorías de gasto, archivadas ni de otra fuente del mes', async () => {
      const user = userEvent.setup()
      usePlanIncomeSourceCategories.mockReturnValue(
        resolved([
          { id: 'l1', plan_income_source_id: 'src-2', category_id: 'cat-bono' },
        ] as Tables<'plan_income_source_categories'>[]),
      )
      renderPlan()

      await user.click(screen.getByRole('button', { name: 'Añadir fuente' }))

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByLabelText('Salario')).toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Bono')).not.toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Antiguo')).not.toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Arriendo')).not.toBeInTheDocument()
    })

    it('no guarda una fuente sin monto', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(screen.getByRole('button', { name: 'Añadir fuente' }))
      await user.type(screen.getByLabelText('Nombre'), 'Freelance')
      await user.click(screen.getByRole('button', { name: 'Añadir fuente', hidden: false }))

      await waitFor(() => expect(screen.getByText('Ingresa un monto')).toBeInTheDocument())
      expect(saveIncomeSource).not.toHaveBeenCalled()
    })

    it('acepta una fuente de 0 y avisa de lo que significa', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(screen.getByRole('button', { name: 'Añadir fuente' }))
      await user.type(screen.getByLabelText('Nombre'), 'Bono pendiente')
      await user.type(screen.getByLabelText('Monto planeado'), '0')

      expect(screen.getByText(/cuenta como ingreso planeado de cero/)).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Añadir fuente', hidden: false }))

      await waitFor(() => expect(saveIncomeSource).toHaveBeenCalled())
      expect(saveIncomeSource.mock.calls[0][0]).toMatchObject({ plannedMinor: 0 })
    })

    it('un fallo parcial se muestra y el diálogo no miente diciendo que todo fue bien', async () => {
      const user = userEvent.setup()
      saveIncomeSource.mockRejectedValue(new PlanError('category_already_linked'))
      renderPlan()

      await user.click(screen.getByRole('button', { name: 'Editar Salario' }))
      await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(toastError).toHaveBeenCalled())
      expect(toastSuccess).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('borrar pide confirmación antes de tocar nada', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(screen.getByRole('button', { name: 'Eliminar Salario' }))
      expect(deleteIncomeSource).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Eliminar' }))

      await waitFor(() => expect(deleteIncomeSource).toHaveBeenCalledWith('src-1'))
    })

    it('el panel no aparece mientras el mes no tenga plan', () => {
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanIncomeSources.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      usePlanIncomeSourceCategories.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      renderPlan()

      expect(screen.queryByRole('region', { name: 'Ingresos planeados' })).not.toBeInTheDocument()
    })
  })

  describe('configurar el reparto', () => {
    /** Abre el diálogo del reparto y devuelve su contenido. */
    async function openAllocationDialog(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: /reparto/ }))
      return screen.getByRole('dialog')
    }

    /** Los cinco campos de porcentaje, en el orden del desempate. */
    function percentInputs(dialog: HTMLElement): string[] {
      return GRUPOS.map((grupo) => (within(dialog).getByLabelText(grupo) as HTMLInputElement).value)
    }

    /** Los cinco importes derivados, ya formateados. */
    function derivedAmounts(dialog: HTMLElement): string[] {
      return GRUPOS.map((grupo) => {
        const input = within(dialog).getByLabelText(grupo)
        const amountId = (input.getAttribute('aria-describedby') ?? '')
          .split(' ')
          .find((id) => id.endsWith('-amount'))
        const amount = amountId ? document.getElementById(amountId) : null
        if (!amount) throw new Error(`Sin importe derivado para ${grupo}`)

        return amount.textContent?.trim() ?? ''
      })
    }

    describe('preset inicial', () => {
      beforeEach(() => {
        usePlanAllocations.mockReturnValue(resolved([]))
      })

      it('abre con 50 / 30 / 20 / 0 / 0 y un total de 100 %', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)

        expect(percentInputs(dialog)).toEqual(['50', '30', '20', '0', '0'])
        expect(within(dialog).getByRole('status')).toHaveTextContent('100 %')
      })

      it('la suma de los importes es exactamente el ingreso planeado', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)
        const total = derivedAmounts(dialog).reduce((sum, text) => sum + amountOf(text), 0)

        expect(derivedAmounts(dialog)).toEqual([
          'COP 700.000',
          'COP 420.000',
          'COP 280.000',
          'COP 0',
          'COP 0',
        ])
        expect(total).toBe(1_400_000)
      })

      it('un grupo en 0 % muestra COP 0, no «sin reparto»', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)
        const [, , , inversion, deuda] = derivedAmounts(dialog)

        expect(inversion).toBe('COP 0')
        expect(deuda).toBe('COP 0')
        expect(within(dialog).queryByText(/Sin reparto configurado/)).not.toBeInTheDocument()
      })

      it('guarda las cinco filas como primera configuración, no como edición', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)
        await user.click(within(dialog).getByRole('button', { name: 'Guardar reparto' }))

        await waitFor(() => expect(saveAllocations).toHaveBeenCalled())
        expect(saveAllocations.mock.calls[0][0]).toEqual({
          planMonthId: 'plan-month-1',
          hasAllocation: false,
          percentages: { needs: 50, wants: 30, savings: 20, investment: 0, debt: 0 },
        })
      })
    })

    describe('edición', () => {
      it('abre con el reparto guardado, incluidos los grupos sin fila propia', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)

        // El mes guarda needs, wants y savings; los otros dos llegan como 0.
        expect(percentInputs(dialog)).toEqual(['50', '30', '20', '0', '0'])
      })

      it('marca el guardado como edición, para que sea un upsert y no un insert', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)
        await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

        await waitFor(() => expect(saveAllocations).toHaveBeenCalled())
        expect(saveAllocations.mock.calls[0][0]).toMatchObject({ hasAllocation: true })
      })

      it('envía el reparto completo tras cambiar un grupo', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)
        const deseos = within(dialog).getByLabelText('Deseos')
        const inversion = within(dialog).getByLabelText('Inversión')

        await user.clear(deseos)
        await user.type(deseos, '20')
        await user.clear(inversion)
        await user.type(inversion, '10')
        await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

        await waitFor(() => expect(saveAllocations).toHaveBeenCalled())
        expect(saveAllocations.mock.calls[0][0].percentages).toEqual({
          needs: 50,
          wants: 20,
          savings: 20,
          investment: 10,
          debt: 0,
        })
      })
    })

    it('no guarda un reparto que no suma 100 y dice por qué', async () => {
      const user = userEvent.setup()
      renderPlan()

      const dialog = await openAllocationDialog(user)
      const deseos = within(dialog).getByLabelText('Deseos')

      await user.clear(deseos)
      await user.type(deseos, '40')

      await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('110 %'))
      expect(within(dialog).getByText(/deben sumar exactamente 100/)).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

      expect(saveAllocations).not.toHaveBeenCalled()
    })

    it('sin un total válido no previsualiza importes inventados', async () => {
      const user = userEvent.setup()
      renderPlan()

      const dialog = await openAllocationDialog(user)
      const deseos = within(dialog).getByLabelText('Deseos')

      await user.clear(deseos)
      await user.type(deseos, '40')

      await waitFor(() =>
        expect(derivedAmounts(dialog).every((text) => !text.includes('COP'))).toBe(true),
      )
    })

    describe('sin ingreso planeado', () => {
      beforeEach(() => {
        usePlanIncomeSources.mockReturnValue(resolved([]))
      })

      it('deja ver los porcentajes y dice que no hay importe que repartir', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)

        expect(percentInputs(dialog)).toEqual(['50', '30', '20', '0', '0'])
        expect(derivedAmounts(dialog)).toEqual(Array(5).fill('Sin ingreso planeado'))
      })

      it('permite guardar igual: el reparto pertenece al plan, no al ingreso', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)
        await user.click(within(dialog).getByRole('button', { name: /Guardar/ }))

        await waitFor(() => expect(saveAllocations).toHaveBeenCalled())
        expect(saveAllocations.mock.calls[0][0].percentages).toEqual({
          needs: 50,
          wants: 30,
          savings: 20,
          investment: 0,
          debt: 0,
        })
      })
    })

    describe('conflicto con otra sesión', () => {
      beforeEach(() => {
        saveAllocations.mockRejectedValue(new PlanError('conflict'))
      })

      it('lo dice sin filtrar SQLSTATE, constraints ni identificadores', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)
        await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

        await waitFor(() => expect(toastError).toHaveBeenCalled())
        const [fallback, options] = toastError.mock.calls[0] as [string, { description?: string }]

        expect(`${fallback} ${options.description ?? ''}`).not.toMatch(
          /23505|P0001|PGRST|constraint|_key|_fkey|uuid/i,
        )
      })

      it('no afirma que el reparto quedó guardado', async () => {
        const user = userEvent.setup()
        renderPlan()

        const dialog = await openAllocationDialog(user)
        await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

        await waitFor(() => expect(toastError).toHaveBeenCalled())
        expect(toastSuccess).not.toHaveBeenCalled()
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })

    it('confirma el guardado solo cuando de verdad ocurrió', async () => {
      const user = userEvent.setup()
      renderPlan()

      const dialog = await openAllocationDialog(user)
      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Reparto guardado'))
      expect(toastError).not.toHaveBeenCalled()
    })

    it('el botón no aparece mientras el mes no tenga plan', () => {
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanIncomeSources.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      usePlanIncomeSourceCategories.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      renderPlan()

      expect(screen.queryByRole('button', { name: /reparto/ })).not.toBeInTheDocument()
    })
  })

  describe('enlace a la clasificación', () => {
    it('aparece solo cuando queda gasto sin clasificar', () => {
      usePlanActuals.mockReturnValue(
        resolved({ ...actuals, byGroup: { ...actuals.byGroup, sinClasificarMinor: 90_000 } }),
      )
      renderPlan()

      const enlace = screen.getByRole('link', { name: 'Clasificar categorías' })

      expect(enlace).toHaveAttribute('href', '/settings')
      expect(screen.getByText(/COP 90.000 sin/)).toBeInTheDocument()
    })

    it('no aparece cuando todo el gasto está clasificado', () => {
      renderPlan()

      expect(screen.queryByRole('link', { name: 'Clasificar categorías' })).not.toBeInTheDocument()
    })

    it('dice que el grupo se elige en Ajustes y vale para todos los meses', () => {
      usePlanActuals.mockReturnValue(
        resolved({ ...actuals, byGroup: { ...actuals.byGroup, sinClasificarMinor: 90_000 } }),
      )
      renderPlan()

      expect(
        screen.getByText(/se elige en Ajustes y vale para todos los meses/),
      ).toBeInTheDocument()
    })
  })
  describe('ahorro e inversión', () => {
    function block(): HTMLElement {
      return screen.getByRole('region', { name: 'Ahorro e inversión' })
    }

    function sectionHeading(name: string): HTMLElement {
      return screen.getByRole('heading', { name, level: 2 })
    }

    function follows(first: HTMLElement, second: HTMLElement): boolean {
      return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
    }

    it('va después de Facturas y gastos variables y antes de Presupuesto vs. Actual', () => {
      renderPlan()

      const bloque = sectionHeading('Ahorro e inversión')

      expect(follows(sectionHeading('Facturas y gastos variables'), bloque)).toBe(true)
      expect(follows(bloque, sectionHeading('Presupuesto vs. Actual'))).toBe(true)
    })

    it('pide el saldo del mes en pantalla, y el del mes elegido al cambiarlo', async () => {
      const user = userEvent.setup()
      renderPlan()

      expect(usePlanContributionBalances).toHaveBeenCalledWith(currentMonthKey(), 'COP')

      await user.click(screen.getByRole('button', { name: /Mes anterior/ }))

      expect(usePlanContributionBalances).toHaveBeenLastCalledWith(
        shiftMonthKey(currentMonthKey(), -1),
        'COP',
      )
    })

    it('muestra los aportes del mes con su planeado, y el saldo como dato aparte', () => {
      renderPlan()

      const ahorro = within(block()).getByRole('region', { name: 'Ahorro' })
      const inversion = within(block()).getByRole('region', { name: 'Inversión' })

      // Los 400.000 aportados y la línea de ahorro de 400.000 del fixture.
      expect(within(ahorro).getAllByText('COP 400.000')).toHaveLength(1)
      expect(within(ahorro).getByText('Planeado: COP 400.000')).toBeInTheDocument()
      expect(within(ahorro).getByText('COP 700.000')).toBeInTheDocument()
      expect(within(inversion).getByText('Planeado: Sin aportes planeados')).toBeInTheDocument()
      expect(within(inversion).getByText('Sin cuentas de inversión')).toBeInTheDocument()
    })

    it('el saldo no entra en el Restante ni en el cuadro', () => {
      const { unmount } = renderPlan()
      const restante = rowCells('Restante')
      const ahorro = rowCells('Ahorro')
      unmount()

      usePlanContributionBalances.mockReturnValue(
        resolved({
          ...contributionBalances,
          savings: { balanceMinor: 9_000_000, accountCount: 3, archivedCount: 1 },
        }),
      )
      renderPlan()

      expect(rowCells('Restante')).toEqual(restante)
      expect(rowCells('Ahorro')).toEqual(ahorro)
    })

    it('si el saldo falla, la pantalla no entra en error', () => {
      usePlanContributionBalances.mockReturnValue({
        data: undefined,
        isPending: false,
        isError: true,
        error: new Error('boom'),
      })
      renderPlan()

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(within(block()).getAllByText(/No pudimos calcular el saldo\./)).toHaveLength(2)
      expect(comparisonTable()).toBeInTheDocument()
    })

    it('mientras el saldo carga, el resto del plan ya se muestra', () => {
      usePlanContributionBalances.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      renderPlan()

      expect(within(block()).getAllByText('Calculando saldo…')).toHaveLength(2)
      expect(comparisonTable()).toBeInTheDocument()
    })

    it('también aparece en un mes sin plan, porque sus cifras son reales', () => {
      usePlanMonth.mockReturnValue(resolved(null))
      renderPlan()

      expect(screen.getByText(/todavía no tiene plan/)).toBeInTheDocument()
      expect(block()).toBeInTheDocument()
    })

    it('nunca dice «Total ahorrado» en toda la pantalla', () => {
      renderPlan()

      expect(screen.queryByText(/Total ahorrado/)).not.toBeInTheDocument()
    })
  })

  describe('aportes sin planificar', () => {
    beforeEach(() => {
      usePlanLines.mockReturnValue(resolved(lines.filter((line) => line.kind !== 'savings')))
    })

    it('la tarjeta del resumen dice «Sin aportes planeados», no «Sin presupuesto»', () => {
      renderPlan()

      const summary = screen.getByRole('region', { name: 'Resumen del mes' })
      const card = within(summary)
        .getByRole('heading', { name: 'Aportes a ahorro' })
        .closest('section')
      if (!card) throw new Error('No se encontró la tarjeta de Aportes a ahorro')

      expect(within(card).getByText('Planeado: Sin aportes planeados')).toBeInTheDocument()
      expect(within(card).queryByText(/Sin presupuesto/)).not.toBeInTheDocument()
    })

    it('las filas Ahorro e Inversión del cuadro dicen lo mismo en planeado y diferencia', () => {
      renderPlan()

      for (const name of ['Ahorro', 'Inversión']) {
        const [planned, , diff] = rowCells(name)
        expect(planned).toBe('Sin aportes planeados')
        expect(diff).toBe('Sin aportes planeados')
      }
    })

    it('las filas de gasto siguen diciendo «Sin presupuesto»', () => {
      renderPlan()

      expect(rowCells('No planeado')[0]).toBe('Sin presupuesto')
    })
  })

  describe('aportes planeados', () => {
    function savingsCard(): HTMLElement {
      const block = screen.getByRole('region', { name: 'Ahorro e inversión' })
      return within(block).getByRole('region', { name: 'Ahorro' })
    }

    function investmentCard(): HTMLElement {
      const block = screen.getByRole('region', { name: 'Ahorro e inversión' })
      return within(block).getByRole('region', { name: 'Inversión' })
    }

    function summaryCard(name: string): HTMLElement {
      const summary = screen.getByRole('region', { name: 'Resumen del mes' })
      const card = within(summary).getByRole('heading', { name }).closest('section')
      if (!card) throw new Error(`No se encontró la tarjeta «${name}»`)
      return card
    }

    it('lista la línea de aporte del mes en su tarjeta, con cuenta e importe', () => {
      renderPlan()

      const lista = within(savingsCard()).getByRole('list', { name: 'Aportes a ahorro planeados' })
      expect(within(lista).getByRole('listitem')).toHaveTextContent('Ahorro · Fondo · COP 400.000')
    })

    it('no mezcla los aportes con las facturas y los gastos variables', () => {
      renderPlan()

      const lineas = screen.getByRole('region', { name: 'Facturas y gastos variables' })
      expect(within(lineas).queryByText('Ahorro')).not.toBeInTheDocument()
      expect(within(lineas).queryByText(/Fondo/)).not.toBeInTheDocument()
    })

    it('ofrece añadir aportes a ahorro y explica por qué no a inversión', () => {
      renderPlan()

      expect(
        within(savingsCard()).getByRole('button', { name: 'Añadir aporte a ahorro' }),
      ).toBeInTheDocument()
      expect(
        within(investmentCard()).queryByRole('button', { name: /Añadir aporte/ }),
      ).not.toBeInTheDocument()
      expect(
        within(investmentCard()).getByText(
          /Necesitas una cuenta de inversión para planificar un aporte\./,
        ),
      ).toBeInTheDocument()
    })

    it('crea un aporte con su tipo, la cuenta elegida y el importe', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(
        within(savingsCard()).getByRole('button', { name: 'Añadir aporte a ahorro' }),
      )

      const dialog = await screen.findByRole('dialog')
      expect(
        within(dialog).getByRole('heading', { name: 'Nuevo aporte a ahorro' }),
      ).toBeInTheDocument()

      // Fondo ya tiene aporte, Vieja está archivada y Banco no es de ahorro.
      const selector = within(dialog).getByLabelText('Cuenta de ahorro')
      expect(
        within(selector)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Selecciona una cuenta', 'Reserva'])

      await user.type(within(dialog).getByLabelText('Nombre'), 'Colchón')
      await user.selectOptions(selector, 'acc-reserva')
      await user.type(within(dialog).getByLabelText('Importe planeado'), '150.000')
      await user.click(within(dialog).getByRole('button', { name: 'Añadir aporte' }))

      await waitFor(() => expect(saveContributionLine).toHaveBeenCalled())
      expect(saveContributionLine.mock.calls[0][0]).toMatchObject({
        planMonthId: 'plan-month-1',
        monthKey: currentMonthKey(),
        lineId: undefined,
        kind: 'savings',
        name: 'Colchón',
        accountId: 'acc-reserva',
        plannedMinor: 150_000,
        lines,
      })
      expect(toastSuccess).toHaveBeenCalledWith('Aporte añadido')
    })

    it('al editar solo cambia nombre e importe, con la cuenta fija', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(within(savingsCard()).getByRole('button', { name: 'Editar Ahorro' }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByRole('heading', { name: 'Editar Ahorro' })).toBeInTheDocument()
      expect(within(dialog).queryByLabelText('Cuenta de ahorro')).not.toBeInTheDocument()
      expect(
        within(dialog).getByText('Cuenta: Fondo. Para cambiarla, elimina el aporte y crea otro.'),
      ).toBeInTheDocument()

      const importe = within(dialog).getByLabelText('Importe planeado')
      await user.clear(importe)
      await user.type(importe, '0')
      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(saveContributionLine).toHaveBeenCalled())
      expect(saveContributionLine.mock.calls[0][0]).toMatchObject({
        lineId: 'l3',
        name: 'Ahorro',
        plannedMinor: 0,
      })
      expect(savePlanLine).not.toHaveBeenCalled()
    })

    it('borrar pide confirmación con el texto de aporte, no el de gasto', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(within(savingsCard()).getByRole('button', { name: 'Eliminar Ahorro' }))

      expect(screen.getByText('Eliminar aporte')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Se eliminará el aporte planeado. La cuenta y sus movimientos no se tocan.',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText(/No planeado»/)).not.toBeInTheDocument()
      expect(deletePlanLine).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Eliminar' }))

      await waitFor(() =>
        expect(deletePlanLine).toHaveBeenCalledWith({ lineId: 'l3', monthKey: currentMonthKey() }),
      )
      expect(toastSuccess).toHaveBeenCalledWith('Aporte eliminado')
    })

    it('el aporte planeado suma a Asignado, resta de Por asignar y llena el cuadro', () => {
      const { unmount } = renderPlan()

      // 810.000 de presupuestos por categoría + 400.000 del aporte planeado.
      expect(
        within(summaryCard('Presupuesto asignado')).getByText('COP 1.210.000'),
      ).toBeInTheDocument()
      expect(within(summaryCard('Por asignar')).getByText('COP 190.000')).toBeInTheDocument()
      expect(rowCells('Ahorro')[0]).toBe('COP 400.000')
      unmount()

      usePlanLines.mockReturnValue(resolved(lines.filter((line) => line.kind !== 'savings')))
      renderPlan()

      expect(
        within(summaryCard('Presupuesto asignado')).getByText('COP 810.000'),
      ).toBeInTheDocument()
      expect(within(summaryCard('Por asignar')).getByText('COP 590.000')).toBeInTheDocument()
      expect(rowCells('Ahorro')[0]).toBe('Sin aportes planeados')
    })

    it('un aporte planeado de 0 se muestra como COP 0 y no como ausencia', () => {
      usePlanLines.mockReturnValue(
        resolved(
          lines.map((line) => (line.kind === 'savings' ? { ...line, planned_minor: 0 } : line)),
        ),
      )
      renderPlan()

      expect(rowCells('Ahorro')[0]).toBe('COP 0')
      expect(within(savingsCard()).getByText('Planeado: COP 0')).toBeInTheDocument()
    })

    it('un error de cuenta se muestra traducido y el diálogo sigue abierto', async () => {
      saveContributionLine.mockRejectedValue(new PlanError('line_account_taken'))
      const user = userEvent.setup()
      renderPlan()

      await user.click(within(savingsCard()).getByRole('button', { name: 'Editar Ahorro' }))
      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(toastError).toHaveBeenCalled())
      const [fallback, options] = toastError.mock.calls[0] as [string, { description?: string }]
      expect(fallback).toBe('No se pudo guardar el aporte')
      expect(options.description).toBe(
        'Esa cuenta ya tiene un aporte planeado este mes. Edita el que existe o elige otra cuenta.',
      )
      expect(`${fallback} ${options.description}`).not.toMatch(/categor|23505|_key/i)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(toastSuccess).not.toHaveBeenCalled()
    })

    it('en un mes sin plan no se ofrece añadir aportes', () => {
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanLines.mockReturnValue(resolved([]))
      renderPlan()

      expect(screen.queryByRole('button', { name: /Añadir aporte/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('list', { name: /Aportes a/ })).not.toBeInTheDocument()
    })
  })

  describe('facturas y gastos variables', () => {
    /** El panel de líneas, para no confundirlo con el cuadro comparativo. */
    function linesPanel(): HTMLElement {
      return screen.getByRole('region', { name: 'Facturas y gastos variables' })
    }

    it('lista las líneas del mes repartidas por tipo', () => {
      renderPlan()

      const panel = linesPanel()

      // El fixture trae una factura de Arriendo y una variable de Alimentación.
      expect(within(panel).getByRole('list', { name: 'Facturas' })).toBeInTheDocument()
      expect(within(panel).getByRole('list', { name: 'Gastos variables' })).toBeInTheDocument()
    })

    it('muestra el progreso de cada línea sin volverlo editable', () => {
      renderPlan()

      const panel = linesPanel()

      expect(within(panel).getByText(/Presupuesto COP 400.000/)).toBeInTheDocument()
      expect(panel.querySelectorAll('input, textarea, select')).toHaveLength(0)
    })

    it('pide el progreso solo de las categorías que tienen línea', () => {
      renderPlan()

      const calls = usePlanLineProgress.mock.calls
      const options = calls[calls.length - 1][0] as {
        monthKey: string
        categoryIds: string[]
      }

      expect(options.monthKey).toBe('2026-09')
      expect(options.categoryIds.sort()).toEqual([CAT_FOOD, CAT_RENT].sort())
    })

    it('el panel no aparece mientras el mes no tenga plan', () => {
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanIncomeSources.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      usePlanIncomeSourceCategories.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      renderPlan()

      expect(
        screen.queryByRole('region', { name: 'Facturas y gastos variables' }),
      ).not.toBeInTheDocument()
    })

    it('guarda una línea nueva con el mes, el plan y las líneas ya cargadas', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(within(linesPanel()).getByRole('button', { name: 'Añadir línea' }))

      const dialog = await screen.findByRole('dialog')
      await user.type(within(dialog).getByLabelText('Nombre'), 'Internet')
      await user.selectOptions(within(dialog).getByLabelText('Categoría'), 'cat-salud')
      await user.click(within(dialog).getByRole('button', { name: 'Añadir línea' }))

      await waitFor(() => expect(savePlanLine).toHaveBeenCalled())
      expect(savePlanLine.mock.calls[0][0]).toMatchObject({
        planMonthId: 'plan-month-1',
        monthKey: '2026-09',
        lineId: undefined,
        kind: 'bill',
        name: 'Internet',
        categoryId: 'cat-salud',
        dueDate: null,
        lines,
      })
    })

    it('el formulario dice «Presupuesto en COP 0» de una categoría con 0 explícito', async () => {
      useZeroBudgetCategoryIds.mockReturnValue(resolved(new Set(['cat-salud'])))
      const user = userEvent.setup()
      renderPlan()

      expect(useZeroBudgetCategoryIds).toHaveBeenCalledWith(currentMonthKey())

      await user.click(within(linesPanel()).getByRole('button', { name: 'Añadir línea' }))
      const dialog = await screen.findByRole('dialog')
      await user.selectOptions(within(dialog).getByLabelText('Categoría'), 'cat-salud')

      expect(within(dialog).getByText('Presupuesto en COP 0')).toBeInTheDocument()
      expect(within(dialog).queryByText(/Sin presupuesto/)).not.toBeInTheDocument()
    })

    it('el formulario sigue diciendo «Sin presupuesto este mes» cuando no hay ninguno', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(within(linesPanel()).getByRole('button', { name: 'Añadir línea' }))
      const dialog = await screen.findByRole('dialog')
      await user.selectOptions(within(dialog).getByLabelText('Categoría'), 'cat-salud')

      expect(within(dialog).getByText('Sin presupuesto este mes')).toBeInTheDocument()
      expect(within(dialog).queryByText(/Presupuesto en COP 0/)).not.toBeInTheDocument()
    })

    it('el selector no ofrece categorías que ya tienen línea', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(within(linesPanel()).getByRole('button', { name: 'Añadir línea' }))

      const dialog = await screen.findByRole('dialog')
      const selector = within(dialog).getByLabelText('Categoría')

      // Arriendo y Alimentación ya tienen línea; Salud está libre.
      expect(within(selector).getByRole('option', { name: 'Salud' })).toBeInTheDocument()
      expect(within(selector).queryByRole('option', { name: 'Arriendo' })).not.toBeInTheDocument()
    })

    it('al editar manda solo el nombre y la fecha, nunca la categoría', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(within(linesPanel()).getByRole('button', { name: 'Editar Arriendo' }))

      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).queryByLabelText('Categoría')).not.toBeInTheDocument()

      await user.clear(within(dialog).getByLabelText('Nombre'))
      await user.type(within(dialog).getByLabelText('Nombre'), 'Arriendo apartamento')
      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(savePlanLine).toHaveBeenCalled())
      expect(savePlanLine.mock.calls[0][0]).toMatchObject({
        lineId: 'l1',
        name: 'Arriendo apartamento',
      })
    })

    it('borrar pide confirmación antes de tocar nada', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(within(linesPanel()).getByRole('button', { name: 'Eliminar Arriendo' }))
      expect(deletePlanLine).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Eliminar' }))

      await waitFor(() =>
        expect(deletePlanLine).toHaveBeenCalledWith({ lineId: 'l1', monthKey: '2026-09' }),
      )
    })

    it('un fallo se muestra y el diálogo no miente diciendo que todo fue bien', async () => {
      const user = userEvent.setup()
      savePlanLine.mockRejectedValue(new PlanError('line_category_taken'))
      renderPlan()

      await user.click(within(linesPanel()).getByRole('button', { name: 'Editar Arriendo' }))

      const dialog = await screen.findByRole('dialog')
      await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

      await waitFor(() => expect(toastError).toHaveBeenCalled())
      expect(toastSuccess).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      const [fallback, options] = toastError.mock.calls[0] as [string, { description?: string }]
      expect(`${fallback} ${options.description ?? ''}`).not.toMatch(
        /23505|P0001|PGRST|constraint|_key|_fkey|uuid/i,
      )
    })

    it('las dos particiones del gasto siguen siendo independientes', () => {
      renderPlan()

      // El desglose por línea y el reparto por clasificación cuadran cada uno
      // contra el mismo total, sin cruzarse entre sí.
      const desglose =
        amountOf(rowCells('Facturas')[1]) +
        amountOf(rowCells('Gastos variables')[1]) +
        amountOf(rowCells('No planeado')[1])

      expect(desglose).toBe(amountOf(rowCells('Gastos totales')[1]))
    })
  })

  describe('reconciliación del presupuesto', () => {
    function reconciliationPanel(): HTMLElement {
      return screen.getByRole('region', { name: 'Reconciliación del presupuesto' })
    }

    async function expandReconciliation() {
      const user = userEvent.setup()
      await user.click(within(reconciliationPanel()).getByRole('button', { name: 'Ver detalle' }))
      return user
    }

    /** Importe de una fila del cuadre de la reconciliación. */
    function cuadre(concepto: string): string {
      const table = screen.getByRole('table', { name: /Cuadre del presupuesto/ })
      const header = within(table).getByRole('rowheader', { name: new RegExp(`^${concepto}`) })
      return header.closest('tr')?.querySelector('td')?.textContent?.trim() ?? ''
    }

    it('va después del reparto y antes de facturas y gastos variables', () => {
      renderPlan()

      const reparto = screen.getByRole('region', { name: 'Reparto 50/30/20' })
      const panel = reconciliationPanel()
      const lineas = screen.getByRole('region', { name: 'Facturas y gastos variables' })

      expect(reparto.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(panel.compareDocumentPosition(lineas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('nace plegado y su titular usa el mismo asignado que el resumen', () => {
      renderPlan()

      const panel = reconciliationPanel()
      const summary = screen.getByRole('region', { name: 'Resumen del mes' })
      const asignadoCard = within(summary)
        .getByRole('heading', { name: 'Presupuesto asignado' })
        .closest('section') as HTMLElement

      expect(within(panel).getByRole('button', { name: 'Ver detalle' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      expect(within(asignadoCard).getByText('COP 1.210.000')).toBeInTheDocument()
      // 810.000 de presupuestos + 400.000 de ahorro planeado, contra 1.400.000.
      expect(within(panel).getByText('Asignado COP 1.210.000 de COP 1.400.000')).toBeInTheDocument()
      expect(within(panel).getByText('Por asignar: COP 190.000')).toBeInTheDocument()
      expect(
        within(panel).getByText('1 categoría con presupuesto sin línea · 0 líneas sin presupuesto'),
      ).toBeInTheDocument()
    })

    it('desplegado cuadra las dos identidades con las cifras de la pantalla', async () => {
      renderPlan()
      await expandReconciliation()

      const categorias = amountOf(cuadre('Presupuesto por categorías'))
      const facturas = amountOf(cuadre('Descrito en facturas'))
      const variables = amountOf(cuadre('Descrito en gastos variables'))
      const sinLinea = amountOf(cuadre('Sin línea descriptiva'))

      expect([categorias, facturas, variables, sinLinea]).toEqual([
        810_000, 400_000, 350_000, 60_000,
      ])
      expect(facturas + variables + sinLinea).toBe(categorias)

      expect(cuadre('Aportes a ahorro planeados')).toBe('COP 400.000')
      expect(cuadre('Aportes a inversión planeados')).toBe('Sin aportes planeados')
      expect(amountOf(cuadre('Asignado'))).toBe(categorias + 400_000)
      expect(cuadre('Ingreso planeado')).toBe('COP 1.400.000')
      expect(cuadre('Por asignar')).toBe('COP 190.000')

      // El cuadro planea para facturas y variables lo mismo que describe la reconciliación.
      expect(amountOf(rowCells('Facturas')[0])).toBe(facturas)
      expect(amountOf(rowCells('Gastos variables')[0])).toBe(variables)
    })

    it('lista la categoría con presupuesto sin línea, sin ofrecer crear la línea', async () => {
      renderPlan()
      await expandReconciliation()

      const lista = screen.getByRole('list', { name: 'Presupuestos sin línea' })
      const fila = within(lista).getByText('Préstamo').closest('li') as HTMLElement

      expect(within(fila).getByText('COP 60.000')).toBeInTheDocument()
      expect(within(fila).getByText(/Puedes describirla desde Facturas/)).toBeInTheDocument()
      expect(within(fila).queryByRole('button')).not.toBeInTheDocument()
    })

    it('distingue la línea sin presupuesto de la que tiene un 0 explícito', async () => {
      useEffectiveCategoryBudgets.mockReturnValue(resolved({ [CAT_LOAN]: 60_000 }))
      usePlanLineProgress.mockReturnValue(
        resolved([
          { ...lineProgress[0], budgetMinor: null, status: 'unbudgeted', source: null },
          { ...lineProgress[1], budgetMinor: null, status: 'unbudgeted', source: 'exception' },
        ]),
      )
      renderPlan()

      expect(
        within(reconciliationPanel()).getByText(
          '1 categoría con presupuesto sin línea · 1 línea sin presupuesto · 1 línea con presupuesto en COP 0',
        ),
      ).toBeInTheDocument()

      await expandReconciliation()

      const sinPresupuesto = screen.getByRole('list', { name: 'Líneas sin presupuesto' })
      const enCero = screen.getByRole('list', { name: 'Líneas con presupuesto en COP 0' })

      expect(within(sinPresupuesto).getByText('Arriendo')).toBeInTheDocument()
      expect(within(sinPresupuesto).getByText('Sin presupuesto')).toBeInTheDocument()
      expect(within(enCero).getByText('Mercado')).toBeInTheDocument()
      expect(within(enCero).getByText('Presupuesto en COP 0')).toBeInTheDocument()
      expect(
        screen.getByRole('link', { name: 'Completar presupuestos en septiembre' }),
      ).toHaveAttribute('href', '/budgets?month=2026-09')
    })

    it('mientras no llega el progreso de las líneas no afirma nada sobre ellas', () => {
      usePlanLineProgress.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      renderPlan()

      expect(
        screen.queryByRole('region', { name: 'Reconciliación del presupuesto' }),
      ).not.toBeInTheDocument()
    })

    it('enlaza a Presupuestos del mes en pantalla', async () => {
      renderPlan()
      await expandReconciliation()

      expect(screen.getByRole('link', { name: 'Ir a Presupuestos de septiembre' })).toHaveAttribute(
        'href',
        '/budgets?month=2026-09',
      )
    })

    it('dice «Sobreasignado» en el titular cuando lo asignado supera el ingreso', () => {
      usePlanIncomeSources.mockReturnValue(
        resolved([
          { id: 'src-1', planned_minor: 1_000_000, position: 0 },
        ] as Tables<'plan_income_sources'>[]),
      )
      renderPlan()

      const panel = reconciliationPanel()

      expect(within(panel).getByText('Sobreasignado por COP 210.000')).toBeInTheDocument()
      expect(panel.textContent).not.toMatch(/COP\s*-|−/)
    })

    it('con una fuente de COP 0 compara contra COP 0 y no dice «Sin ingreso planeado»', () => {
      usePlanIncomeSources.mockReturnValue(
        resolved([
          { id: 'src-1', name: 'Salario', planned_minor: 0, position: 0 },
        ] as Tables<'plan_income_sources'>[]),
      )
      renderPlan()

      const panel = reconciliationPanel()

      expect(within(panel).getByText('Sobreasignado por COP 1.210.000')).toBeInTheDocument()
      expect(within(panel).getByText(/Asignado COP 1.210.000 de COP 0\./)).toBeInTheDocument()
      expect(within(panel).queryByText('Sin ingreso planeado')).not.toBeInTheDocument()
    })

    it('sin plan pero con movimientos se muestra, sin ingreso con el que comparar', async () => {
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanIncomeSources.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      renderPlan()

      const panel = reconciliationPanel()

      expect(within(panel).getByText('Sin ingreso planeado')).toBeInTheDocument()
      expect(within(panel).queryByText(/Sobreasignado/)).not.toBeInTheDocument()

      await expandReconciliation()
      expect(within(panel).getByText(/todavía no tiene plan: no hay ingreso/)).toBeInTheDocument()
      expect(within(panel).queryByText(/Puedes describirla/)).not.toBeInTheDocument()
    })

    it('no aparece en el vacío de un mes sin plan y sin movimientos', () => {
      usePlanMonth.mockReturnValue(resolved(null))
      usePlanActuals.mockReturnValue(
        resolved({
          ...actuals,
          incomeActualMinor: 0,
          expenseActualMinor: 0,
          byLine: { billsMinor: 0, variablesMinor: 0, unplannedMinor: 0 },
          byGroup: { needsMinor: 0, wantsMinor: 0, debtMinor: 0, sinClasificarMinor: 0 },
          savingsContributionsMinor: 0,
          investmentContributionsMinor: 0,
        }),
      )
      renderPlan()

      expect(
        screen.queryByRole('region', { name: 'Reconciliación del presupuesto' }),
      ).not.toBeInTheDocument()
    })

    it('desplegar y plegar no abre formularios ni escribe nada', async () => {
      renderPlan()
      const user = await expandReconciliation()

      const panel = reconciliationPanel()
      expect(panel.querySelectorAll('form, input, textarea, select')).toHaveLength(0)
      expect(within(panel).getAllByRole('button')).toHaveLength(1)

      await user.click(within(panel).getByRole('button', { name: 'Ocultar detalle' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(createPlanMonth).not.toHaveBeenCalled()
      expect(saveIncomeSource).not.toHaveBeenCalled()
      expect(deleteIncomeSource).not.toHaveBeenCalled()
      expect(saveAllocations).not.toHaveBeenCalled()
      expect(savePlanLine).not.toHaveBeenCalled()
      expect(deletePlanLine).not.toHaveBeenCalled()
    })
  })

  describe('consistencia del plan: enlaces con mes y presupuesto por línea', () => {
    function linesPanel(): HTMLElement {
      return screen.getByRole('region', { name: 'Facturas y gastos variables' })
    }

    /** Fila de una línea por su nombre, que puede repetirse como nombre de categoría. */
    function lineRow(name: string): HTMLElement {
      const item = within(linesPanel()).getAllByText(name)[0].closest('li')
      if (!item) throw new Error(`Sin fila para ${name}`)
      return item
    }

    /** Todos los enlaces a Presupuestos de la página, incluidos los del detalle y el formulario. */
    function budgetLinks(): string[] {
      return screen
        .getAllByRole('link')
        .map((link) => link.getAttribute('href') ?? '')
        .filter((href) => href.startsWith('/budgets'))
    }

    it('con el mes actual, todos los enlaces a Presupuestos llevan ese mes', async () => {
      const user = userEvent.setup()
      const month = currentMonthKey()
      renderPlan()

      await user.click(screen.getByRole('button', { name: 'Ver detalle' }))

      const hrefs = budgetLinks()
      expect(hrefs.length).toBeGreaterThan(0)
      expect(new Set(hrefs)).toEqual(new Set([`/budgets?month=${month}`]))
    })

    it('al cambiar al mes anterior, panel, reconciliación y formulario usan ese mes', async () => {
      const user = userEvent.setup()
      const previous = shiftMonthKey(currentMonthKey(), -1)
      renderPlan()

      await user.click(screen.getByRole('button', { name: /Mes anterior/ }))
      await user.click(screen.getByRole('button', { name: 'Ver detalle' }))

      expect(
        within(lineRow('Arriendo')).getByRole('link', { name: 'Editar presupuesto' }),
      ).toHaveAttribute('href', `/budgets?month=${previous}`)
      expect(screen.getByRole('link', { name: /^Ir a Presupuestos de / })).toHaveAttribute(
        'href',
        `/budgets?month=${previous}`,
      )

      await user.click(within(linesPanel()).getByRole('button', { name: 'Añadir línea' }))
      const dialog = await screen.findByRole('dialog')

      expect(within(dialog).getByRole('link', { name: 'Editar en Presupuestos' })).toHaveAttribute(
        'href',
        `/budgets?month=${previous}`,
      )
      expect(new Set(budgetLinks())).toEqual(new Set([`/budgets?month=${previous}`]))
    })

    it('mientras carga el progreso, las líneas dicen que están calculando', () => {
      usePlanLineProgress.mockReturnValue({
        data: undefined,
        isPending: true,
        isError: false,
        error: null,
      })
      renderPlan()

      for (const name of ['Arriendo', 'Mercado']) {
        const fila = lineRow(name)
        expect(within(fila).getByText('Calculando presupuesto…')).toBeInTheDocument()
        expect(within(fila).queryByText(/Gastado/)).not.toBeInTheDocument()
        expect(within(fila).queryByRole('link')).not.toBeInTheDocument()
      }

      // El resumen no depende del progreso de las líneas y no cambia.
      const summary = screen.getByRole('region', { name: 'Resumen del mes' })
      const asignado = within(summary)
        .getByRole('heading', { name: 'Presupuesto asignado' })
        .closest('section') as HTMLElement
      expect(within(asignado).getByText('COP 1.210.000')).toBeInTheDocument()
    })

    it('distingue presupuesto positivo, 0 explícito y ausencia en las líneas', () => {
      useEffectiveCategoryBudgets.mockReturnValue(
        resolved({ [CAT_RENT]: 400_000, [CAT_LOAN]: 60_000 }),
      )
      usePlanLineProgress.mockReturnValue(
        resolved([
          lineProgress[0],
          { ...lineProgress[1], budgetMinor: null, status: 'unbudgeted', source: 'template' },
        ]),
      )
      renderPlan()

      const arriendo = lineRow('Arriendo')
      expect(within(arriendo).getByText(/Presupuesto COP 400.000/)).toBeInTheDocument()
      expect(within(arriendo).getByRole('link', { name: 'Editar presupuesto' })).toBeInTheDocument()

      const mercado = lineRow('Mercado')
      expect(within(mercado).getByText(/Presupuesto en COP 0/)).toBeInTheDocument()
      expect(within(mercado).queryByText(/Sin presupuesto/)).not.toBeInTheDocument()
      expect(within(mercado).getByRole('link', { name: 'Editar presupuesto' })).toBeInTheDocument()
    })

    it('sin presupuesto, la línea lo dice una vez e invita a completarlo', () => {
      usePlanLineProgress.mockReturnValue(
        resolved([
          lineProgress[0],
          { ...lineProgress[1], budgetMinor: null, status: 'unbudgeted', source: null },
        ]),
      )
      renderPlan()

      const mercado = lineRow('Mercado')
      expect(within(mercado).getAllByText(/Sin presupuesto/)).toHaveLength(1)
      expect(
        within(mercado).getByRole('link', { name: 'Completar presupuesto' }),
      ).toBeInTheDocument()
    })

    it('la reconciliación conserva titular, cuadre y enlaces', async () => {
      const user = userEvent.setup()
      renderPlan()

      const panel = screen.getByRole('region', { name: 'Reconciliación del presupuesto' })
      expect(within(panel).getByText('Asignado COP 1.210.000 de COP 1.400.000')).toBeInTheDocument()
      expect(
        within(panel).getByText('1 categoría con presupuesto sin línea · 0 líneas sin presupuesto'),
      ).toBeInTheDocument()

      await user.click(within(panel).getByRole('button', { name: 'Ver detalle' }))

      expect(
        within(panel).getByRole('link', { name: /^Ir a Presupuestos de / }),
      ).toBeInTheDocument()
      expect(within(panel).getByText('Préstamo')).toBeInTheDocument()
    })

    it('no añade campos ni llama mutaciones al renderizar, desplegar o seguir el mes', async () => {
      const user = userEvent.setup()
      renderPlan()

      await user.click(screen.getByRole('button', { name: /Mes anterior/ }))
      await user.click(screen.getByRole('button', { name: 'Ver detalle' }))

      const editable = Array.from(
        document.querySelectorAll('input, textarea, select, [contenteditable="true"]'),
      ).filter((element) => element.getAttribute('type') !== 'month')

      expect(editable).toHaveLength(0)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(createPlanMonth).not.toHaveBeenCalled()
      expect(saveIncomeSource).not.toHaveBeenCalled()
      expect(deleteIncomeSource).not.toHaveBeenCalled()
      expect(saveAllocations).not.toHaveBeenCalled()
      expect(savePlanLine).not.toHaveBeenCalled()
      expect(deletePlanLine).not.toHaveBeenCalled()
    })
  })
})

describe('Plan — moneda del Plan', () => {
  const usdChecking = {
    id: 'acc-usd',
    name: 'Cuenta USD',
    type: 'checking',
    is_archived: false,
    currency_code: 'USD',
  } as Tables<'accounts'>

  function savingsCard(): HTMLElement {
    const block = screen.getByRole('region', { name: 'Ahorro e inversión' })
    return within(block).getByRole('region', { name: 'Ahorro' })
  }

  it('pide todas las cifras del mes en la moneda de presentación', () => {
    renderPlan()

    expect(usePlanActuals).toHaveBeenLastCalledWith(
      expect.objectContaining({ currencyCode: 'COP' }),
    )
    expect(usePlanLineProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ currencyCode: 'COP' }),
    )
    expect(usePlanContributionBalances).toHaveBeenLastCalledWith(currentMonthKey(), 'COP')
    expect(screen.getByText(/· COP$/)).toBeInTheDocument()
  })

  it('espera a la moneda principal antes de calcular, sin mezclar monedas', () => {
    usePrimaryCurrency.mockReturnValue({ data: undefined, isPending: true })

    renderPlan()

    expect(usePlanActuals).toHaveBeenLastCalledWith(
      expect.objectContaining({ currencyCode: undefined }),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/Cargando el plan/)
  })

  it('usa la moneda principal aunque no sea la de la primera cuenta', () => {
    useAccounts.mockReturnValue({ data: [...planAccounts, usdChecking] })
    usePrimaryCurrency.mockReturnValue({ data: 'USD', isPending: false })

    renderPlan()

    expect(usePlanActuals).toHaveBeenLastCalledWith(
      expect.objectContaining({ currencyCode: 'USD' }),
    )
    expect(screen.getByText(/· USD$/)).toBeInTheDocument()
  })

  it('sin cuentas en la moneda principal usa la de la primera cuenta', () => {
    usePrimaryCurrency.mockReturnValue({ data: 'ARS', isPending: false })

    renderPlan()

    expect(usePlanActuals).toHaveBeenLastCalledWith(
      expect.objectContaining({ currencyCode: 'COP' }),
    )
  })

  it('avisa de los movimientos en otras monedas que no se incluyen', () => {
    usePlanActuals.mockReturnValue(
      resolved({ ...actuals, exclusions: { count: 3, currencyCodes: ['USD', 'ARS'] } }),
    )

    renderPlan()

    expect(screen.getByRole('note')).toHaveTextContent(
      '3 movimientos en otras monedas (USD, ARS) no se incluyen en este Plan.',
    )
  })

  it('en singular con un solo movimiento excluido', () => {
    usePlanActuals.mockReturnValue(
      resolved({ ...actuals, exclusions: { count: 1, currencyCodes: ['USD'] } }),
    )

    renderPlan()

    expect(screen.getByRole('note')).toHaveTextContent(
      '1 movimiento en otra moneda (USD) no se incluye en este Plan.',
    )
  })

  it('sin movimientos en otras monedas no hay aviso', () => {
    renderPlan()

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('marca la línea de aporte cuya cuenta está en otra moneda y conserva su planeado', () => {
    useAccounts.mockReturnValue({
      data: planAccounts.map((account) =>
        account.id === ACC_SAVINGS ? { ...account, currency_code: 'USD' } : account,
      ),
    })

    renderPlan()

    const lista = within(savingsCard()).getByRole('list', { name: 'Aportes a ahorro planeados' })
    const item = within(lista).getByRole('listitem')
    expect(item).toHaveTextContent('Ahorro · Fondo · COP 400.000')
    expect(item).toHaveTextContent('Cuenta en USD: su aporte real no se cuenta')
    expect(within(savingsCard()).getByText('Planeado: COP 400.000')).toBeInTheDocument()
  })

  it('el formulario de aportes no ofrece cuentas en otra moneda', async () => {
    useAccounts.mockReturnValue({
      data: [
        ...planAccounts,
        {
          id: 'acc-ahorro-usd',
          name: 'Ahorro USD',
          type: 'savings',
          is_archived: false,
          currency_code: 'USD',
        } as Tables<'accounts'>,
      ],
    })
    const user = userEvent.setup()
    renderPlan()

    await user.click(within(savingsCard()).getByRole('button', { name: 'Añadir aporte a ahorro' }))

    const dialog = await screen.findByRole('dialog')
    const selector = within(dialog).getByLabelText('Cuenta de ahorro')
    expect(
      within(selector)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Selecciona una cuenta', 'Reserva'])
  })
})
