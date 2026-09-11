import { describe, expect, it } from 'vitest'

import { calculateMonthlyIncome } from '@/lib/calculations'

import {
  calculateBalanceForAccountType,
  sumTransferContributions,
} from './calculations/contributions'
import { groupExpensesByClassification, sumActualExpenses } from './calculations/expenses'
import {
  buildAllocationPercentages,
  buildClassificationMap,
  buildIncomeActualBySource,
  buildTransferContributionCandidates,
  isAllocationGroup,
  isExpenseClassificationGroup,
  isPlanLineKind,
  partitionPlanLines,
  planLineCategoryIds,
  toBalanceTransactions,
  toPlanExpenseTransactions,
  toPlannedIncomeSources,
  toPlannedLineAmounts,
  type PlanAccountTypeRow,
  type PlanTransferLeg,
} from './read-model'

/* -------------------------------------------------------------------------- */
/* Emparejamiento de transferencias                                           */
/* -------------------------------------------------------------------------- */

const ACC_BANK = 'acc-bank'
const ACC_SAVINGS = 'acc-savings'
const ACC_SAVINGS_2 = 'acc-savings-2'
const ACC_INVESTMENT = 'acc-investment'
const ACC_CARD = 'acc-card'

const accounts: PlanAccountTypeRow[] = [
  { id: ACC_BANK, type: 'checking' },
  { id: ACC_SAVINGS, type: 'savings' },
  { id: ACC_SAVINGS_2, type: 'savings' },
  { id: ACC_INVESTMENT, type: 'investment' },
  { id: ACC_CARD, type: 'credit_card' },
]

/** Las dos patas de una transferencia registrada, como las escribe la aplicación. */
function transferPair(
  groupId: string,
  fromAccountId: string,
  toAccountId: string,
  amountMinor: number,
): PlanTransferLeg[] {
  return [
    {
      type: 'transfer',
      transfer_direction: 'outgoing',
      transfer_group_id: groupId,
      account_id: fromAccountId,
      amount_minor: amountMinor,
    },
    {
      type: 'transfer',
      transfer_direction: 'incoming',
      transfer_group_id: groupId,
      account_id: toAccountId,
      amount_minor: amountMinor,
    },
  ]
}

