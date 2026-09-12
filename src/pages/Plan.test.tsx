import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Tables } from '@/types/database.types'

import Plan from './Plan'

const usePlanMonth = vi.fn()
const usePlanLines = vi.fn()
const useCategoryClassifications = vi.fn()
const useEffectiveCategoryBudgets = vi.fn()
const usePlanActuals = vi.fn()
const usePlanIncomeSources = vi.fn()

vi.mock('@/features/plan/hooks', () => ({
  usePlanMonth: () => usePlanMonth(),
  usePlanLines: () => usePlanLines(),
  useCategoryClassifications: () => useCategoryClassifications(),
  useEffectiveCategoryBudgets: () => useEffectiveCategoryBudgets(),
  usePlanActuals: (options: unknown) => usePlanActuals(options),
  usePlanIncomeSources: (planMonthId: unknown) => usePlanIncomeSources(planMonthId),
}))

vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => ({ data: [{ id: 'acc-1', currency_code: 'COP' }] }),
}))

const CAT_RENT = 'cat-rent'
const CAT_FOOD = 'cat-food'
const CAT_LOAN = 'cat-loan'

/** Estado de una consulta resuelta con éxito. */
function resolved<T>(data: T) {
  return { data, isPending: false, isError: false, error: null }
}

const planMonth = { id: 'plan-month-1', period_month: '2026-04-01' } as Tables<'plan_months'>

const lines = [
  { id: 'l1', kind: 'bill', category_id: CAT_RENT, planned_minor: null },
  { id: 'l2', kind: 'variable', category_id: CAT_FOOD, planned_minor: null },
  { id: 'l3', kind: 'savings', category_id: null, planned_minor: 400_000 },
] as Tables<'plan_lines'>[]

const classifications = [
  { id: 'c1', category_id: CAT_LOAN, budget_group: 'debt' },
] as Tables<'category_classifications'>[]

const effectiveBudgets = { [CAT_RENT]: 400_000, [CAT_FOOD]: 350_000, [CAT_LOAN]: 60_000 }

const incomeSources = [
  { id: 'src-1', planned_minor: 1_400_000, position: 0 },
] as Tables<'plan_income_sources'>[]

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
function rowCells(name: string): string[] {
  const table = screen.getByRole('table')
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
  usePlanMonth.mockReturnValue(resolved(planMonth))
  usePlanLines.mockReturnValue(resolved(lines))
  useCategoryClassifications.mockReturnValue(resolved(classifications))
  useEffectiveCategoryBudgets.mockReturnValue(resolved(effectiveBudgets))
  usePlanActuals.mockReturnValue(resolved(actuals))
  usePlanIncomeSources.mockReturnValue(resolved(incomeSources))
})

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

    const table = screen.getByRole('table')
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
      expect(screen.getByRole('link', { name: 'Registrar movimiento' })).toBeInTheDocument()
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
})
