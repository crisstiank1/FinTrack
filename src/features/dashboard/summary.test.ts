import { describe, expect, it } from 'vitest'

import { SWATCHES } from '@/lib/palette'

import {
  buildBalancePillars,
  buildCategoryBreakdown,
  buildCurrencyBalances,
  buildDashboardSummary,
  buildMonthlyTrend,
  hasBudgetThisMonth,
  type DashboardAccount,
  type DashboardCategory,
  type DashboardTransaction,
} from './summary'

const MONTH = '2026-09'

const accounts: DashboardAccount[] = [
  {
    id: 'acc-1',
    name: 'Efectivo',
    type: 'cash',
    currency_code: 'COP',
    initial_balance_minor: 100_000,
  },
  {
    id: 'acc-2',
    name: 'Ahorros',
    type: 'savings',
    currency_code: 'COP',
    initial_balance_minor: 50_000,
  },
]

const categories: DashboardCategory[] = [
  { id: 'cat-salary', name: 'Salario', type: 'income', color: '#0F0', icon: 'briefcase' },
  { id: 'cat-food', name: 'Alimentación', type: 'expense', color: '#F00', icon: 'coffee' },
  { id: 'cat-fun', name: 'Entretenimiento', type: 'expense', color: '#00F', icon: 'clapperboard' },
]

function transaction(overrides: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: crypto.randomUUID(),
    type: 'expense',
    transfer_direction: null,
    account_id: 'acc-1',
    category_id: 'cat-food',
    amount_minor: 0,
    transaction_date: `${MONTH}-10`,
    description: 'Movimiento',
    ...overrides,
  }
}

const transactions: DashboardTransaction[] = [
  // Mes anterior (agosto): ingresos 200.000, gastos 100.000.
  transaction({
    type: 'income',
    category_id: 'cat-salary',
    amount_minor: 200_000,
    transaction_date: '2026-08-10',
    description: 'Salario agosto',
  }),
  transaction({ amount_minor: 100_000, transaction_date: '2026-08-15' }),

  // Mes en pantalla (septiembre): ingresos 300.000, gastos 150.000.
  transaction({
    type: 'income',
    category_id: 'cat-salary',
    amount_minor: 300_000,
    transaction_date: '2026-09-05',
    description: 'Salario septiembre',
  }),
  transaction({ amount_minor: 120_000, transaction_date: '2026-09-10' }),
  transaction({
    account_id: 'acc-2',
    category_id: 'cat-fun',
    amount_minor: 30_000,
    transaction_date: '2026-09-12',
  }),

  // Transferencia de acc-1 a acc-2: dos filas vinculadas.
  transaction({
    type: 'transfer',
    transfer_direction: 'outgoing',
    category_id: null,
    account_id: 'acc-1',
    amount_minor: 50_000,
    transaction_date: '2026-09-20',
    description: 'Ahorro mensual',
  }),
  transaction({
    type: 'transfer',
    transfer_direction: 'incoming',
    category_id: null,
    account_id: 'acc-2',
    amount_minor: 50_000,
    transaction_date: '2026-09-20',
    description: 'Ahorro mensual',
  }),
]

const scope = { accounts, transactions, monthKey: MONTH }

/**
 * Mismo usuario con una cuenta en USD y otra en ARS además de las dos en COP.
 * Sus movimientos usan cifras muy distintas para que una mezcla se note.
 */
const mixedAccounts: DashboardAccount[] = [
  ...accounts,
  {
    id: 'usd-1',
    name: 'Cuenta USD',
    type: 'checking',
    currency_code: 'USD',
    initial_balance_minor: 1_000,
  },
  {
    id: 'ars-1',
    name: 'Cuenta ARS',
    type: 'digital_wallet',
    currency_code: 'ARS',
    initial_balance_minor: 0,
  },
]

const mixedTransactions: DashboardTransaction[] = [
  ...transactions,
  transaction({
    type: 'income',
    account_id: 'usd-1',
    category_id: 'cat-salary',
    amount_minor: 500,
    transaction_date: '2026-09-07',
  }),
  transaction({
    account_id: 'usd-1',
    category_id: 'cat-fun',
    amount_minor: 200,
    transaction_date: '2026-09-08',
  }),
  transaction({
    account_id: 'ars-1',
    category_id: 'cat-food',
    amount_minor: 9_000,
    transaction_date: '2026-09-09',
  }),
]

const mixedScope = { accounts: mixedAccounts, transactions: mixedTransactions, monthKey: MONTH }

