import { describe, expect, it } from 'vitest'

import { formatZeroBudget as formatBudgetsZero } from '@/features/budgets/labels'

import { calculateDiff } from './calculations/diff'
import {
  accountTypeBalanceCaption,
  allocationGroupDiffKind,
  allocationGroupLabel,
  balanceTone,
  contributionBlockLabel,
  contributionLineLabel,
  lockedContributionAccountLabel,
  ARCHIVED_ACCOUNT_BADGE,
  CONTRIBUTION_LINE_AMOUNT_LABEL,
  CONTRIBUTION_LINE_NAME_LABEL,
  CONTRIBUTION_LINE_NAME_PLACEHOLDER,
  DELETE_CONTRIBUTION_DESCRIPTION,
  DELETE_CONTRIBUTION_TITLE,
  diffStatusLabel,
  diffStatusTone,
  formatDiff,
  formatAllocationDiff,
  formatAllocationPlanned,
  formatBasisPoints,
  formatPlannedAmount,
  formatPlannedIncomeAmount,
  formatRowDiff,
  formatRowPlannedAmount,
  formatContributionPlanned,
  formatUnassigned,
  formatZeroBudget,
  planLineKindGroupLabel,
  planLineKindLabel,
  planLinesEmptyLabel,
  planRowGroupNote,
  reconciliationDescribedLabel,
  DESCRIBE_FROM_PLAN_LINES_LABEL,
  PLAN_LINES_TITLE,
  linesWithoutBudgetCountLabel,
  linesWithZeroBudgetCountLabel,
  reconciliationHeadline,
  unlinkedCategoriesCountLabel,
  planRowDiffKind,
  planRowLabel,
  ignoredAllocationGroupsNote,
  planSummaryLabel,
  remainingTone,
  NO_ALLOCATION_LABEL,
  ARCHIVED_NO_NEW_BUDGETS_LABEL,
  BALANCE_ERROR_LABEL,
  BALANCE_LOADING_LABEL,
  SAVINGS_INVESTMENT_NOTE,
  SAVINGS_INVESTMENT_TITLE,
  LINE_BUDGET_LOADING_LABEL,
  NO_BUDGET_LABEL,
  NO_CONTRIBUTION_PLAN_LABEL,
  NO_PERCENT_LABEL,
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

  it('ahorro e inversión se miden contra aportes planeados, no contra un presupuesto', () => {
    expect(formatRowPlannedAmount('savings', null, COP)).toBe(NO_CONTRIBUTION_PLAN_LABEL)
    expect(formatRowPlannedAmount('investment', null, COP)).toBe(NO_CONTRIBUTION_PLAN_LABEL)
    expect(formatRowPlannedAmount('savings', null, COP)).not.toBe(NO_BUDGET_LABEL)
  })

  it('un aporte planeado de 0 se conserva como 0', () => {
    expect(formatRowPlannedAmount('investment', 0, COP)).toBe('COP 0')
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

describe('formatRowDiff', () => {
  const sinComparacion = calculateDiff(3_600_000, null, 'income_like')

  it('en ingresos y restante la ausencia es de ingreso planeado, no de presupuesto', () => {
    expect(formatRowDiff('income', sinComparacion, COP)).toBe(NO_PLANNED_INCOME_LABEL)
    expect(formatRowDiff('remaining', sinComparacion, COP)).toBe(NO_PLANNED_INCOME_LABEL)
  })

  it('en las filas de gasto la ausencia sigue siendo de presupuesto', () => {
    expect(formatRowDiff('bills', sinComparacion, COP)).toBe(NO_BUDGET_LABEL)
    expect(formatRowDiff('unplanned', sinComparacion, COP)).toBe(NO_BUDGET_LABEL)
    expect(formatRowDiff('debt', sinComparacion, COP)).toBe(NO_BUDGET_LABEL)
  })

  it('en ahorro e inversión la ausencia es de aportes planeados', () => {
    expect(formatRowDiff('savings', sinComparacion, COP)).toBe(NO_CONTRIBUTION_PLAN_LABEL)
    expect(formatRowDiff('investment', sinComparacion, COP)).toBe(NO_CONTRIBUTION_PLAN_LABEL)
  })

  it('coincide con el planeado de la misma fila: una fila no dice dos cosas distintas', () => {
    for (const rowId of [
      'income',
      'remaining',
      'bills',
      'unplanned',
      'debt',
      'savings',
      'investment',
    ] as const) {
      expect(formatRowDiff(rowId, sinComparacion, COP)).toBe(
        formatRowPlannedAmount(rowId, null, COP),
      )
    }
  })

  it('cuando sí hay comparación, no cambia nada', () => {
    const diff = calculateDiff(1_500_000, 1_400_000, 'income_like')

    expect(formatRowDiff('income', diff, COP)).toBe('Favorable por COP 100.000')
    expect(formatRowDiff('bills', calculateDiff(300_000, 400_000, 'expense_like'), COP)).toBe(
      'Favorable por COP 100.000',
    )
  })
})

describe('remainingTone', () => {
  it('un restante negativo se destaca', () => {
    expect(remainingTone(-300_000)).toBe('negative')
  })

  it('cero y positivo son neutros: no hay nada que advertir', () => {
    expect(remainingTone(0)).toBe('neutral')
    expect(remainingTone(340_000)).toBe('neutral')
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

describe('reparto 50/30/20', () => {
  it('escribe los puntos base como porcentaje', () => {
    expect(formatBasisPoints(5_000)).toBe('50 %')
    expect(formatBasisPoints(0)).toBe('0 %')
    expect(formatBasisPoints(3_333)).toBe('33,33 %')
  })

  it('sin reparto configurado, el porcentaje no se inventa', () => {
    expect(formatBasisPoints(null)).toBe(NO_PERCENT_LABEL)
  })

  it('los cinco grupos tienen nombre propio', () => {
    expect(allocationGroupLabel).toEqual({
      needs: 'Necesidades',
      wants: 'Deseos',
      savings: 'Ahorro',
      investment: 'Inversión',
      debt: 'Deuda',
    })
  })

  it('gastar menos es favorable; aportar menos, desfavorable', () => {
    expect(allocationGroupDiffKind.needs).toBe('expense_like')
    expect(allocationGroupDiffKind.wants).toBe('expense_like')
    expect(allocationGroupDiffKind.debt).toBe('expense_like')
    expect(allocationGroupDiffKind.savings).toBe('income_like')
    expect(allocationGroupDiffKind.investment).toBe('income_like')
  })

  it('distingue las dos razones por las que puede faltar un importe', () => {
    expect(formatAllocationPlanned(null, false, COP)).toBe(NO_ALLOCATION_LABEL)
    expect(formatAllocationPlanned(null, true, COP)).toBe(NO_PLANNED_INCOME_LABEL)
    expect(formatAllocationPlanned(700_000, true, COP)).toBe('COP 700.000')
  })

  it('conserva un 0 asignado, que es una decisión y no una ausencia', () => {
    expect(formatAllocationPlanned(0, true, COP)).toBe('COP 0')
  })

  it('la diferencia nombra la misma causa que el importe', () => {
    const sinComparacion = calculateDiff(500_000, null, 'expense_like')

    expect(formatAllocationDiff(sinComparacion, false, COP)).toBe(NO_ALLOCATION_LABEL)
    expect(formatAllocationDiff(sinComparacion, true, COP)).toBe(NO_PLANNED_INCOME_LABEL)
    expect(formatAllocationDiff(calculateDiff(600_000, 700_000, 'expense_like'), true, COP)).toBe(
      'Favorable por COP 100.000',
    )
  })

  it('avisa de los grupos descartados, y calla cuando no hay ninguno', () => {
    expect(ignoredAllocationGroupsNote([])).toBeNull()
    expect(ignoredAllocationGroupsNote(['caprichos'])).toContain('caprichos')
    expect(ignoredAllocationGroupsNote(['caprichos'])).toContain('100 %')
    expect(ignoredAllocationGroupsNote(['caprichos', 'viajes'])).toContain('viajes')
  })
})

describe('formatContributionPlanned', () => {
  it('sin línea de aportes dice «Sin aportes planeados», nunca «Sin presupuesto»', () => {
    expect(formatContributionPlanned(null, COP)).toBe(NO_CONTRIBUTION_PLAN_LABEL)
    expect(formatContributionPlanned(null, COP)).not.toBe(NO_BUDGET_LABEL)
  })

  it('conserva un 0 guardado en la línea', () => {
    expect(formatContributionPlanned(0, COP)).toBe('COP 0')
  })
})

describe('formatZeroBudget', () => {
  it('dice el 0 explícito como importe, no como ausencia', () => {
    expect(formatZeroBudget(COP)).toBe('Presupuesto en COP 0')
    expect(formatZeroBudget(COP)).not.toContain(NO_BUDGET_LABEL)
  })

  it('es el mismo texto que usa /budgets para el mismo presupuesto', () => {
    expect(formatZeroBudget(COP)).toBe(formatBudgetsZero(COP))
    expect(formatZeroBudget('USD')).toBe(formatBudgetsZero('USD'))
  })
})

describe('reconciliationHeadline', () => {
  it('con ingreso planeado y sin exceso: asignado de ingreso, y lo que queda', () => {
    expect(
      reconciliationHeadline(
        { assignedMinor: 1_750_000, incomePlannedMinor: 3_000_000, unassignedMinor: 1_250_000 },
        COP,
      ),
    ).toEqual({
      title: 'Asignado COP 1.750.000 de COP 3.000.000',
      detail: 'Por asignar: COP 1.250.000',
      tone: 'neutral',
    })
  })

  it('plan exacto: por asignar vale COP 0, no una ausencia', () => {
    const headline = reconciliationHeadline(
      { assignedMinor: 3_000_000, incomePlannedMinor: 3_000_000, unassignedMinor: 0 },
      COP,
    )

    expect(headline.title).toBe('Asignado COP 3.000.000 de COP 3.000.000')
    expect(headline.detail).toBe('Por asignar: COP 0')
  })

  it('sobreasignado: el exceso es el titular, sin signo negativo', () => {
    const headline = reconciliationHeadline(
      { assignedMinor: 3_200_000, incomePlannedMinor: 3_000_000, unassignedMinor: -200_000 },
      COP,
    )

    expect(headline).toEqual({
      title: 'Sobreasignado por COP 200.000',
      detail: 'Asignado COP 3.200.000 de COP 3.000.000. Se asignó más que el ingreso planeado.',
      tone: 'negative',
    })
    expect(`${headline.title} ${headline.detail}`).not.toMatch(/-|−/)
  })

  it('sin ingreso planeado no compara ni declara exceso', () => {
    expect(
      reconciliationHeadline(
        { assignedMinor: 1_750_000, incomePlannedMinor: null, unassignedMinor: null },
        COP,
      ),
    ).toEqual({ title: 'Asignado COP 1.750.000', detail: NO_PLANNED_INCOME_LABEL, tone: 'neutral' })
  })

  it('con una fuente explícita de COP 0 compara contra COP 0', () => {
    const headline = reconciliationHeadline(
      { assignedMinor: 1_750_000, incomePlannedMinor: 0, unassignedMinor: -1_750_000 },
      COP,
    )

    expect(headline.title).toBe('Sobreasignado por COP 1.750.000')
    expect(headline.detail).toContain('Asignado COP 1.750.000 de COP 0')
    expect(`${headline.title} ${headline.detail}`).not.toContain(NO_PLANNED_INCOME_LABEL)
  })

  it('con ingreso de COP 0 y nada asignado, no hay exceso', () => {
    expect(
      reconciliationHeadline({ assignedMinor: 0, incomePlannedMinor: 0, unassignedMinor: 0 }, COP),
    ).toMatchObject({ title: 'Asignado COP 0 de COP 0', detail: 'Por asignar: COP 0' })
  })
})

describe('conteos de la reconciliación', () => {
  it('concuerdan en número', () => {
    expect(unlinkedCategoriesCountLabel(0)).toBe('0 categorías con presupuesto sin línea')
    expect(unlinkedCategoriesCountLabel(1)).toBe('1 categoría con presupuesto sin línea')
    expect(linesWithoutBudgetCountLabel(1)).toBe('1 línea sin presupuesto')
    expect(linesWithoutBudgetCountLabel(5)).toBe('5 líneas sin presupuesto')
    expect(linesWithZeroBudgetCountLabel(1, COP)).toBe('1 línea con presupuesto en COP 0')
    expect(linesWithZeroBudgetCountLabel(2, COP)).toBe('2 líneas con presupuesto en COP 0')
  })
})

describe('estados del presupuesto de una línea', () => {
  it('mientras carga no afirma ni ausencia ni cero', () => {
    expect(LINE_BUDGET_LOADING_LABEL).toBe('Calculando presupuesto…')
    expect(LINE_BUDGET_LOADING_LABEL).not.toContain(NO_BUDGET_LABEL)
    expect(LINE_BUDGET_LOADING_LABEL).not.toContain('0')
  })

  it('la categoría archivada dice por qué no se invita a completar', () => {
    expect(ARCHIVED_NO_NEW_BUDGETS_LABEL).toBe(
      'Categoría archivada: no admite presupuestos nuevos.',
    )
  })
})

describe('planLineKindLabel', () => {
  it('nombra los dos tipos de línea en singular', () => {
    expect(planLineKindLabel).toEqual({ bill: 'Factura', variable: 'Gasto variable' })
  })
})

describe('textos de facturas y gastos variables', () => {
  it('nombra los dos tipos de línea en plural', () => {
    expect(planLineKindGroupLabel).toEqual({ bill: 'Facturas', variable: 'Gastos variables' })
  })

  it('las filas del cuadro usan el mismo plural que los grupos del panel', () => {
    expect(planRowLabel.bills).toBe(planLineKindGroupLabel.bill)
    expect(planRowLabel.variables).toBe(planLineKindGroupLabel.variable)
    expect(planRowLabel.bills).toBe('Facturas')
    expect(planRowLabel.variables).toBe('Gastos variables')
  })

  it('el título del bloque de líneas', () => {
    expect(PLAN_LINES_TITLE).toBe('Facturas y gastos variables')
  })

  it('las filas de la reconciliación dicen qué tipo describe cada importe', () => {
    expect(reconciliationDescribedLabel).toEqual({
      bill: 'Descrito en facturas',
      variable: 'Descrito en gastos variables',
    })
  })

  it('el vacío del bloque de líneas nombra el mes', () => {
    expect(planLinesEmptyLabel('septiembre 2026')).toBe(
      'septiembre 2026 no tiene facturas ni gastos variables descritos.',
    )
  })

  it('la invitación de la reconciliación nombra el bloque de líneas', () => {
    expect(DESCRIBE_FROM_PLAN_LINES_LABEL).toBe(
      'Puedes describirla desde Facturas y gastos variables.',
    )
    expect(DESCRIBE_FROM_PLAN_LINES_LABEL).toContain(PLAN_LINES_TITLE)
  })

  it('la nota del desglose del cuadro no cambia', () => {
    expect(planRowGroupNote.breakdown).toBe(
      'Facturas, gastos variables y no planeado suman los gastos totales.',
    )
  })
})

describe('ahorro e inversión', () => {
  const FORBIDDEN = ['Total ahorrado', 'Ahorrado', 'Dinero disponible']

  function allBlockTexts(): string[] {
    return [
      SAVINGS_INVESTMENT_TITLE,
      SAVINGS_INVESTMENT_NOTE,
      BALANCE_LOADING_LABEL,
      BALANCE_ERROR_LABEL,
      ...Object.values(contributionBlockLabel).flatMap((labels) => Object.values(labels)),
    ]
  }

  it('usa los textos aprobados para el bloque', () => {
    expect(SAVINGS_INVESTMENT_TITLE).toBe('Ahorro e inversión')
    expect(SAVINGS_INVESTMENT_NOTE).toBe(
      'Los aportes son transferencias registradas en el mes hacia tus cuentas de ahorro o inversión. El saldo es lo acumulado en esas cuentas y no se suma a las cifras del mes.',
    )
    expect(contributionBlockLabel).toEqual({
      savings: {
        title: 'Ahorro',
        contributions: 'Aportes a ahorro del mes',
        balance: 'Saldo en cuentas de ahorro',
        noAccounts: 'Sin cuentas de ahorro',
        createAccount: 'Crear una cuenta de ahorro',
      },
      investment: {
        title: 'Inversión',
        contributions: 'Aportes a inversión del mes',
        balance: 'Saldo en cuentas de inversión',
        noAccounts: 'Sin cuentas de inversión',
        createAccount: 'Crear una cuenta de inversión',
      },
    })
  })

  it('nunca dice «Total ahorrado», «Ahorrado» ni «Dinero disponible»', () => {
    for (const text of allBlockTexts()) {
      for (const forbidden of FORBIDDEN) {
        expect(text).not.toContain(forbidden)
      }
    }
  })

  it('aportes y saldo nunca comparten nombre', () => {
    for (const labels of Object.values(contributionBlockLabel)) {
      expect(labels.contributions).not.toBe(labels.balance)
      expect(labels.contributions).toContain('del mes')
      expect(labels.balance).toContain('Saldo en cuentas')
    }
  })

  it('mientras carga o si falla no afirma un saldo', () => {
    expect(BALANCE_LOADING_LABEL).toBe('Calculando saldo…')
    expect(BALANCE_ERROR_LABEL).toBe('No pudimos calcular el saldo.')
    expect(BALANCE_LOADING_LABEL).not.toContain('0')
    expect(BALANCE_ERROR_LABEL).not.toContain('0')
  })

  describe('accountTypeBalanceCaption', () => {
    it('fecha de corte y número de cuentas, en singular', () => {
      expect(accountTypeBalanceCaption('2026-09-30', 1, 0)).toBe(
        'Al 30 de septiembre de 2026 · 1 cuenta',
      )
    })

    it('en plural, y sin mencionar archivadas cuando no hay', () => {
      expect(accountTypeBalanceCaption('2026-09-30', 2, 0)).toBe(
        'Al 30 de septiembre de 2026 · 2 cuentas',
      )
    })

    it('nombra las archivadas incluidas en el saldo, en singular y en plural', () => {
      expect(accountTypeBalanceCaption('2026-09-30', 2, 1)).toBe(
        'Al 30 de septiembre de 2026 · 2 cuentas · 1 archivada',
      )
      expect(accountTypeBalanceCaption('2026-08-31', 3, 2)).toBe(
        'Al 31 de agosto de 2026 · 3 cuentas · 2 archivadas',
      )
    })
  })

  describe('balanceTone', () => {
    it('un saldo negativo se destaca', () => {
      expect(balanceTone(-50_000)).toBe('negative')
    })

    it('cero y positivo son neutros', () => {
      expect(balanceTone(0)).toBe('neutral')
      expect(balanceTone(700_000)).toBe('neutral')
    })
  })
})

describe('líneas de aporte', () => {
  it('usa los textos aprobados para cada tipo', () => {
    expect(contributionLineLabel).toEqual({
      savings: {
        list: 'Aportes a ahorro planeados',
        addButton: 'Añadir aporte a ahorro',
        dialogTitleNew: 'Nuevo aporte a ahorro',
        accountField: 'Cuenta de ahorro',
        noAccounts: 'Necesitas una cuenta de ahorro para planificar un aporte.',
        accountsExhausted: 'Todas tus cuentas de ahorro ya tienen un aporte planeado este mes.',
      },
      investment: {
        list: 'Aportes a inversión planeados',
        addButton: 'Añadir aporte a inversión',
        dialogTitleNew: 'Nuevo aporte a inversión',
        accountField: 'Cuenta de inversión',
        noAccounts: 'Necesitas una cuenta de inversión para planificar un aporte.',
        accountsExhausted: 'Todas tus cuentas de inversión ya tienen un aporte planeado este mes.',
      },
    })
  })

  it('campos, marca de archivada y borrado', () => {
    expect(CONTRIBUTION_LINE_NAME_LABEL).toBe('Nombre')
    expect(CONTRIBUTION_LINE_NAME_PLACEHOLDER).toBe('Ej. Fondo de emergencia')
    expect(CONTRIBUTION_LINE_AMOUNT_LABEL).toBe('Importe planeado')
    expect(ARCHIVED_ACCOUNT_BADGE).toBe('Archivada')
    expect(DELETE_CONTRIBUTION_TITLE).toBe('Eliminar aporte')
    expect(DELETE_CONTRIBUTION_DESCRIPTION).toBe(
      'Se eliminará el aporte planeado. La cuenta y sus movimientos no se tocan.',
    )
  })

  it('al editar, la cuenta se enuncia y se dice cómo cambiarla', () => {
    expect(lockedContributionAccountLabel('Fondo')).toBe(
      'Cuenta: Fondo. Para cambiarla, elimina el aporte y crea otro.',
    )
  })

  it('siempre hablan de aportes, nunca de gasto ni de «Total ahorrado»', () => {
    const texts = [
      ...Object.values(contributionLineLabel).flatMap((labels) => Object.values(labels)),
      DELETE_CONTRIBUTION_TITLE,
      DELETE_CONTRIBUTION_DESCRIPTION,
    ]

    for (const text of texts) {
      expect(text).not.toMatch(/gasto|Total ahorrado/i)
    }
  })
})
