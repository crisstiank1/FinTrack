import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import type { BudgetProgress } from '../progress'
import { BudgetProgressBar } from './budget-progress-bar'

function renderBar(progress: BudgetProgress) {
  return render(
    <BudgetProgressBar progress={progress} categoryName="Alimentación" currencyCode="COP" />,
  )
}

/** Progreso con presupuesto, derivado del gasto para no descuadrar los campos. */
function withBudget(budgetMinor: number, spentMinor: number, status: BudgetProgress['status']) {
  return {
    categoryId: 'cat-food',
    budgetMinor,
    spentMinor,
    remainingMinor: budgetMinor - spentMinor,
    ratio: spentMinor / budgetMinor,
    status,
    source: 'template',
  } satisfies BudgetProgress
}

describe('BudgetProgressBar — sin presupuesto', () => {
  it('no dibuja barra ni porcentaje, y muestra el gasto aparte', () => {
    renderBar({
      categoryId: 'cat-food',
      budgetMinor: null,
      spentMinor: 42_000,
      remainingMinor: null,
      ratio: null,
      status: 'unbudgeted',
      source: null,
    })

    expect(screen.getByText(/Sin presupuesto este mes/)).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText(/%/)).not.toBeInTheDocument()
    expect(screen.getByText('COP 42.000')).toBeInTheDocument()
  })

  it('distingue el 0 deliberado de este mes de la ausencia de configuración', () => {
    renderBar({
      categoryId: 'cat-food',
      budgetMinor: null,
      spentMinor: 10_000,
      remainingMinor: null,
      ratio: null,
      status: 'unbudgeted',
      // Un presupuesto de 0 fijado como excepción para este mes.
      source: 'exception',
    })

    expect(screen.getByText(/excepción de este mes/)).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})

describe('BudgetProgressBar — con presupuesto', () => {
  it('al 70% informa el porcentaje y lo que queda', () => {
    renderBar(withBudget(100_000, 70_000, 'warning_70'))

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70')
    expect(screen.getByText('70 %')).toBeInTheDocument()
    expect(screen.getByText('Quedan COP 30.000')).toBeInTheDocument()
  })

  it('al 90% mantiene la barra dentro del carril', () => {
    renderBar(withBudget(100_000, 90_000, 'warning_90'))

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '90')
    expect(screen.getByText('90 %')).toBeInTheDocument()
  })

  it('al 100% exacto todavía no está excedido', () => {
    renderBar(withBudget(100_000, 100_000, 'warning_90'))

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText('Quedan COP 0')).toBeInTheDocument()
    expect(screen.queryByText(/Excedido/)).not.toBeInTheDocument()
  })

  it('al superarlo muestra el porcentaje real pero recorta la barra', () => {
    renderBar(withBudget(100_000, 130_000, 'over'))

    const bar = screen.getByRole('progressbar')
    // El ancho y el valor ARIA se recortan a 100: el carril no da para más.
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    // Pero el porcentaje real sí se dice, en texto y en aria-valuetext.
    expect(screen.getByText('130 %')).toBeInTheDocument()
    expect(bar).toHaveAttribute(
      'aria-valuetext',
      'Presupuesto superado: COP 130.000 gastados de COP 100.000',
    )
    expect(screen.getByText('Excedido por COP 30.000')).toBeInTheDocument()
  })

  it('aria-valuenow nunca sale del rango 0-100', () => {
    const casos: Array<[number, number, BudgetProgress['status']]> = [
      [100_000, 0, 'ok'],
      [100_000, 50_000, 'ok'],
      [100_000, 400_000, 'over'],
    ]

    for (const [budget, spent, status] of casos) {
      const { unmount } = renderBar(withBudget(budget, spent, status))
      const value = Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'))

      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
      unmount()
    }
  })
})