describe('buildDashboardSummary', () => {
  it('calcula los KPIs del mes seleccionado', () => {
    const summary = buildDashboardSummary(scope)

    expect(summary.income.currentMinor).toBe(300_000)
    expect(summary.expense.currentMinor).toBe(150_000)
    expect(summary.netSavings.currentMinor).toBe(150_000)
    expect(summary.savingsRate.current).toBe(50)
    expect(summary.monthTransactionCount).toBe(5)
  })

  it('calcula el saldo consolidado al cierre del mes, sin que las transferencias lo alteren', () => {
    const summary = buildDashboardSummary(scope)

    // 150.000 de saldos iniciales + 500.000 de ingresos - 250.000 de gastos.
    // La transferencia mueve 50.000 entre cuentas propias y se cancela sola.
    expect(summary.balance.currentMinor).toBe(400_000)
  })

  it('compara contra el mes anterior', () => {
    const summary = buildDashboardSummary(scope)

    expect(summary.income.previousMinor).toBe(200_000)
    expect(summary.expense.previousMinor).toBe(100_000)
    expect(summary.income.deltaPercent).toBe(50)
    expect(summary.expense.deltaPercent).toBe(50)
    // Ahorró la mitad de sus ingresos en ambos meses: sin cambio en puntos.
    expect(summary.savingsRate.deltaPoints).toBe(0)
    // El saldo pasó de 250.000 a 400.000.
    expect(summary.balance.previousMinor).toBe(250_000)
    expect(summary.balance.deltaPercent).toBe(60)
  })

  it('devuelve null en la variación cuando el mes anterior no tiene base', () => {
    const summary = buildDashboardSummary({ ...scope, monthKey: '2026-08' })

    expect(summary.income.previousMinor).toBe(0)
    expect(summary.income.deltaPercent).toBeNull()
  })

  it('devuelve null en la tasa de ahorro cuando no hubo ingresos', () => {
    const summary = buildDashboardSummary({
      accounts,
      transactions: [transaction({ amount_minor: 40_000, transaction_date: '2026-09-03' })],
      monthKey: MONTH,
    })

    expect(summary.savingsRate.current).toBeNull()
    expect(summary.savingsRate.deltaPoints).toBeNull()
  })

  it('limita todos los cálculos a la cuenta seleccionada', () => {
    const summary = buildDashboardSummary({ ...scope, accountId: 'acc-2' })

    // acc-2: 50.000 iniciales - 30.000 de gasto + 50.000 recibidos por transferencia.
    expect(summary.balance.currentMinor).toBe(70_000)
    expect(summary.income.currentMinor).toBe(0)
    expect(summary.expense.currentMinor).toBe(30_000)
    expect(summary.netSavings.currentMinor).toBe(-30_000)
  })

  it('mantiene el signo de la variación cuando la base es negativa', () => {
    // Agosto cierra con -50.000 de ahorro neto y septiembre con -10.000: mejora.
    const summary = buildDashboardSummary({
      accounts,
      transactions: [
        transaction({ amount_minor: 50_000, transaction_date: '2026-08-05' }),
        transaction({ amount_minor: 10_000, transaction_date: '2026-09-05' }),
      ],
      monthKey: MONTH,
    })

    expect(summary.netSavings.previousMinor).toBe(-50_000)
    expect(summary.netSavings.currentMinor).toBe(-10_000)
    expect(summary.netSavings.deltaPercent).toBe(80)
  })
})

describe('buildDashboardSummary con varias monedas', () => {
  it('limita los KPIs a las cuentas de la moneda indicada', () => {
    const summary = buildDashboardSummary({ ...mixedScope, currencyCode: 'COP' })

    // Mismas cifras que el escenario solo en COP: USD y ARS no se suman.
    expect(summary.balance.currentMinor).toBe(400_000)
    expect(summary.income.currentMinor).toBe(300_000)
    expect(summary.expense.currentMinor).toBe(150_000)
    expect(summary.monthTransactionCount).toBe(5)
  })

  it('calcula otra moneda con sus propias cuentas', () => {
    const summary = buildDashboardSummary({ ...mixedScope, currencyCode: 'USD' })

    // 1.000 iniciales + 500 de ingreso - 200 de gasto.
    expect(summary.balance.currentMinor).toBe(1_300)
    expect(summary.income.currentMinor).toBe(500)
    expect(summary.expense.currentMinor).toBe(200)
    expect(summary.savingsRate.current).toBe(60)
  })

  it('sin moneda indicada conserva el comportamiento anterior', () => {
    const summary = buildDashboardSummary(mixedScope)

    expect(summary.expense.currentMinor).toBe(150_000 + 200 + 9_000)
  })

  it('combina el filtro de cuenta con el de moneda', () => {
    const summary = buildDashboardSummary({
      ...mixedScope,
      accountId: 'acc-2',
      currencyCode: 'COP',
    })

    expect(summary.balance.currentMinor).toBe(70_000)
  })
})

