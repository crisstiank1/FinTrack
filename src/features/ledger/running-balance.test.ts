import { describe, expect, it } from 'vitest'

import {
  buildDailyBalances,
  runningBalanceCurrency,
  type BalanceTransaction,
} from './running-balance'

const accounts = [
  { id: 'acc-1', currency_code: 'COP', initial_balance_minor: 100_000 },
  { id: 'acc-2', currency_code: 'COP', initial_balance_minor: 50_000 },
]

function tx(overrides: Partial<BalanceTransaction>): BalanceTransaction {
  return {
    type: 'expense',
    transfer_direction: null,
    account_id: 'acc-1',
    amount_minor: 0,
    transaction_date: '2026-09-10',
    ...overrides,
  }
}

describe('buildDailyBalances', () => {
  it('acumula el saldo día a día desde los saldos iniciales', () => {
    const balances = buildDailyBalances(accounts, [
      tx({ type: 'income', amount_minor: 200_000, transaction_date: '2026-09-05' }),
      tx({ amount_minor: 50_000, transaction_date: '2026-09-10' }),
      tx({ amount_minor: 20_000, transaction_date: '2026-09-15' }),
    ])

    expect(balances.get('2026-09-05')).toBe(350_000)
    expect(balances.get('2026-09-10')).toBe(300_000)
    expect(balances.get('2026-09-15')).toBe(280_000)
  })

  it('suma varios movimientos del mismo día en un solo saldo', () => {
    const balances = buildDailyBalances(accounts, [
      tx({ type: 'income', amount_minor: 80_000, transaction_date: '2026-09-05' }),
      tx({ amount_minor: 30_000, transaction_date: '2026-09-05' }),
    ])

    expect(balances.size).toBe(1)
    expect(balances.get('2026-09-05')).toBe(200_000)
  })

  it('no depende del orden en que lleguen los movimientos', () => {
    const chronological = buildDailyBalances(accounts, [
      tx({ type: 'income', amount_minor: 200_000, transaction_date: '2026-09-05' }),
      tx({ amount_minor: 50_000, transaction_date: '2026-09-10' }),
    ])
    const reversed = buildDailyBalances(accounts, [
      tx({ amount_minor: 50_000, transaction_date: '2026-09-10' }),
      tx({ type: 'income', amount_minor: 200_000, transaction_date: '2026-09-05' }),
    ])

    expect([...reversed.entries()]).toEqual([...chronological.entries()])
  })

  it('las transferencias entre cuentas propias no alteran el saldo consolidado', () => {
    const balances = buildDailyBalances(accounts, [
      tx({
        type: 'transfer',
        transfer_direction: 'outgoing',
        account_id: 'acc-1',
        amount_minor: 40_000,
        transaction_date: '2026-09-08',
      }),
      tx({
        type: 'transfer',
        transfer_direction: 'incoming',
        account_id: 'acc-2',
        amount_minor: 40_000,
        transaction_date: '2026-09-08',
      }),
    ])

    expect(balances.get('2026-09-08')).toBe(150_000)
  })

  it('limita el saldo a la cuenta indicada', () => {
    const balances = buildDailyBalances(
      accounts,
      [
        tx({ amount_minor: 30_000, account_id: 'acc-1', transaction_date: '2026-09-08' }),
        tx({
          type: 'transfer',
          transfer_direction: 'incoming',
          account_id: 'acc-2',
          amount_minor: 40_000,
          transaction_date: '2026-09-08',
        }),
      ],
      { accountId: 'acc-2' },
    )

    // Solo el saldo inicial de acc-2 más la transferencia recibida.
    expect(balances.get('2026-09-08')).toBe(90_000)
  })

  it('limita el saldo a las cuentas de la moneda indicada', () => {
    const withUsd = [...accounts, { id: 'usd-1', currency_code: 'USD', initial_balance_minor: 700 }]

    const balances = buildDailyBalances(
      withUsd,
      [
        tx({ amount_minor: 30_000, account_id: 'acc-1', transaction_date: '2026-09-08' }),
        tx({
          type: 'income',
          amount_minor: 200,
          account_id: 'usd-1',
          transaction_date: '2026-09-08',
        }),
        tx({ amount_minor: 100, account_id: 'usd-1', transaction_date: '2026-09-09' }),
      ],
      { currencyCode: 'USD' },
    )

    // Solo el saldo inicial de la cuenta USD y sus movimientos, sin los pesos.
    expect(balances.get('2026-09-08')).toBe(900)
    expect(balances.get('2026-09-09')).toBe(800)
  })

  it('devuelve un mapa vacío sin movimientos', () => {
    expect(buildDailyBalances(accounts, []).size).toBe(0)
  })
})

describe('runningBalanceCurrency', () => {
  const mixed = [
    { id: 'cop-1', currency_code: 'COP' },
    { id: 'cop-2', currency_code: 'COP' },
    { id: 'usd-1', currency_code: 'USD' },
  ]

  it('devuelve la moneda cuando todas las cuentas la comparten', () => {
    expect(runningBalanceCurrency(mixed.slice(0, 2))).toBe('COP')
  })

  it('devuelve null con cuentas en varias monedas y sin filtro de cuenta', () => {
    expect(runningBalanceCurrency(mixed)).toBeNull()
  })

  it('con una cuenta filtrada devuelve la moneda de esa cuenta', () => {
    expect(runningBalanceCurrency(mixed, { accountId: 'usd-1' })).toBe('USD')
  })

  it('con una moneda filtrada devuelve esa moneda aunque haya cuentas en otras', () => {
    expect(runningBalanceCurrency(mixed, { currencyCode: 'COP' })).toBe('COP')
  })

  it('devuelve null sin cuentas en el alcance', () => {
    expect(runningBalanceCurrency([])).toBeNull()
    expect(runningBalanceCurrency(mixed, { accountId: 'no-existe' })).toBeNull()
    expect(runningBalanceCurrency(mixed, { accountId: 'usd-1', currencyCode: 'COP' })).toBeNull()
  })
})
