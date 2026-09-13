import { afterEach, describe, expect, it, vi } from 'vitest'

import { budgetsHrefForMonth } from './links'

describe('budgetsHrefForMonth', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lleva a Presupuestos del mes indicado', () => {
    expect(budgetsHrefForMonth('2026-09')).toBe('/budgets?month=2026-09')
  })

  it('conserva meses de otros años sin reinterpretarlos', () => {
    expect(budgetsHrefForMonth('2025-12')).toBe('/budgets?month=2025-12')
    expect(budgetsHrefForMonth('2027-01')).toBe('/budgets?month=2027-01')
  })

  it('no depende del reloj: con otra fecha del sistema da el mismo enlace', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2031, 4, 20))

    expect(budgetsHrefForMonth('2026-09')).toBe('/budgets?month=2026-09')
  })
})
