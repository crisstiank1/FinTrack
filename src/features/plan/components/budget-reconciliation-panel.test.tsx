import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import {
  BudgetReconciliationPanel,
  type BudgetReconciliationPanelProps,
  type ReconciliationLineItem,
} from './budget-reconciliation-panel'

/** El estado real de septiembre de 2026: cobertura completa y cinco líneas sin presupuesto. */
const septiembre: BudgetReconciliationPanelProps = {
  monthKey: '2026-09',
  monthLabel: 'septiembre 2026',
  currencyCode: 'COP',
  hasPlan: true,
  incomePlannedMinor: 3_000_000,
  coverage: {
    totalMinor: 1_750_000,
    billsMinor: 900_000,
    variablesMinor: 850_000,
    unlinkedMinor: 0,
    coveredMinor: 1_750_000,
    hasCategoryBudgets: true,
  },
  savingsPlannedMinor: null,
  investmentPlannedMinor: null,
  assignedMinor: 1_750_000,
  unassignedMinor: 1_250_000,
  unlinkedCategories: [],
  linesWithoutBudget: [
    line('l2', 'Servicios públicos', 'bill'),
    line('l3', 'Deudas y créditos', 'bill'),
    line('l4', 'Internet y telefonía', 'bill'),
    line('l7', 'Restaurantes', 'variable'),
    line('l8', 'Salud', 'variable'),
  ],
  linesWithZeroBudget: [],
}

function line(
  lineId: string,
  name: string,
  kind: ReconciliationLineItem['kind'],
  isCategoryArchived = false,
): ReconciliationLineItem {
  return { lineId, name, kind, categoryName: name, isCategoryArchived }
}

function renderPanel(props: Partial<BudgetReconciliationPanelProps> = {}) {
  return render(
    <MemoryRouter>
      <BudgetReconciliationPanel {...septiembre} {...props} />
    </MemoryRouter>,
  )
}

function panel(): HTMLElement {
  return screen.getByRole('region', { name: 'Reconciliación del presupuesto' })
}

/** Cabecera visible con el bloque plegado: titular, detalle y conteos. */
function headlineArea(): HTMLElement {
  const heading = screen.getByRole('heading', { name: 'Reconciliación del presupuesto' })
  return heading.parentElement as HTMLElement
}

async function expand() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Ver detalle' }))
  return user
}

/** Importe de una fila del cuadre, por su concepto. */
function cuadre(concepto: string): string {
  const table = screen.getByRole('table', { name: /Cuadre del presupuesto/ })
  const header = within(table).getByRole('rowheader', { name: new RegExp(`^${concepto}`) })
  return header.closest('tr')?.querySelector('td')?.textContent?.trim() ?? ''
}