describe('buildCategoryBreakdown', () => {
  it('reparte el gasto del mes por categoría, de mayor a menor', () => {
    const slices = buildCategoryBreakdown({ ...scope, categories })

    expect(slices).toHaveLength(2)
    expect(slices[0]).toMatchObject({ name: 'Alimentación', amountMinor: 120_000, share: 0.8 })
    expect(slices[1]).toMatchObject({ name: 'Entretenimiento', amountMinor: 30_000, share: 0.2 })
  })

  it('excluye ingresos y transferencias', () => {
    const total = buildCategoryBreakdown({ ...scope, categories }).reduce(
      (sum, slice) => sum + slice.amountMinor,
      0,
    )

    expect(total).toBe(150_000)
  })

  it('agrupa la cola en "Otras categorías" cuando hay más porciones de las que caben', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      transaction({
        category_id: `cat-${index}`,
        amount_minor: (8 - index) * 1_000,
        transaction_date: `${MONTH}-0${(index % 9) + 1}`,
      }),
    )

    const slices = buildCategoryBreakdown({
      accounts,
      transactions: many,
      monthKey: MONTH,
      categories,
    })

    expect(slices).toHaveLength(5)
    expect(slices[slices.length - 1].name).toBe('Otras categorías')
    // Las 4 categorías sobrantes: 4.000 + 3.000 + 2.000 + 1.000.
    expect(slices[slices.length - 1].amountMinor).toBe(10_000)
  })

  it('solo reparte el gasto de la moneda indicada', () => {
    const slices = buildCategoryBreakdown({ ...mixedScope, currencyCode: 'COP', categories })

    expect(slices.map((slice) => slice.amountMinor)).toEqual([120_000, 30_000])
  })

  it('da a las categorías sin color propio uno de la paleta según su posición', () => {
    const colorless: DashboardCategory[] = categories.map((category) => ({
      ...category,
      color: null,
    }))

    const slices = buildCategoryBreakdown({ ...scope, categories: colorless })

    expect(slices.map((slice) => slice.color)).toEqual([SWATCHES[0], SWATCHES[1]])
  })

  it('respeta el color propio de la categoría cuando lo tiene', () => {
    const slices = buildCategoryBreakdown({ ...scope, categories })

    expect(slices.map((slice) => slice.color)).toEqual(['#F00', '#00F'])
  })

  it('devuelve una lista vacía cuando el mes no tuvo gastos', () => {
    expect(buildCategoryBreakdown({ ...scope, monthKey: '2026-07', categories })).toEqual([])
  })
})

describe('buildMonthlyTrend', () => {
  it('devuelve una serie que termina en el mes seleccionado', () => {
    const trend = buildMonthlyTrend(scope, 6)

    expect(trend).toHaveLength(6)
    expect(trend[0].monthKey).toBe('2026-04')
    expect(trend[trend.length - 1].monthKey).toBe(MONTH)
  })

  it('acumula el saldo de cierre mes a mes', () => {
    const trend = buildMonthlyTrend(scope, 3)
    const [july, august, september] = trend

    expect(july.balanceMinor).toBe(150_000)
    expect(august.balanceMinor).toBe(250_000)
    expect(september.balanceMinor).toBe(400_000)
    expect(september.incomeMinor).toBe(300_000)
    expect(september.expenseMinor).toBe(150_000)
  })
})

describe('buildMonthlyTrend con varias monedas', () => {
  it('acumula solo el saldo y los flujos de la moneda indicada', () => {
    const [, august, september] = buildMonthlyTrend({ ...mixedScope, currencyCode: 'COP' }, 3)

    expect(august.balanceMinor).toBe(250_000)
    expect(september.balanceMinor).toBe(400_000)
    expect(september.expenseMinor).toBe(150_000)
  })
})

