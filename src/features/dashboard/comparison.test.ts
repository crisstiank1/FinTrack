import { describe, expect, it } from 'vitest'

import { getCategoryDelta } from './comparison'
import type { DashboardAccount, DashboardCategory, DashboardTransaction } from './summary'

const MONTH = '2026-09'
const PREVIOUS = '2026-08'

const accounts: DashboardAccount[] = [
  { id: 'acc-cop', name: 'Efectivo', currency_code: 'COP', initial_balance_minor: 0 },
  { id: 'acc-cop-2', name: 'Ahorros', currency_code: 'COP', initial_balance_minor: 0 },
  { id: 'acc-usd', name: 'Cuenta USD', currency_code: 'USD', initial_balance_minor: 0 },
]

const categories: DashboardCategory[] = [
  { id: 'cat-food', name: 'Alimentación', type: 'expense', color: null, icon: null },
  { id: 'cat-transport', name: 'Transporte', type: 'expense', color: null, icon: null },
  { id: 'cat-fun', name: 'Entretenimiento', type: 'expense', color: null, icon: null },
  { id: 'cat-salary', name: 'Salario', type: 'income', color: null, icon: null },
]

function transaction(overrides: Partial<DashboardTransaction>): DashboardTransaction {
  return {
    id: crypto.randomUUID(),
    type: 'expense',
    transfer_direction: null,
    account_id: 'acc-cop',
    category_id: 'cat-food',
    amount_minor: 0,
    transaction_date: `${MONTH}-10`,
    description: 'Movimiento',
    ...overrides,
  }
}

function deltaOf(result: ReturnType<typeof getCategoryDelta>, categoryId: string) {
  const found = result.find((row) => row.categoryId === categoryId)
  if (!found) throw new Error(`No se encontró la categoría ${categoryId}`)
  return found
}