describe('buildTransferContributionCandidates', () => {
  it('empareja una transferencia de banco a ahorro', () => {
    const legs = transferPair('g1', ACC_BANK, ACC_SAVINGS, 100_000)

    expect(buildTransferContributionCandidates(legs, accounts)).toEqual([
      { amountMinor: 100_000, destinationAccountType: 'savings', sourceAccountType: 'checking' },
    ])
  })

  it('produce un solo candidato por grupo, aunque una transferencia sean dos filas', () => {
    const legs = transferPair('g1', ACC_BANK, ACC_SAVINGS, 100_000)
    const candidates = buildTransferContributionCandidates(legs, accounts)

    expect(candidates).toHaveLength(1)
    expect(sumTransferContributions(candidates, 'savings')).toBe(100_000)
  })

  it('excluye ahorro a ahorro: mover dinero entre cuentas del mismo tipo no es aportar', () => {
    const legs = transferPair('g1', ACC_SAVINGS, ACC_SAVINGS_2, 50_000)

    expect(buildTransferContributionCandidates(legs, accounts)).toEqual([])
  })

  it('excluye inversión a inversión', () => {
    const otherInvestment: PlanAccountTypeRow[] = [
      ...accounts,
      { id: 'acc-investment-2', type: 'investment' },
    ]
    const legs = transferPair('g1', ACC_INVESTMENT, 'acc-investment-2', 70_000)

    expect(buildTransferContributionCandidates(legs, otherInvestment)).toEqual([])
  })

  it('no mezcla ahorro con inversión: ahorro a inversión es aporte de inversión y no de ahorro', () => {
    const legs = transferPair('g1', ACC_SAVINGS, ACC_INVESTMENT, 80_000)
    const candidates = buildTransferContributionCandidates(legs, accounts)

    expect(sumTransferContributions(candidates, 'investment')).toBe(80_000)
    expect(sumTransferContributions(candidates, 'savings')).toBe(0)
  })

  it('ignora un grupo sin segunda pata, en vez de contar la pata aislada', () => {
    const [, incomingOnly] = transferPair('g1', ACC_BANK, ACC_SAVINGS, 100_000)

    expect(buildTransferContributionCandidates([incomingOnly], accounts)).toEqual([])
  })

  it('ignora un grupo con tres o más filas: elegir dos inventaría un aporte', () => {
    const legs = [
      ...transferPair('g1', ACC_BANK, ACC_SAVINGS, 100_000),
      {
        type: 'transfer',
        transfer_direction: 'incoming',
        transfer_group_id: 'g1',
        account_id: ACC_SAVINGS_2,
        amount_minor: 100_000,
      },
    ]

    expect(buildTransferContributionCandidates(legs, accounts)).toEqual([])
  })

  it('ignora un grupo con dos patas en la misma dirección', () => {
    const legs: PlanTransferLeg[] = [
      {
        type: 'transfer',
        transfer_direction: 'incoming',
        transfer_group_id: 'g1',
        account_id: ACC_SAVINGS,
        amount_minor: 100_000,
      },
      {
        type: 'transfer',
        transfer_direction: 'incoming',
        transfer_group_id: 'g1',
        account_id: ACC_SAVINGS_2,
        amount_minor: 100_000,
      },
    ]

    expect(buildTransferContributionCandidates(legs, accounts)).toEqual([])
  })

  it('ignora una transferencia entre tipos no elegibles', () => {
    const legs = transferPair('g1', ACC_BANK, ACC_CARD, 20_000)

    expect(buildTransferContributionCandidates(legs, accounts)).toEqual([])
  })

  it('ignora un grupo con una cuenta de tipo desconocido', () => {
    const legs = transferPair('g1', 'acc-fantasma', ACC_SAVINGS, 100_000)

    expect(buildTransferContributionCandidates(legs, accounts)).toEqual([])
  })

  it('ignora una transferencia sin grupo y los movimientos que no son transferencias', () => {
    const legs: PlanTransferLeg[] = [
      {
        type: 'transfer',
        transfer_direction: 'incoming',
        transfer_group_id: null,
        account_id: ACC_SAVINGS,
        amount_minor: 100_000,
      },
      {
        type: 'income',
        transfer_direction: null,
        transfer_group_id: null,
        account_id: ACC_SAVINGS,
        amount_minor: 500_000,
      },
    ]

    expect(buildTransferContributionCandidates(legs, accounts)).toEqual([])
  })

  it('empareja varios grupos por su transfer_group_id, no por su posición', () => {
    const legs = [
      ...transferPair('g1', ACC_BANK, ACC_SAVINGS, 100_000),
      ...transferPair('g2', ACC_BANK, ACC_INVESTMENT, 40_000),
    ]
    // Intercalados, para que emparejar por posición dé un resultado distinto.
    const shuffled = [legs[0], legs[2], legs[1], legs[3]]
    const candidates = buildTransferContributionCandidates(shuffled, accounts)

    expect(sumTransferContributions(candidates, 'savings')).toBe(100_000)
    expect(sumTransferContributions(candidates, 'investment')).toBe(40_000)
  })
})

/* -------------------------------------------------------------------------- */
/* Estrechamiento de uniones                                                  */
/* -------------------------------------------------------------------------- */

