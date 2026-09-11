import { describe, expect, it } from 'vitest'

import { calculateDiff } from './diff'

describe('calculateDiff', () => {
  it('sin presupuesto, la diferencia es "no_budget" sin importar lo real', () => {
    expect(calculateDiff(0, null, 'income_like')).toEqual({ status: 'no_budget' })
    expect(calculateDiff(500_000, null, 'expense_like')).toEqual({ status: 'no_budget' })
  })

  it('igualdad exacta es "en objetivo", nunca favorable ni desfavorable', () => {
    expect(calculateDiff(500_000, 500_000, 'income_like')).toEqual({ status: 'on_target' })
    expect(calculateDiff(500_000, 500_000, 'expense_like')).toEqual({ status: 'on_target' })
  })

  describe('income_like (ingresos, ahorro, inversión): más real que planeado es favorable', () => {
    it('real por encima de lo planeado: favorable', () => {
      expect(calculateDiff(600_000, 500_000, 'income_like')).toEqual({
        status: 'favorable',
        amountMinor: 100_000,
      })
    })

    it('real por debajo de lo planeado: desfavorable', () => {
      expect(calculateDiff(400_000, 500_000, 'income_like')).toEqual({
        status: 'unfavorable',
        amountMinor: 100_000,
      })
    })
  })

  describe('expense_like (gastos, facturas, variables, deuda): más planeado que real es favorable', () => {
    it('real por debajo de lo planeado: favorable (se gastó menos)', () => {
      expect(calculateDiff(400_000, 500_000, 'expense_like')).toEqual({
        status: 'favorable',
        amountMinor: 100_000,
      })
    })

    it('real por encima de lo planeado: desfavorable (se gastó de más)', () => {
      expect(calculateDiff(600_000, 500_000, 'expense_like')).toEqual({
        status: 'unfavorable',
        amountMinor: 100_000,
      })
    })
  })

  it('amountMinor es siempre una magnitud positiva, el signo vive en status', () => {
    const favorable = calculateDiff(600_000, 500_000, 'income_like')
    const unfavorable = calculateDiff(400_000, 500_000, 'income_like')

    if (favorable.status === 'favorable') expect(favorable.amountMinor).toBeGreaterThan(0)
    if (unfavorable.status === 'unfavorable') expect(unfavorable.amountMinor).toBeGreaterThan(0)
  })
})