describe('BudgetReconciliationPanel', () => {
  describe('plegado', () => {
    it('nace plegado, con el detalle oculto y el control anunciado', () => {
      renderPanel()

      const toggle = screen.getByRole('button', { name: 'Ver detalle' })

      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      const detail = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
      expect(detail).not.toBeNull()
      expect(detail).not.toBeVisible()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('plegado ya dice el estado principal y los conteos', () => {
      renderPanel()

      expect(
        within(headlineArea()).getByText('Asignado COP 1.750.000 de COP 3.000.000'),
      ).toBeVisible()
      expect(within(headlineArea()).getByText('Por asignar: COP 1.250.000')).toBeVisible()
      expect(
        within(headlineArea()).getByText(
          '0 categorías con presupuesto sin línea · 5 líneas sin presupuesto',
        ),
      ).toBeVisible()
    })

    it('se despliega y se vuelve a plegar', async () => {
      renderPanel()

      const user = await expand()
      const toggle = screen.getByRole('button', { name: 'Ocultar detalle' })

      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByRole('table', { name: /Cuadre del presupuesto/ })).toBeVisible()

      await user.click(toggle)

      expect(screen.getByRole('button', { name: 'Ver detalle' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })
  })

  describe('cuadre', () => {
    it('reproduce septiembre: todo el presupuesto descrito y COP 1.250.000 por asignar', async () => {
      renderPanel()
      await expand()

      expect(cuadre('Presupuesto por categorías')).toBe('COP 1.750.000')
      expect(cuadre('Descrito en facturas')).toBe('COP 900.000')
      expect(cuadre('Descrito en gastos variables')).toBe('COP 850.000')
      expect(cuadre('Sin línea descriptiva')).toBe('COP 0')
      expect(cuadre('Aportes a ahorro planeados')).toBe('Sin aportes planeados')
      expect(cuadre('Aportes a inversión planeados')).toBe('Sin aportes planeados')
      expect(cuadre('Asignado')).toBe('COP 1.750.000')
      expect(cuadre('Ingreso planeado')).toBe('COP 3.000.000')
      expect(cuadre('Por asignar')).toBe('COP 1.250.000')
      expect(screen.getByText('Todo el presupuesto está descrito')).toBeInTheDocument()
      expect(screen.getByText(/Cubierto por líneas: COP 1.750.000 de COP 1.750.000/)).toBeVisible()
    })

    it('«Sin línea descriptiva» con importe es neutro y no lleva marca de completo', async () => {
      renderPanel({
        coverage: { ...septiembre.coverage, totalMinor: 1_810_000, unlinkedMinor: 60_000 },
      })
      await expand()

      const header = screen.getByRole('rowheader', { name: 'Sin línea descriptiva' })
      const cell = header.closest('tr')?.querySelector('td')

      expect(cell).toHaveTextContent('COP 60.000')
      expect(cell?.className).not.toContain('text-danger')
      expect(screen.queryByText('Todo el presupuesto está descrito')).not.toBeInTheDocument()
    })

    it('aportes planeados en 0 se muestran como COP 0, no como ausencia', async () => {
      renderPanel({ savingsPlannedMinor: 0, investmentPlannedMinor: 200_000 })
      await expand()

      expect(cuadre('Aportes a ahorro planeados')).toBe('COP 0')
      expect(cuadre('Aportes a inversión planeados')).toBe('COP 200.000')
    })

    it('sin categorías presupuestadas lo dice con palabras, sin fingir un desglose', async () => {
      renderPanel({
        coverage: {
          totalMinor: 0,
          billsMinor: 0,
          variablesMinor: 0,
          unlinkedMinor: 0,
          coveredMinor: 0,
          hasCategoryBudgets: false,
        },
        assignedMinor: 0,
        unassignedMinor: 3_000_000,
      })
      await expand()

      expect(cuadre('Presupuesto por categorías')).toBe('Sin presupuesto')
      expect(screen.queryByRole('rowheader', { name: /Descrito en facturas/ })).toBeNull()
      expect(
        screen.getByText('Ninguna categoría tiene presupuesto en septiembre 2026.'),
      ).toBeVisible()
      expect(screen.queryByText(/Cubierto por líneas/)).not.toBeInTheDocument()
    })

    it('plan exacto: por asignar vale COP 0 y lo marca en texto', async () => {
      renderPanel({ assignedMinor: 3_000_000, unassignedMinor: 0 })
      await expand()

      expect(within(headlineArea()).getByText('Por asignar: COP 0')).toBeVisible()
      expect(cuadre('Por asignar')).toBe('COP 0')
      expect(screen.getByText('Todo el ingreso planeado está asignado')).toBeVisible()
    })
  })

  describe('titular', () => {
    it('sobreasignado: dice el exceso en texto, sin negativo desnudo', async () => {
      renderPanel({ assignedMinor: 3_200_000, unassignedMinor: -200_000 })

      const titular = within(headlineArea()).getByText('Sobreasignado por COP 200.000')

      expect(titular.className).toContain('text-danger')
      expect(
        within(headlineArea()).getByText(
          'Asignado COP 3.200.000 de COP 3.000.000. Se asignó más que el ingreso planeado.',
        ),
      ).toBeVisible()

      await expand()
      expect(cuadre('Por asignar')).toBe('Sobreasignado por COP 200.000')
      expect(panel().textContent).not.toMatch(/COP\s*-|−/)
    })

    it('sin ingreso planeado no compara ni declara exceso', async () => {
      renderPanel({ incomePlannedMinor: null, unassignedMinor: null })

      expect(within(headlineArea()).getByText('Asignado COP 1.750.000')).toBeVisible()
      expect(within(headlineArea()).getByText('Sin ingreso planeado')).toBeVisible()
      expect(within(panel()).queryByText(/Sobreasignado/)).not.toBeInTheDocument()

      await expand()
      expect(cuadre('Ingreso planeado')).toBe('Sin ingreso planeado')
      expect(cuadre('Por asignar')).toBe('Sin ingreso planeado')
      expect(screen.getByText(/Añade una fuente de ingreso/)).toBeVisible()
    })

    it('con una fuente explícita de COP 0 compara contra COP 0, no contra una ausencia', () => {
      renderPanel({ incomePlannedMinor: 0, unassignedMinor: -1_750_000 })

      expect(within(headlineArea()).getByText('Sobreasignado por COP 1.750.000')).toBeVisible()
      expect(within(headlineArea()).getByText(/Asignado COP 1.750.000 de COP 0\./)).toBeVisible()
      expect(within(panel()).queryByText('Sin ingreso planeado')).not.toBeInTheDocument()
    })
  })

  describe('listas', () => {
    it('lista las líneas sin presupuesto y explica que siguen siendo válidas', async () => {
      renderPanel()
      await expand()

      const lista = screen.getByRole('list', { name: 'Líneas sin presupuesto' })

      expect(within(lista).getAllByRole('listitem')).toHaveLength(5)
      expect(within(lista).getByText('Servicios públicos')).toBeInTheDocument()
      expect(within(lista).getAllByText('Sin presupuesto')).toHaveLength(5)
      expect(within(lista).getAllByText(/^Factura ·/)).toHaveLength(3)
      expect(screen.getByText(/Son válidas: describen el gasto de su categoría/)).toBeVisible()
    })

    it('un presupuesto explícito de COP 0 no se presenta como ausencia', async () => {
      renderPanel({
        linesWithoutBudget: [line('l7', 'Restaurantes', 'variable')],
        linesWithZeroBudget: [line('l8', 'Salud', 'variable')],
      })

      expect(
        within(panel()).getByText(
          '0 categorías con presupuesto sin línea · 1 línea sin presupuesto · 1 línea con presupuesto en COP 0',
        ),
      ).toBeVisible()

      await expand()

      const sinPresupuesto = screen.getByRole('list', { name: 'Líneas sin presupuesto' })
      const enCero = screen.getByRole('list', { name: 'Líneas con presupuesto en COP 0' })

      expect(within(sinPresupuesto).queryByText('Salud')).not.toBeInTheDocument()
      expect(within(enCero).getByText('Salud')).toBeInTheDocument()
      expect(within(enCero).getByText('Presupuesto en COP 0')).toBeInTheDocument()
      expect(within(enCero).queryByText('Sin presupuesto')).not.toBeInTheDocument()
      expect(within(enCero).queryByRole('link')).not.toBeInTheDocument()
    })

    it('las categorías con presupuesto sin línea muestran su importe y solo informan', async () => {
      renderPanel({
        coverage: { ...septiembre.coverage, totalMinor: 1_800_000, unlinkedMinor: 50_000 },
        unlinkedCategories: [
          { categoryId: 'cat-gym', name: 'Gimnasio', isArchived: false, amountMinor: 50_000 },
        ],
      })

      expect(
        within(panel()).getByText(/^1 categoría con presupuesto sin línea · 5 líneas/),
      ).toBeVisible()

      await expand()

      const lista = screen.getByRole('list', { name: 'Presupuestos sin línea' })
      const fila = within(lista).getByText('Gimnasio').closest('li') as HTMLElement

      expect(within(fila).getByText('COP 50.000')).toBeInTheDocument()
      expect(
        within(fila).getByText('Puedes describirla desde Facturas y gastos variables.'),
      ).toBeInTheDocument()
      expect(within(fila).queryByRole('button')).not.toBeInTheDocument()
      expect(within(fila).queryByRole('link')).not.toBeInTheDocument()
      expect(screen.getByText(/No es un error/)).toBeVisible()
    })

    it('vacías, lo dicen sin ocultar el grupo', async () => {
      renderPanel({ linesWithoutBudget: [] })
      await expand()

      expect(screen.getByText('Ninguna categoría con presupuesto está sin línea.')).toBeVisible()
      expect(screen.getByText('Ninguna línea está sin presupuesto.')).toBeVisible()
    })

    it('una categoría archivada no recibe invitación a completar', async () => {
      renderPanel({
        linesWithoutBudget: [line('l9', 'Gimnasio viejo', 'bill', true)],
        unlinkedCategories: [
          { categoryId: 'cat-old', name: 'Antigua', isArchived: true, amountMinor: 30_000 },
        ],
      })
      await expand()

      expect(
        screen.getByText('Categoría archivada: no admite presupuestos nuevos.'),
      ).toBeInTheDocument()
      expect(screen.getByText('Categoría archivada: no admite líneas nuevas.')).toBeInTheDocument()
      expect(screen.getAllByText('Archivada')).toHaveLength(2)
      expect(screen.queryByRole('link', { name: /Completar presupuestos/ })).not.toBeInTheDocument()
      expect(screen.queryByText(/Puedes describirla/)).not.toBeInTheDocument()
    })

    it('sin plan explica por qué no hay líneas y no invita a describir', async () => {
      renderPanel({
        hasPlan: false,
        incomePlannedMinor: null,
        unassignedMinor: null,
        linesWithoutBudget: [],
        unlinkedCategories: [
          { categoryId: 'cat-rent', name: 'Vivienda', isArchived: false, amountMinor: 900_000 },
        ],
      })
      await expand()

      expect(
        screen.getByText(/todavía no tiene plan: no hay ingreso con el que comparar/),
      ).toBeVisible()
      expect(screen.queryByText(/Puedes describirla/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Añade una fuente de ingreso/)).not.toBeInTheDocument()
    })
  })

  describe('enlaces a Presupuestos', () => {
    it('un enlace general y uno por grupo, al mes del plan', async () => {
      renderPanel()
      await expand()

      expect(screen.getByRole('link', { name: 'Ir a Presupuestos de septiembre' })).toHaveAttribute(
        'href',
        '/budgets?month=2026-09',
      )

      const completar = screen.getAllByRole('link', {
        name: 'Completar presupuestos en septiembre',
      })
      expect(completar).toHaveLength(1)
      expect(completar[0]).toHaveAttribute('href', '/budgets?month=2026-09')

      const lista = screen.getByRole('list', { name: 'Líneas sin presupuesto' })
      expect(within(lista).queryByRole('link')).not.toBeInTheDocument()
    })
  })

  describe('solo lectura', () => {
    it('no tiene formularios, campos ni más botones que el de plegar', async () => {
      renderPanel({
        linesWithZeroBudget: [line('l10', 'Salud', 'variable')],
        unlinkedCategories: [
          { categoryId: 'cat-gym', name: 'Gimnasio', isArchived: false, amountMinor: 50_000 },
        ],
      })
      await expand()

      const region = panel()

      expect(region.querySelectorAll('form, input, textarea, select')).toHaveLength(0)
      expect(within(region).queryByRole('textbox')).not.toBeInTheDocument()
      expect(within(region).queryByRole('spinbutton')).not.toBeInTheDocument()
      expect(within(region).queryByRole('combobox')).not.toBeInTheDocument()
      expect(within(region).getAllByRole('button')).toHaveLength(1)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('mantiene la nota fija de que «Por asignar» no es dinero disponible', () => {
      renderPanel()

      expect(within(panel()).getByText(/compara planes; no es dinero disponible/)).toBeVisible()
    })
  })
})