describe('getCategoryDelta', () => {
  it('calcula el aumento de una categoría entre dos meses', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [
        transaction({ amount_minor: 100_000, transaction_date: `${PREVIOUS}-05` }),
        transaction({ amount_minor: 150_000, transaction_date: `${MONTH}-05` }),
      ],
    })

    expect(deltaOf(result, 'cat-food')).toMatchObject({
      categoryName: 'Alimentación',
      currentAmount: 150_000,
      previousAmount: 100_000,
      differenceAmount: 50_000,
      differencePercent: 50,
      currentTransactionCount: 1,
      previousTransactionCount: 1,
    })
  })

  it('calcula la reducción con diferencia y porcentaje negativos', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [
        transaction({ amount_minor: 200_000, transaction_date: `${PREVIOUS}-05` }),
        transaction({ amount_minor: 150_000, transaction_date: `${MONTH}-05` }),
      ],
    })

    expect(deltaOf(result, 'cat-food')).toMatchObject({
      differenceAmount: -50_000,
      differencePercent: -25,
    })
  })

  it('incluye una categoría nueva, con 0 en el mes anterior', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [
        transaction({ amount_minor: 100_000, transaction_date: `${PREVIOUS}-05` }),
        transaction({
          category_id: 'cat-transport',
          amount_minor: 80_000,
          transaction_date: `${MONTH}-05`,
        }),
      ],
    })

    expect(deltaOf(result, 'cat-transport')).toMatchObject({
      currentAmount: 80_000,
      previousAmount: 0,
      differenceAmount: 80_000,
      previousTransactionCount: 0,
    })
  })

  it('incluye una categoría que desapareció, con 0 en el mes actual', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [
        transaction({
          category_id: 'cat-fun',
          amount_minor: 60_000,
          transaction_date: `${PREVIOUS}-05`,
        }),
        transaction({ amount_minor: 100_000, transaction_date: `${MONTH}-05` }),
      ],
    })

    expect(deltaOf(result, 'cat-fun')).toMatchObject({
      currentAmount: 0,
      previousAmount: 60_000,
      differenceAmount: -60_000,
      differencePercent: -100,
      currentTransactionCount: 0,
    })
  })

  it('devuelve null en el porcentaje cuando el mes anterior fue cero, nunca Infinity ni NaN', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [
        transaction({
          category_id: 'cat-transport',
          amount_minor: 80_000,
          transaction_date: `${MONTH}-05`,
        }),
      ],
    })

    const transport = deltaOf(result, 'cat-transport')
    expect(transport.differencePercent).toBeNull()
    expect(Number.isFinite(transport.differenceAmount)).toBe(true)
  })

  it('ordena de mayor aumento a mayor reducción', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [
        // Alimentación baja 50.000.
        transaction({ amount_minor: 200_000, transaction_date: `${PREVIOUS}-05` }),
        transaction({ amount_minor: 150_000, transaction_date: `${MONTH}-05` }),
        // Transporte sube 80.000.
        transaction({
          category_id: 'cat-transport',
          amount_minor: 80_000,
          transaction_date: `${MONTH}-06`,
        }),
        // Entretenimiento baja 60.000.
        transaction({
          category_id: 'cat-fun',
          amount_minor: 60_000,
          transaction_date: `${PREVIOUS}-06`,
        }),
      ],
    })

    expect(result.map((row) => row.categoryId)).toEqual(['cat-transport', 'cat-food', 'cat-fun'])
  })

  it('excluye las transferencias de los dos meses', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [
        transaction({ amount_minor: 100_000, transaction_date: `${PREVIOUS}-05` }),
        transaction({ amount_minor: 100_000, transaction_date: `${MONTH}-05` }),
        transaction({
          type: 'transfer',
          transfer_direction: 'outgoing',
          category_id: null,
          amount_minor: 500_000,
          transaction_date: `${MONTH}-07`,
        }),
        transaction({
          type: 'transfer',
          transfer_direction: 'incoming',
          category_id: null,
          account_id: 'acc-cop-2',
          amount_minor: 500_000,
          transaction_date: `${MONTH}-07`,
        }),
      ],
    })

    expect(deltaOf(result, 'cat-food').differenceAmount).toBe(0)
    expect(result).toHaveLength(1)
  })

  it('excluye los ingresos', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [
        transaction({ amount_minor: 100_000, transaction_date: `${MONTH}-05` }),
        transaction({
          type: 'income',
          category_id: 'cat-salary',
          amount_minor: 3_000_000,
          transaction_date: `${MONTH}-01`,
        }),
      ],
    })

    expect(result.map((row) => row.categoryId)).toEqual(['cat-food'])
  })

  it('solo compara la moneda indicada: no mezcla COP con USD', () => {
    const transactions = [
      transaction({ amount_minor: 100_000, transaction_date: `${PREVIOUS}-05` }),
      transaction({ amount_minor: 150_000, transaction_date: `${MONTH}-05` }),
      transaction({ account_id: 'acc-usd', amount_minor: 40, transaction_date: `${MONTH}-06` }),
    ]

    const inCop = getCategoryDelta({
      accounts,
      categories,
      transactions,
      monthKey: MONTH,
      currencyCode: 'COP',
    })
    const inUsd = getCategoryDelta({
      accounts,
      categories,
      transactions,
      monthKey: MONTH,
      currencyCode: 'USD',
    })

    expect(deltaOf(inCop, 'cat-food').currentAmount).toBe(150_000)
    expect(deltaOf(inUsd, 'cat-food').currentAmount).toBe(40)
    expect(deltaOf(inUsd, 'cat-food').previousAmount).toBe(0)
  })

  it('conserva los importes como enteros, sin dividir entre 100', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [transaction({ amount_minor: 15_000, transaction_date: `${MONTH}-05` })],
    })

    expect(deltaOf(result, 'cat-food').currentAmount).toBe(15_000)
    expect(Number.isInteger(deltaOf(result, 'cat-food').currentAmount)).toBe(true)
  })

  it('agrupa el gasto sin categoría bajo "Sin categoría"', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [
        transaction({ category_id: null, amount_minor: 30_000, transaction_date: `${MONTH}-05` }),
        transaction({ category_id: null, amount_minor: 20_000, transaction_date: `${MONTH}-06` }),
      ],
    })

    expect(deltaOf(result, 'uncategorized')).toMatchObject({
      categoryName: 'Sin categoría',
      currentAmount: 50_000,
      currentTransactionCount: 2,
    })
  })

  it('compara contra el mes anterior por defecto y admite otro mes explícito', () => {
    const transactions = [
      transaction({ amount_minor: 10_000, transaction_date: '2026-07-05' }),
      transaction({ amount_minor: 100_000, transaction_date: `${PREVIOUS}-05` }),
      transaction({ amount_minor: 150_000, transaction_date: `${MONTH}-05` }),
    ]

    const againstAugust = getCategoryDelta({ accounts, categories, transactions, monthKey: MONTH })
    const againstJuly = getCategoryDelta({
      accounts,
      categories,
      transactions,
      monthKey: MONTH,
      comparedToMonthKey: '2026-07',
    })

    expect(deltaOf(againstAugust, 'cat-food').previousAmount).toBe(100_000)
    expect(deltaOf(againstJuly, 'cat-food').previousAmount).toBe(10_000)
  })

  it('acota a la cuenta indicada', () => {
    const result = getCategoryDelta({
      accounts,
      categories,
      monthKey: MONTH,
      accountId: 'acc-cop',
      transactions: [
        transaction({ amount_minor: 100_000, transaction_date: `${MONTH}-05` }),
        transaction({
          account_id: 'acc-cop-2',
          amount_minor: 70_000,
          transaction_date: `${MONTH}-06`,
        }),
      ],
    })

    expect(deltaOf(result, 'cat-food').currentAmount).toBe(100_000)
  })

  it('añade el grupo de reparto solo cuando quien llama aporta las clasificaciones', () => {
    const scope = {
      accounts,
      categories,
      monthKey: MONTH,
      transactions: [transaction({ amount_minor: 100_000, transaction_date: `${MONTH}-05` })],
    }

    expect(deltaOf(getCategoryDelta(scope), 'cat-food')).not.toHaveProperty('budgetGroup')
    expect(
      deltaOf(
        getCategoryDelta({
          ...scope,
          classifications: [{ category_id: 'cat-food', budget_group: 'needs' }],
        }),
        'cat-food',
      ).budgetGroup,
    ).toBe('needs')
  })

  it('devuelve una lista vacía cuando ninguno de los dos meses tuvo gastos', () => {
    expect(
      getCategoryDelta({
        accounts,
        categories,
        monthKey: MONTH,
        transactions: [transaction({ amount_minor: 100_000, transaction_date: '2026-05-05' })],
      }),
    ).toEqual([])
  })
})
