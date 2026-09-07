import { describe, expect, it } from 'vitest'

import {
  buildCategoryBreakdown,
  buildDashboardSummary,
  buildMonthlyTrend,
  buildRecentTransactions,
  type DashboardAccount,
  type DashboardCategory,
  type DashboardTransaction,
} from './summary'

const MONTH = '2026-09'

const accounts: DashboardAccount[] = [
  { id: 'acc-1', name: 'Efectivo', currency_code: 'COP', initial_balance_minor: 100_000 },
  { id: 'acc-2', name: 'Ahorros', currency_code: 'COP', initial_balance_minor: 50_000 },
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

    const slices = buildCategoryBreakdown({ accounts, transactions: many, monthKey: MONTH, categories })

    expect(slices).toHaveLength(5)
    expect(slices[slices.length - 1].name).toBe('Otras categorías')
    // Las 4 categorías sobrantes: 4.000 + 3.000 + 2.000 + 1.000.
    expect(slices[slices.length - 1].amountMinor).toBe(10_000)
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

describe('buildRecentTransactions', () => {
  it('devuelve los movimientos del mes, del más reciente al más antiguo', () => {
    const recent = buildRecentTransactions(scope, 3)

    expect(recent).toHaveLength(3)
    expect(recent[0].transaction_date).toBe('2026-09-20')
    expect(recent[recent.length - 1].transaction_date).toBe('2026-09-12')
  })

  it('no incluye movimientos de otros meses', () => {
    const recent = buildRecentTransactions(scope, 10)

    expect(recent).toHaveLength(5)
    expect(recent.every((item) => item.transaction_date.startsWith(MONTH))).toBe(true)
  })
})
