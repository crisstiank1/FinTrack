import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PlanError } from '@/features/plan/errors'
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

vi.mock('@/features/plan/hooks', () => ({
  usePlanMonth: () => usePlanMonth(),
  usePlanLines: () => usePlanLines(),
  useCategoryClassifications: () => useCategoryClassifications(),
  useEffectiveCategoryBudgets: () => useEffectiveCategoryBudgets(),
  usePlanActuals: (options: unknown) => usePlanActuals(options),
  usePlanIncomeSources: (planMonthId: unknown) => usePlanIncomeSources(planMonthId),
  usePlanAllocations: (planMonthId: unknown) => usePlanAllocations(planMonthId),
  usePlanIncomeSourceCategories: (planMonthId: unknown) =>
    usePlanIncomeSourceCategories(planMonthId),
  useCreatePlanMonth: () => ({ mutateAsync: createPlanMonth, isPending: false }),
  useSaveIncomeSource: () => ({ mutateAsync: saveIncomeSource, isPending: false }),
  useDeleteIncomeSource: () => ({ mutateAsync: deleteIncomeSource, isPending: false }),
}))

vi.mock('@/features/categories/hooks', () => ({
  useCategories: () => ({ data: categories }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}))

vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => ({ data: [{ id: 'acc-1', currency_code: 'COP' }] }),
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()

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
  { id: 'src-1', name: 'Salario', planned_minor: 1_400_000, position: 0 },
] as Tables<'plan_income_sources'>[]

const categories = [
  { id: 'cat-salario', name: 'Salario', type: 'income', is_archived: false },
  { id: 'cat-bono', name: 'Bono', type: 'income', is_archived: false },
  { id: 'cat-viejo', name: 'Antiguo', type: 'income', is_archived: true },
  { id: CAT_RENT, name: 'Arriendo', type: 'expense', is_archived: false },
] as Tables<'categories'>[]

const incomeSourceLinks = [
  { id: 'l1', plan_income_source_id: 'src-1', category_id: 'cat-salario' },
] as Tables<'plan_income_source_categories'>[]

const allocations = [
  { id: 'a1', budget_group: 'needs', percent_bp: 5_000 },
  { id: 'a2', budget_group: 'wants', percent_bp: 3_000 },
  { id: 'a3', budget_group: 'savings', percent_bp: 2_000 },
] as Tables<'plan_allocations'>[]

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
})