describe('guardas de estrechamiento', () => {
  it('isAllocationGroup admite los cinco grupos del reparto y nada más', () => {
    expect(isAllocationGroup('needs')).toBe(true)
    expect(isAllocationGroup('savings')).toBe(true)
    expect(isAllocationGroup('investment')).toBe(true)
    expect(isAllocationGroup('debt')).toBe(true)
    expect(isAllocationGroup('sin_clasificar')).toBe(false)
  })

  it('isExpenseClassificationGroup admite solo needs, wants y debt', () => {
    expect(isExpenseClassificationGroup('needs')).toBe(true)
    expect(isExpenseClassificationGroup('debt')).toBe(true)
    // savings e investment se miden por transferencias, no por categorías.
    expect(isExpenseClassificationGroup('savings')).toBe(false)
    expect(isExpenseClassificationGroup('investment')).toBe(false)
  })

  it('isPlanLineKind admite los cuatro kinds y rechaza debt, que no existe', () => {
    expect(isPlanLineKind('bill')).toBe(true)
    expect(isPlanLineKind('variable')).toBe(true)
    expect(isPlanLineKind('savings')).toBe(true)
    expect(isPlanLineKind('investment')).toBe(true)
    expect(isPlanLineKind('debt')).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* Mapas de configuración                                                     */
/* -------------------------------------------------------------------------- */

const CAT_RENT = 'cat-rent'
const CAT_FUN = 'cat-fun'
const CAT_LOAN = 'cat-loan'
const CAT_WEIRD = 'cat-weird'

describe('buildClassificationMap', () => {
  it('estrecha los tres grupos válidos', () => {
    const map = buildClassificationMap([
      { category_id: CAT_RENT, budget_group: 'needs' },
      { category_id: CAT_FUN, budget_group: 'wants' },
      { category_id: CAT_LOAN, budget_group: 'debt' },
    ])

    expect(map).toEqual({ [CAT_RENT]: 'needs', [CAT_FUN]: 'wants', [CAT_LOAN]: 'debt' })
  })

  it('omite un grupo desconocido, de modo que su gasto cae en sin clasificar', () => {
    const map = buildClassificationMap([
      { category_id: CAT_RENT, budget_group: 'needs' },
      { category_id: CAT_WEIRD, budget_group: 'ahorro' },
    ])

    expect(map[CAT_WEIRD]).toBeUndefined()

    const breakdown = groupExpensesByClassification(
      [
        { type: 'expense', category_id: CAT_RENT, amount_minor: 100_000 },
        { type: 'expense', category_id: CAT_WEIRD, amount_minor: 9_000 },
      ],
      map,
    )

    expect(breakdown.needsMinor).toBe(100_000)
    expect(breakdown.sinClasificarMinor).toBe(9_000)
  })

  it('ante una categoría repetida conserva la primera fila', () => {
    const map = buildClassificationMap([
      { category_id: CAT_RENT, budget_group: 'needs' },
      { category_id: CAT_RENT, budget_group: 'wants' },
    ])

    expect(map[CAT_RENT]).toBe('needs')
  })
})

describe('buildAllocationPercentages', () => {
  it('construye los porcentajes del reparto sin grupos descartados', () => {
    const result = buildAllocationPercentages([
      { budget_group: 'needs', percent_bp: 5_000 },
      { budget_group: 'wants', percent_bp: 3_000 },
      { budget_group: 'savings', percent_bp: 1_000 },
      { budget_group: 'investment', percent_bp: 500 },
      { budget_group: 'debt', percent_bp: 500 },
    ])

    expect(result.percentages).toEqual({
      needs: 5_000,
      wants: 3_000,
      savings: 1_000,
      investment: 500,
      debt: 500,
    })
    expect(result.ignoredGroups).toEqual([])
  })

  it('descarta un grupo desconocido y lo reporta, en vez de enviarlo al cálculo', () => {
    const result = buildAllocationPercentages([
      { budget_group: 'needs', percent_bp: 5_000 },
      { budget_group: 'caprichos', percent_bp: 5_000 },
    ])

    expect(result.percentages).toEqual({ needs: 5_000 })
    expect(result.ignoredGroups).toEqual(['caprichos'])
  })

  it('ante un grupo repetido conserva la primera fila', () => {
    const result = buildAllocationPercentages([
      { budget_group: 'needs', percent_bp: 5_000 },
      { budget_group: 'needs', percent_bp: 1_000 },
    ])

    expect(result.percentages.needs).toBe(5_000)
  })
})

/* -------------------------------------------------------------------------- */
/* Líneas de plan                                                             */
/* -------------------------------------------------------------------------- */

describe('partitionPlanLines', () => {
  const lines = [
    { id: 'l1', kind: 'bill', category_id: CAT_RENT, planned_minor: null, name: 'Arriendo' },
    { id: 'l2', kind: 'variable', category_id: CAT_FUN, planned_minor: null, name: 'Ocio' },
    { id: 'l3', kind: 'savings', category_id: null, planned_minor: 200_000, name: 'Fondo' },
    { id: 'l4', kind: 'investment', category_id: null, planned_minor: 50_000, name: 'Índice' },
  ]

  it('reparte las líneas por kind y conserva las columnas de la fila completa', () => {
    const partition = partitionPlanLines(lines)

    expect(partition.bills.map((line) => line.name)).toEqual(['Arriendo'])
    expect(partition.variables.map((line) => line.name)).toEqual(['Ocio'])
    expect(partition.savings.map((line) => line.name)).toEqual(['Fondo'])
    expect(partition.investments.map((line) => line.name)).toEqual(['Índice'])
    expect(partition.unknownKindLineIds).toEqual([])
  })

  it('aparta un kind desconocido sin tratarlo como factura', () => {
    const partition = partitionPlanLines([
      ...lines,
      { id: 'l5', kind: 'debt', category_id: CAT_LOAN, planned_minor: null, name: 'Préstamo' },
    ])

    expect(partition.unknownKindLineIds).toEqual(['l5'])
    expect(partition.bills.map((line) => line.id)).toEqual(['l1'])
    expect(planLineCategoryIds(partition.bills)).toEqual([CAT_RENT])
  })

  it('conserva el orden de entrada dentro de cada kind', () => {
    const partition = partitionPlanLines([
      { id: 'l2', kind: 'bill', category_id: 'cat-b', planned_minor: null },
      { id: 'l1', kind: 'bill', category_id: 'cat-a', planned_minor: null },
    ])

    expect(partition.bills.map((line) => line.id)).toEqual(['l2', 'l1'])
  })
})

describe('planLineCategoryIds', () => {
  it('omite las líneas del eje cuenta, que no tienen categoría', () => {
    expect(
      planLineCategoryIds([
        { category_id: CAT_RENT },
        { category_id: null },
        { category_id: CAT_FUN },
      ]),
    ).toEqual([CAT_RENT, CAT_FUN])
  })
})

describe('toPlannedLineAmounts', () => {
  it('adapta los importes del eje cuenta', () => {
    expect(toPlannedLineAmounts([{ planned_minor: 200_000 }, { planned_minor: 50_000 }])).toEqual([
      { plannedMinor: 200_000 },
      { plannedMinor: 50_000 },
    ])
  })

  it('omite una línea sin importe en vez de contarla como cero', () => {
    expect(toPlannedLineAmounts([{ planned_minor: null }, { planned_minor: 10_000 }])).toEqual([
      { plannedMinor: 10_000 },
    ])
  })
})

describe('toPlannedIncomeSources', () => {
  it('adapta las fuentes al contrato de sumPlannedIncome', () => {
    expect(toPlannedIncomeSources([{ planned_minor: 3_000_000 }])).toEqual([
      { plannedMinor: 3_000_000 },
    ])
  })
})

/* -------------------------------------------------------------------------- */
/* Adaptadores de movimientos                                                 */
/* -------------------------------------------------------------------------- */

describe('toPlanExpenseTransactions', () => {
  it('conserva los tres tipos reales y deja intacto el gasto del mes', () => {
    const rows = [
      { type: 'expense', category_id: CAT_RENT, amount_minor: 100_000 },
      { type: 'income', category_id: null, amount_minor: 500_000 },
      { type: 'transfer', category_id: null, amount_minor: 30_000 },
    ]
    const adapted = toPlanExpenseTransactions(rows)

    expect(adapted).toHaveLength(3)
    expect(sumActualExpenses(adapted)).toBe(100_000)
  })

  it('descarta un tipo desconocido, que no habría entrado en ninguna suma', () => {
    const adapted = toPlanExpenseTransactions([
      { type: 'expense', category_id: CAT_RENT, amount_minor: 100_000 },
      { type: 'refund', category_id: CAT_RENT, amount_minor: 7_000 },
    ])

    expect(adapted).toEqual([{ type: 'expense', category_id: CAT_RENT, amount_minor: 100_000 }])
  })
})

describe('toBalanceTransactions', () => {
  const balanceAccounts = [
    { id: ACC_SAVINGS, type: 'savings', initial_balance_minor: 1_000_000 },
    { id: ACC_BANK, type: 'checking', initial_balance_minor: 500_000 },
  ]

  it('estrecha tipo y dirección, y alimenta el saldo por tipo de cuenta', () => {
    const adapted = toBalanceTransactions([
      {
        type: 'transfer',
        transfer_direction: 'incoming',
        account_id: ACC_SAVINGS,
        amount_minor: 200_000,
      },
      {
        type: 'transfer',
        transfer_direction: 'outgoing',
        account_id: ACC_BANK,
        amount_minor: 200_000,
      },
      { type: 'expense', transfer_direction: null, account_id: ACC_SAVINGS, amount_minor: 50_000 },
    ])

    expect(calculateBalanceForAccountType(balanceAccounts, adapted, 'savings')).toBe(1_150_000)
  })

  it('descarta una transferencia sin dirección, que restaría del saldo en silencio', () => {
    const adapted = toBalanceTransactions([
      {
        type: 'transfer',
        transfer_direction: null,
        account_id: ACC_SAVINGS,
        amount_minor: 200_000,
      },
      {
        type: 'transfer',
        transfer_direction: 'lateral',
        account_id: ACC_SAVINGS,
        amount_minor: 300_000,
      },
    ])

    expect(adapted).toEqual([])
    expect(calculateBalanceForAccountType(balanceAccounts, adapted, 'savings')).toBe(1_000_000)
  })

  it('normaliza la dirección a null en ingresos y gastos', () => {
    const adapted = toBalanceTransactions([
      {
        type: 'income',
        transfer_direction: 'incoming',
        account_id: ACC_SAVINGS,
        amount_minor: 100_000,
      },
    ])

    expect(adapted).toEqual([
      {
        type: 'income',
        transfer_direction: null,
        account_id: ACC_SAVINGS,
        amount_minor: 100_000,
      },
    ])
  })

  it('descarta un tipo desconocido', () => {
    expect(
      toBalanceTransactions([
        { type: 'refund', transfer_direction: null, account_id: ACC_BANK, amount_minor: 1_000 },
      ]),
    ).toEqual([])
  })
})

/* -------------------------------------------------------------------------- */
/* Ingreso por fuente                                                         */
/* -------------------------------------------------------------------------- */

const SRC_SALARY = 'src-salary'
const SRC_FREELANCE = 'src-freelance'
const SRC_EMPTY = 'src-empty'

const CAT_SALARY = 'cat-salary'
const CAT_BONUS = 'cat-bonus'
const CAT_FREELANCE = 'cat-freelance'
const CAT_GIFT = 'cat-gift'

describe('buildIncomeActualBySource', () => {
  const links = [
    { plan_income_source_id: SRC_SALARY, category_id: CAT_SALARY },
    { plan_income_source_id: SRC_SALARY, category_id: CAT_BONUS },
    { plan_income_source_id: SRC_FREELANCE, category_id: CAT_FREELANCE },
  ]

  // Los tipos van `as const` para que estas mismas filas sirvan a la vez de
  // entrada del reparto por fuente y de `calculateMonthlyIncome`, que exige la
  // unión cerrada. Es lo que permite comprobar la invariante contra el total
  // real y no contra una copia de él.
  const transactions = [
    { type: 'income' as const, category_id: CAT_SALARY, amount_minor: 3_000_000 },
    { type: 'income' as const, category_id: CAT_BONUS, amount_minor: 200_000 },
    { type: 'income' as const, category_id: CAT_FREELANCE, amount_minor: 800_000 },
    { type: 'income' as const, category_id: CAT_GIFT, amount_minor: 50_000 },
    { type: 'income' as const, category_id: null, amount_minor: 10_000 },
    { type: 'expense' as const, category_id: CAT_SALARY, amount_minor: 70_000 },
    { type: 'transfer' as const, category_id: null, amount_minor: 400_000 },
  ]

  it('atribuye el ingreso a cada fuente por sus categorías', () => {
    const result = buildIncomeActualBySource(transactions, links, [
      SRC_SALARY,
      SRC_FREELANCE,
      SRC_EMPTY,
    ])

    expect(result.bySource[SRC_SALARY]).toBe(3_200_000)
    expect(result.bySource[SRC_FREELANCE]).toBe(800_000)
  })

  it('deja en cero una fuente sin categorías vinculadas', () => {
    const result = buildIncomeActualBySource(transactions, links, [SRC_SALARY, SRC_EMPTY])

    expect(result.bySource[SRC_EMPTY]).toBe(0)
  })

  it('no atribuye el ingreso sin categoría ni el de una categoría no vinculada', () => {
    const result = buildIncomeActualBySource(transactions, links, [SRC_SALARY, SRC_FREELANCE])

    // 50 000 de la categoría no vinculada + 10 000 sin categoría.
    expect(result.unattributedMinor).toBe(60_000)
  })

  it('ignora gastos y transferencias', () => {
    const result = buildIncomeActualBySource(
      [
        { type: 'expense', category_id: CAT_SALARY, amount_minor: 70_000 },
        { type: 'transfer', category_id: null, amount_minor: 400_000 },
      ],
      links,
      [SRC_SALARY],
    )

    expect(result.bySource[SRC_SALARY]).toBe(0)
    expect(result.unattributedMinor).toBe(0)
  })

  it('no adivina cuando una categoría alimenta dos fuentes: la deja sin atribuir y la reporta', () => {
    const ambiguousLinks = [
      ...links,
      { plan_income_source_id: SRC_FREELANCE, category_id: CAT_SALARY },
    ]
    const result = buildIncomeActualBySource(transactions, ambiguousLinks, [
      SRC_SALARY,
      SRC_FREELANCE,
    ])

    expect(result.ambiguousCategoryIds).toEqual([CAT_SALARY])
    expect(result.bySource[SRC_SALARY]).toBe(200_000)
    expect(result.bySource[SRC_FREELANCE]).toBe(800_000)
    // Los 3 000 000 del salario ambiguo se suman a los 60 000 sin vincular.
    expect(result.unattributedMinor).toBe(3_060_000)
  })

  it('no considera ambiguo un vínculo repetido hacia la misma fuente', () => {
    const repeated = [...links, { plan_income_source_id: SRC_SALARY, category_id: CAT_SALARY }]
    const result = buildIncomeActualBySource(transactions, repeated, [SRC_SALARY])

    expect(result.ambiguousCategoryIds).toEqual([])
    expect(result.bySource[SRC_SALARY]).toBe(3_200_000)
  })

  it('descarta un vínculo hacia una fuente que no es del mes', () => {
    const result = buildIncomeActualBySource(transactions, links, [SRC_SALARY])

    expect(result.bySource[SRC_FREELANCE]).toBeUndefined()
    // El ingreso de la fuente ajena queda sin atribuir, no desaparece.
    expect(result.unattributedMinor).toBe(860_000)
  })

  it('una categoría de gasto en el puente no aporta nada', () => {
    const result = buildIncomeActualBySource(
      [{ type: 'expense', category_id: CAT_RENT, amount_minor: 100_000 }],
      [{ plan_income_source_id: SRC_SALARY, category_id: CAT_RENT }],
      [SRC_SALARY],
    )

    expect(result.bySource[SRC_SALARY]).toBe(0)
  })

  it('cumple la invariante: la suma por fuente más lo no atribuido es el ingreso del mes', () => {
    const sourceIds = [SRC_SALARY, SRC_FREELANCE, SRC_EMPTY]
    const result = buildIncomeActualBySource(transactions, links, sourceIds)

    const attributed = sourceIds.reduce((sum, sourceId) => sum + result.bySource[sourceId], 0)

    expect(attributed + result.unattributedMinor).toBe(calculateMonthlyIncome(transactions))
  })

  it('mantiene la invariante también cuando hay categorías ambiguas', () => {
    const ambiguousLinks = [
      ...links,
      { plan_income_source_id: SRC_FREELANCE, category_id: CAT_SALARY },
    ]
    const sourceIds = [SRC_SALARY, SRC_FREELANCE]
    const result = buildIncomeActualBySource(transactions, ambiguousLinks, sourceIds)

    const attributed = sourceIds.reduce((sum, sourceId) => sum + result.bySource[sourceId], 0)

    expect(attributed + result.unattributedMinor).toBe(calculateMonthlyIncome(transactions))
  })
})