describe('buildCurrencyBalances', () => {
  it('devuelve el saldo de cada moneda con la principal primero', () => {
    expect(buildCurrencyBalances(mixedScope, 'USD')).toEqual([
      { currencyCode: 'USD', balanceMinor: 1_300 },
      { currencyCode: 'COP', balanceMinor: 400_000 },
      { currencyCode: 'ARS', balanceMinor: -9_000 },
    ])
  })

  it('calcula el saldo al cierre del mes seleccionado', () => {
    expect(buildCurrencyBalances({ ...mixedScope, monthKey: '2026-08' }, 'COP')).toEqual([
      { currencyCode: 'COP', balanceMinor: 250_000 },
      { currencyCode: 'USD', balanceMinor: 1_000 },
      { currencyCode: 'ARS', balanceMinor: 0 },
    ])
  })

  it('con una cuenta elegida solo devuelve su moneda', () => {
    expect(buildCurrencyBalances({ ...mixedScope, accountId: 'usd-1' }, 'COP')).toEqual([
      { currencyCode: 'USD', balanceMinor: 1_300 },
    ])
  })

  it('con una sola moneda devuelve una sola entrada', () => {
    expect(buildCurrencyBalances(scope, 'COP')).toEqual([
      { currencyCode: 'COP', balanceMinor: 400_000 },
    ])
  })
})

describe('buildBalancePillars', () => {
  it('sin tarjetas, todo es dinero disponible y la deuda es cero', () => {
    expect(buildBalancePillars(scope, 'COP')).toEqual([
      {
        currencyCode: 'COP',
        liquidMinor: 400_000,
        debtMinor: 0,
        netMinor: 400_000,
        previousLiquidMinor: 250_000,
        previousDebtMinor: 0,
        previousNetMinor: 250_000,
      },
    ])
  })

  it('un gasto con tarjeta engorda la deuda sin tocar el dinero disponible', () => {
    const cardAccounts: DashboardAccount[] = [
      ...accounts,
      {
        id: 'card-1',
        name: 'Visa',
        type: 'credit_card',
        currency_code: 'COP',
        initial_balance_minor: 0,
      },
    ]
    const pillars = buildBalancePillars({
      accounts: cardAccounts,
      transactions: [
        ...transactions,
        transaction({
          account_id: 'card-1',
          category_id: 'cat-fun',
          amount_minor: 80_000,
          transaction_date: '2026-09-25',
        }),
      ],
      monthKey: MONTH,
    })

    // Líquido intacto (400.000 como sin la tarjeta) y deuda de -80.000.
    expect(pillars).toHaveLength(1)
    expect(pillars[0].liquidMinor).toBe(400_000)
    expect(pillars[0].debtMinor).toBe(-80_000)
    expect(pillars[0].netMinor).toBe(320_000)
  })

  it('separa el líquido y la deuda por moneda, sin mezclar', () => {
    const cardUsd: DashboardAccount = {
      id: 'card-usd',
      name: 'Visa USD',
      type: 'credit_card',
      currency_code: 'USD',
      initial_balance_minor: 0,
    }
    const pillars = buildBalancePillars(
      {
        accounts: [...mixedAccounts, cardUsd],
        transactions: [
          ...mixedTransactions,
          transaction({
            account_id: 'card-usd',
            category_id: 'cat-food',
            amount_minor: 300,
            transaction_date: '2026-09-26',
          }),
        ],
        monthKey: MONTH,
      },
      'COP',
    )

    const cop = pillars.find((pillar) => pillar.currencyCode === 'COP')!
    const usd = pillars.find((pillar) => pillar.currencyCode === 'USD')!
    expect(cop.liquidMinor).toBe(400_000)
    expect(cop.debtMinor).toBe(0)
    // Líquido USD: 1.000 + 500 - 200. Deuda USD: -300.
    expect(usd.liquidMinor).toBe(1_300)
    expect(usd.debtMinor).toBe(-300)
    expect(usd.netMinor).toBe(1_000)
  })

  it('limita el desglose a la cuenta elegida', () => {
    const [pillar] = buildBalancePillars({ ...scope, accountId: 'acc-2' }, 'COP')

    // acc-2: 50.000 iniciales - 30.000 de gasto + 50.000 recibidos por transferencia.
    expect(pillar.liquidMinor).toBe(70_000)
    expect(pillar.debtMinor).toBe(0)
  })
})

describe('hasBudgetThisMonth', () => {
  it('cuenta como asignado cualquier presupuesto resuelto, también el de 0', () => {
    expect(hasBudgetThisMonth({ source: 'template' })).toBe(true)
    expect(hasBudgetThisMonth({ source: 'exception' })).toBe(true)
  })

  it('sin nada que resuelva el mes no hay presupuesto', () => {
    expect(hasBudgetThisMonth({ source: null })).toBe(false)
  })
})
