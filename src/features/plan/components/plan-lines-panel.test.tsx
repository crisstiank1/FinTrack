import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BudgetProgress } from '@/features/budgets/progress'

import { PlanLinesPanel, type PlanLineItem } from './plan-lines-panel'

const onAdd = vi.fn()
const onEdit = vi.fn()
const onDelete = vi.fn()

const bills: PlanLineItem[] = [
  {
    id: 'line-1',
    name: 'Arriendo',
    kind: 'bill',
    categoryId: 'cat-vivienda',
    categoryName: 'Vivienda',
    isCategoryArchived: false,
    dueDate: '2026-09-05',
  },
]

const variables: PlanLineItem[] = [
  {
    id: 'line-2',
    name: 'Mercado',
    kind: 'variable',
    categoryId: 'cat-mercado',
    categoryName: 'Alimentación',
    isCategoryArchived: false,
    dueDate: null,
  },
]

const progressByCategory: Record<string, BudgetProgress> = {
  'cat-vivienda': {
    categoryId: 'cat-vivienda',
    budgetMinor: 900_000,
    spentMinor: 900_000,
    remainingMinor: 0,
    ratio: 1,
    status: 'ok',
    source: 'template',
  },
  'cat-mercado': {
    categoryId: 'cat-mercado',
    budgetMinor: null,
    spentMinor: 750_000,
    remainingMinor: null,
    ratio: null,
    status: 'unbudgeted',
    source: null,
  },
}

function renderPanel(props: Partial<Parameters<typeof PlanLinesPanel>[0]> = {}) {
  return render(
    <MemoryRouter>
      <PlanLinesPanel
        bills={bills}
        variables={variables}
        progressByCategory={progressByCategory}
        isProgressLoading={false}
        monthKey="2026-09"
        currencyCode="COP"
        monthLabel="septiembre 2026"
        onAdd={onAdd}
        onEdit={onEdit}
        onDelete={onDelete}
        {...props}
      />
    </MemoryRouter>,
  )
}

function row(name: string): HTMLElement {
  const item = screen.getByText(name).closest('li')
  if (!item) throw new Error(`Sin fila para ${name}`)
  return item
}

beforeEach(() => {
  onAdd.mockReset()
  onEdit.mockReset()
  onDelete.mockReset()
})

