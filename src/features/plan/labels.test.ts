import { describe, expect, it } from 'vitest'

import { calculateDiff } from './calculations/diff'
import {
  diffStatusLabel,
  diffStatusTone,
  formatDiff,
  formatPlannedAmount,
  formatPlannedIncomeAmount,
  formatRowPlannedAmount,
  formatUnassigned,
  planRowDiffKind,
  planRowLabel,
  planSummaryLabel,
  NO_BUDGET_LABEL,
  NO_PLANNED_INCOME_LABEL,
} from './labels'

const COP = 'COP'

describe('formatPlannedAmount', () => {
  it('sin presupuesto aplicable lo dice con palabras', () => {
    expect(formatPlannedAmount(null, COP)).toBe(NO_BUDGET_LABEL)
  })

  it('conserva un 0 explícito como 0, sin convertirlo en «Sin presupuesto»', () => {
    const formatted = formatPlannedAmount(0, COP)

    expect(formatted).toBe('COP 0')
    expect(formatted).not.toBe(NO_BUDGET_LABEL)
  })

  it('formatea un importe normal con su moneda', () => {
    expect(formatPlannedAmount(1_400_000, COP)).toBe('COP 1.400.000')
  })
})

describe('formatPlannedIncomeAmount', () => {
  it('sin ingreso planeado lo dice como tal, no como «Sin presupuesto»', () => {
    expect(formatPlannedIncomeAmount(null, COP)).toBe(NO_PLANNED_INCOME_LABEL)
    expect(formatPlannedIncomeAmount(null, COP)).not.toBe(NO_BUDGET_LABEL)
  })

  it('conserva un 0 explícito', () => {
    expect(formatPlannedIncomeAmount(0, COP)).toBe('COP 0')
  })
})

describe('formatRowPlannedAmount', () => {
  it('ingresos y restante se miden contra el ingreso planeado', () => {
    expect(formatRowPlannedAmount('income', null, COP)).toBe(NO_PLANNED_INCOME_LABEL)
    expect(formatRowPlannedAmount('remaining', null, COP)).toBe(NO_PLANNED_INCOME_LABEL)
  })

  it('las filas de gasto se miden contra un presupuesto', () => {
    expect(formatRowPlannedAmount('bills', null, COP)).toBe(NO_BUDGET_LABEL)
    expect(formatRowPlannedAmount('unplanned', null, COP)).toBe(NO_BUDGET_LABEL)
    expect(formatRowPlannedAmount('debt', null, COP)).toBe(NO_BUDGET_LABEL)
  })

  it('con importe, todas las filas se escriben igual', () => {
    expect(formatRowPlannedAmount('income', 1_400_000, COP)).toBe('COP 1.400.000')
    expect(formatRowPlannedAmount('bills', 400_000, COP)).toBe('COP 400.000')
  })
})

describe('formatDiff', () => {
  it('una diferencia favorable se dice en texto, con su magnitud', () => {
    const diff = calculateDiff(1_500_000, 1_400_000, 'income_like')

    expect(formatDiff(diff, COP)).toBe('Favorable por COP 100.000')
  })

  it('una diferencia desfavorable se dice en texto, con la magnitud en positivo', () => {
    const diff = calculateDiff(520_000, 400_000, 'expense_like')

    expect(formatDiff(diff, COP)).toBe('Desfavorable por COP 120.000')
  })

  it('la igualdad exacta es «En objetivo», sin cantidad', () => {
    const diff = calculateDiff(400_000, 400_000, 'expense_like')

    expect(formatDiff(diff, COP)).toBe('En objetivo')
  })

  it('sin presupuesto no escribe ninguna cantidad', () => {
    const diff = calculateDiff(90_000, null, 'expense_like')

    expect(formatDiff(diff, COP)).toBe(NO_BUDGET_LABEL)
    expect(formatDiff(diff, COP)).not.toContain('0')
  })

  it('el tono acompaña al texto, y lo neutro no se confunde con lo desfavorable', () => {
    expect(diffStatusTone.favorable).toBe('positive')
    expect(diffStatusTone.unfavorable).toBe('negative')
    expect(diffStatusTone.on_target).toBe('neutral')
    expect(diffStatusTone.no_budget).toBe('neutral')
  })

  it('cada estado de la diferencia tiene etiqueta', () => {
    expect(Object.values(diffStatusLabel).every((label) => label.length > 0)).toBe(true)
  })
})

describe('formatUnassigned', () => {
  it('sin ingreso planeado no hay comparación válida', () => {
    expect(formatUnassigned(null, COP)).toEqual({ text: NO_PLANNED_INCOME_LABEL, tone: 'neutral' })
  })

  it('negativo se dice «Sobreasignado», nunca como un negativo desnudo', () => {
    const result = formatUnassigned(-120_000, COP)

    expect(result.text).toBe('Sobreasignado por COP 120.000')
    expect(result.text).not.toContain('-')
    expect(result.tone).toBe('negative')
  })

  it('un 0 significa plan completo, no falta de información', () => {
    const result = formatUnassigned(0, COP)

    expect(result.text).toBe('COP 0')
    expect(result.text).not.toBe(NO_PLANNED_INCOME_LABEL)
  })

  it('positivo se muestra tal cual', () => {
    expect(formatUnassigned(305_000, COP).text).toBe('COP 305.000')
  })
})

describe('etiquetas del resumen', () => {
  it('el ahorro del mes son «Aportes a ahorro», nunca «Total ahorrado»', () => {
    expect(planSummaryLabel.savingsContributions).toBe('Aportes a ahorro')
    expect(Object.values(planSummaryLabel)).not.toContain('Total ahorrado')
  })

  it('las seis tarjetas de la entrega tienen etiqueta', () => {
    expect(Object.keys(planSummaryLabel)).toHaveLength(6)
  })
})

describe('filas del cuadro', () => {
  it('ingresos, ahorro, inversión y restante mejoran cuando lo real supera lo planeado', () => {
    expect(planRowDiffKind.income).toBe('income_like')
    expect(planRowDiffKind.savings).toBe('income_like')
    expect(planRowDiffKind.investment).toBe('income_like')
    expect(planRowDiffKind.remaining).toBe('income_like')
  })

  it('los gastos, las facturas, las variables y la deuda mejoran cuando lo real queda por debajo', () => {
    expect(planRowDiffKind.expensesTotal).toBe('expense_like')
    expect(planRowDiffKind.bills).toBe('expense_like')
    expect(planRowDiffKind.variables).toBe('expense_like')
    expect(planRowDiffKind.unplanned).toBe('expense_like')
    expect(planRowDiffKind.debt).toBe('expense_like')
  })

  it('cada fila tiene etiqueta y convención de signo', () => {
    expect(Object.keys(planRowLabel)).toEqual(Object.keys(planRowDiffKind))
  })

  it('un gasto por debajo de lo presupuestado es favorable, no al revés', () => {
    const diff = calculateDiff(300_000, 400_000, planRowDiffKind.bills)

    expect(formatDiff(diff, COP)).toBe('Favorable por COP 100.000')
  })

  it('un ingreso por debajo de lo planeado es desfavorable', () => {
    const diff = calculateDiff(1_200_000, 1_400_000, planRowDiffKind.income)

    expect(formatDiff(diff, COP)).toBe('Desfavorable por COP 200.000')
  })
})
