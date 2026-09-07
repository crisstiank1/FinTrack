import { describe, expect, it } from 'vitest'

import {
  calculateAccountBalance,
  calculateConsolidatedBalance,
  calculateMonthlyExpense,
  calculateMonthlyIncome,
  calculateNetSavings,
  calculateSavingsRate,
  type TransactionForCalculation,
} from './calculations'

describe('calculateAccountBalance', () => {
  it('suma ingresos y resta gastos sobre el saldo inicial', () => {
    const transactions: TransactionForCalculation[] = [
      { type: 'income', transfer_direction: null, account_id: 'a1', amount_minor: 100000 },
      { type: 'expense', transfer_direction: null, account_id: 'a1', amount_minor: 30000 },
    ]

    expect(calculateAccountBalance(50000, transactions, 'a1')).toBe(120000)
  })

  it('suma transferencias entrantes y resta transferencias salientes', () => {
    const transactions: TransactionForCalculation[] = [
      { type: 'transfer', transfer_direction: 'incoming', account_id: 'a1', amount_minor: 20000 },
      { type: 'transfer', transfer_direction: 'outgoing', account_id: 'a1', amount_minor: 5000 },
    ]

    expect(calculateAccountBalance(0, transactions, 'a1')).toBe(15000)
  })

  it('ignora movimientos de otras cuentas', () => {
    const transactions: TransactionForCalculation[] = [
      { type: 'income', transfer_direction: null, account_id: 'otra-cuenta', amount_minor: 999999 },
    ]

    expect(calculateAccountBalance(1000, transactions, 'a1')).toBe(1000)
  })

  it('retorna el saldo inicial cuando no hay movimientos', () => {
    expect(calculateAccountBalance(75000, [], 'a1')).toBe(75000)
  })
})

describe('calculateConsolidatedBalance', () => {
  it('suma los saldos de todas las cuentas', () => {
    const accounts = [
      { id: 'a1', initial_balance_minor: 100000 },
      { id: 'a2', initial_balance_minor: 50000 },
    ]
    const transactions: TransactionForCalculation[] = [
      { type: 'income', transfer_direction: null, account_id: 'a1', amount_minor: 20000 },
      { type: 'expense', transfer_direction: null, account_id: 'a2', amount_minor: 10000 },
    ]

    expect(calculateConsolidatedBalance(accounts, transactions)).toBe(160000)
  })

  it('una transferencia entre cuentas propias no cambia el saldo consolidado', () => {
    const accounts = [
      { id: 'a1', initial_balance_minor: 100000 },
      { id: 'a2', initial_balance_minor: 50000 },
    ]
    const before = calculateConsolidatedBalance(accounts, [])

    const transferTransactions: TransactionForCalculation[] = [
      { type: 'transfer', transfer_direction: 'outgoing', account_id: 'a1', amount_minor: 30000 },
      { type: 'transfer', transfer_direction: 'incoming', account_id: 'a2', amount_minor: 30000 },
    ]
    const after = calculateConsolidatedBalance(accounts, transferTransactions)

    expect(after).toBe(before)
  })
})

describe('calculateMonthlyIncome / calculateMonthlyExpense', () => {
  const transactions: TransactionForCalculation[] = [
    { type: 'income', transfer_direction: null, account_id: 'a1', amount_minor: 100000 },
    { type: 'income', transfer_direction: null, account_id: 'a1', amount_minor: 50000 },
    { type: 'expense', transfer_direction: null, account_id: 'a1', amount_minor: 40000 },
    { type: 'transfer', transfer_direction: 'outgoing', account_id: 'a1', amount_minor: 999999 },
  ]

  it('suma solo los movimientos de tipo income', () => {
    expect(calculateMonthlyIncome(transactions)).toBe(150000)
  })

  it('suma solo los movimientos de tipo expense', () => {
    expect(calculateMonthlyExpense(transactions)).toBe(40000)
  })

  it('las transferencias no afectan ni ingresos ni gastos consolidados', () => {
    expect(calculateMonthlyIncome(transactions)).not.toBe(150000 + 999999)
    expect(calculateMonthlyExpense(transactions)).not.toBe(40000 + 999999)
  })
})

describe('calculateNetSavings', () => {
  it('resta gastos de ingresos', () => {
    expect(calculateNetSavings(100000, 40000)).toBe(60000)
  })

  it('puede ser negativo cuando los gastos superan los ingresos', () => {
    expect(calculateNetSavings(40000, 100000)).toBe(-60000)
  })
})

describe('calculateSavingsRate', () => {
  it('calcula el porcentaje de ahorro', () => {
    expect(calculateSavingsRate(100000, 40000)).toBe(60)
  })

  it('retorna null cuando los ingresos son cero, nunca NaN o Infinity', () => {
    const rate = calculateSavingsRate(0, 40000)
    expect(rate).toBeNull()
  })

  it('puede ser negativo cuando el gasto supera el ingreso', () => {
    expect(calculateSavingsRate(50000, 100000)).toBe(-100)
  })
})