describe('PlanLinesPanel', () => {
  it('separa facturas de gastos variables', () => {
    renderPanel()

    const facturas = screen.getByRole('list', { name: 'Facturas' })
    const gastos = screen.getByRole('list', { name: 'Gastos variables' })

    expect(within(facturas).getByText('Arriendo')).toBeInTheDocument()
    expect(within(gastos).getByText('Mercado')).toBeInTheDocument()
    expect(within(facturas).queryByText('Mercado')).not.toBeInTheDocument()
  })

  it('muestra la fecha esperada solo cuando existe', () => {
    renderPanel()

    expect(within(row('Arriendo')).getByText(/5 sep/i)).toBeInTheDocument()
    expect(within(row('Mercado')).queryByText(/5 sep/i)).not.toBeInTheDocument()
  })

  it('muestra presupuesto, gasto y estado sin hacerlos editables', () => {
    renderPanel()

    const arriendo = row('Arriendo')

    expect(within(arriendo).getByText(/Presupuesto COP 900.000/)).toBeInTheDocument()
    expect(within(arriendo).getByText(/Gastado COP 900.000/)).toBeInTheDocument()
    // Gastar el 100 % exacto cumple el presupuesto: «En rango», en verde (M15).
    expect(within(arriendo).getByText('En rango')).toHaveClass('text-success')
    expect(within(arriendo).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(arriendo).queryByRole('spinbutton')).not.toBeInTheDocument()
  })

  it('dice «Sin presupuesto este mes» una sola vez, sin fingir un cero', () => {
    renderPanel()

    const mercado = row('Mercado')

    expect(within(mercado).getByText(/Sin presupuesto este mes/)).toBeInTheDocument()
    expect(within(mercado).getByText(/Gastado COP 750.000/)).toBeInTheDocument()
    // Sin el estado de progreso «Sin presupuesto» repitiendo lo mismo al lado.
    expect(within(mercado).getAllByText(/Sin presupuesto/)).toHaveLength(1)
    expect(within(mercado).queryByText('COP 0')).not.toBeInTheDocument()
  })

  it('sin presupuesto en una categoría activa, invita a completarlo en el mes del plan', () => {
    renderPanel()

    const mercado = row('Mercado')

    expect(within(mercado).getByRole('link', { name: 'Completar presupuesto' })).toHaveAttribute(
      'href',
      '/budgets?month=2026-09',
    )
    expect(
      within(mercado).queryByRole('link', { name: 'Editar presupuesto' }),
    ).not.toBeInTheDocument()
  })

  describe('presupuesto explícito de COP 0', () => {
    const zero = (source: 'template' | 'exception'): BudgetProgress => ({
      categoryId: 'cat-mercado',
      budgetMinor: null,
      spentMinor: 120_000,
      remainingMinor: null,
      ratio: null,
      status: 'unbudgeted',
      source,
    })

    it.each(['template', 'exception'] as const)(
      'con fuente %s dice «Presupuesto en COP 0», no «Sin presupuesto»',
      (source) => {
        renderPanel({ progressByCategory: { ...progressByCategory, 'cat-mercado': zero(source) } })

        const mercado = row('Mercado')

        expect(within(mercado).getByText(/Presupuesto en COP 0/)).toBeInTheDocument()
        expect(within(mercado).getByText(/Gastado COP 120.000/)).toBeInTheDocument()
        expect(within(mercado).queryByText(/Sin presupuesto/)).not.toBeInTheDocument()
        expect(within(mercado).getByRole('link', { name: 'Editar presupuesto' })).toHaveAttribute(
          'href',
          '/budgets?month=2026-09',
        )
        expect(
          within(mercado).queryByRole('link', { name: 'Completar presupuesto' }),
        ).not.toBeInTheDocument()
      },
    )

    it('en una categoría archivada conserva el chip y el enlace para corregirlo', () => {
      renderPanel({
        variables: [{ ...variables[0], isCategoryArchived: true }],
        progressByCategory: { ...progressByCategory, 'cat-mercado': zero('exception') },
      })

      const mercado = row('Mercado')

      expect(within(mercado).getByText('Archivada')).toBeInTheDocument()
      expect(within(mercado).getByText(/Presupuesto en COP 0/)).toBeInTheDocument()
      expect(within(mercado).getByRole('link', { name: 'Editar presupuesto' })).toBeInTheDocument()
      expect(within(mercado).queryByText(/no admite presupuestos nuevos/)).not.toBeInTheDocument()
    })
  })

  describe('categoría archivada', () => {
    it('sin presupuesto no invita a completarlo y dice por qué', () => {
      renderPanel({ variables: [{ ...variables[0], isCategoryArchived: true }] })

      const mercado = row('Mercado')

      expect(within(mercado).getByText('Archivada')).toBeInTheDocument()
      expect(within(mercado).getByText(/Sin presupuesto este mes/)).toBeInTheDocument()
      expect(within(mercado).getByText(/Gastado COP 750.000/)).toBeInTheDocument()
      expect(
        within(mercado).getByText('Categoría archivada: no admite presupuestos nuevos.'),
      ).toBeInTheDocument()
      expect(within(mercado).queryByRole('link')).not.toBeInTheDocument()
    })

    it('con presupuesto positivo mantiene «Editar presupuesto»', () => {
      renderPanel({ bills: [{ ...bills[0], isCategoryArchived: true }] })

      const arriendo = row('Arriendo')

      expect(within(arriendo).getByText(/Presupuesto COP 900.000/)).toBeInTheDocument()
      expect(within(arriendo).getByText('En rango')).toBeInTheDocument()
      expect(within(arriendo).getByRole('link', { name: 'Editar presupuesto' })).toBeInTheDocument()
    })
  })

  describe('mientras el progreso carga', () => {
    it('dice que está calculando, sin gasto, sin estado y sin enlaces', () => {
      renderPanel({ isProgressLoading: true, progressByCategory: {} })

      for (const name of ['Arriendo', 'Mercado']) {
        const fila = row(name)

        expect(within(fila).getByText('Calculando presupuesto…')).toBeInTheDocument()
        expect(within(fila).queryByText(/Gastado/)).not.toBeInTheDocument()
        expect(within(fila).queryByText(/Sin presupuesto/)).not.toBeInTheDocument()
        expect(within(fila).queryByText(/usado|En rango|superado/)).not.toBeInTheDocument()
        expect(within(fila).queryByRole('link')).not.toBeInTheDocument()
      }
    })

    it('no convierte un progreso pendiente en gasto cero', () => {
      renderPanel({ isProgressLoading: true, progressByCategory: {} })

      expect(screen.queryByText(/COP 0/)).not.toBeInTheDocument()
    })
  })

  it('ningún control del panel permite escribir una cifra', () => {
    renderPanel()

    const panel = screen.getByRole('region', { name: 'Facturas y gastos variables' })

    expect(panel.querySelectorAll('input, textarea, select')).toHaveLength(0)
  })

  it('marca una categoría archivada y sigue permitiendo editar y eliminar', async () => {
    const user = userEvent.setup()
    renderPanel({
      bills: [{ ...bills[0], isCategoryArchived: true }],
    })

    const arriendo = row('Arriendo')
    expect(within(arriendo).getByText('Archivada')).toBeInTheDocument()

    await user.click(within(arriendo).getByRole('button', { name: 'Editar Arriendo' }))
    expect(onEdit).toHaveBeenCalledWith('line-1')

    await user.click(within(arriendo).getByRole('button', { name: 'Eliminar Arriendo' }))
    expect(onDelete).toHaveBeenCalledWith('line-1')
  })

  it('cada fila enlaza a Presupuestos del mes del plan, que es donde vive la cifra', () => {
    renderPanel()

    expect(
      within(row('Arriendo')).getByRole('link', { name: 'Editar presupuesto' }),
    ).toHaveAttribute('href', '/budgets?month=2026-09')
  })

  it('los enlaces usan el mes recibido aunque no sea el actual', () => {
    renderPanel({ monthKey: '2025-12' })

    expect(
      within(row('Arriendo')).getByRole('link', { name: 'Editar presupuesto' }),
    ).toHaveAttribute('href', '/budgets?month=2025-12')
    expect(
      within(row('Mercado')).getByRole('link', { name: 'Completar presupuesto' }),
    ).toHaveAttribute('href', '/budgets?month=2025-12')
  })

  it('sin líneas explica que todo el gasto está en No planeado', () => {
    renderPanel({ bills: [], variables: [] })

    expect(screen.getByText(/no tiene facturas ni gastos variables/i)).toBeInTheDocument()
    expect(screen.getByText(/todo tu gasto aparece en «No planeado»/i)).toBeInTheDocument()
  })

  it('un grupo vacío lo dice sin ocultar el otro', () => {
    renderPanel({ variables: [] })

    expect(screen.getByText(/Todavía no has descrito ningún gasto variable/)).toBeInTheDocument()
    expect(screen.getByText('Arriendo')).toBeInTheDocument()
  })

  it('añadir avisa a quien lo monta', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: 'Añadir línea' }))

    expect(onAdd).toHaveBeenCalled()
  })

  it('mientras guarda, las acciones quedan deshabilitadas', () => {
    renderPanel({ isBusy: true })

    expect(screen.getByRole('button', { name: 'Añadir línea' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Editar Arriendo' })).toBeDisabled()
  })

  it('con el progreso ya cargado y sin entrada, la fila es «sin presupuesto» y no inventa gasto', () => {
    renderPanel({ progressByCategory: {} })

    const arriendo = row('Arriendo')

    expect(within(arriendo).getByText('Sin presupuesto este mes')).toBeInTheDocument()
    expect(within(arriendo).queryByText(/Gastado/)).not.toBeInTheDocument()
    expect(
      within(arriendo).getByRole('link', { name: 'Completar presupuesto' }),
    ).toBeInTheDocument()
  })
})
