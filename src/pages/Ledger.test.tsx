import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Ledger from './Ledger'
import type { Tables } from '@/types/database.types'

const useLedgerPage = vi.fn()
const useLedgerTotals = vi.fn()
const fetchLedgerForExport = vi.fn()
const downloadCsv = vi.fn()
const useAccounts = vi.fn()
const usePrimaryCurrency = vi.fn()

vi.mock('@/features/ledger/hooks', () => ({
  useLedgerPage: (...args: unknown[]) => useLedgerPage(...args),
  useLedgerTotals: (...args: unknown[]) => useLedgerTotals(...args),
}))

vi.mock('@/features/ledger/api', async () => {
  const actual =
    await vi.importActual<typeof import('@/features/ledger/api')>('@/features/ledger/api')
  return { ...actual, fetchLedgerForExport: (...args: unknown[]) => fetchLedgerForExport(...args) }
})

vi.mock('@/lib/csv', async () => {
  const actual = await vi.importActual<typeof import('@/lib/csv')>('@/lib/csv')
  return { ...actual, downloadCsv: (...args: unknown[]) => downloadCsv(...args) }
})

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

const accounts = [
  { id: 'acc-1', name: 'Bancolombia', currency_code: 'COP', is_archived: false },
  { id: 'acc-2', name: 'Ahorros', currency_code: 'COP', is_archived: false },
] as Tables<'accounts'>[]

const categories = [
  { id: 'cat-1', name: 'Alimentación', type: 'expense', is_archived: false },
  { id: 'cat-2', name: 'Salario', type: 'income', is_archived: false },
] as Tables<'categories'>[]

vi.mock('@/features/accounts/hooks', () => ({ useAccounts: () => useAccounts() }))
vi.mock('@/features/profile/hooks', () => ({ usePrimaryCurrency: () => usePrimaryCurrency() }))
vi.mock('@/features/categories/hooks', () => ({ useCategories: () => ({ data: categories }) }))
vi.mock('@/features/dashboard/hooks', () => ({ useAllTransactions: () => ({ data: [] }) }))
vi.mock('@/features/transactions/hooks', () => ({
  useUpdateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDuplicateTransaction: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function tx(overrides: Partial<Tables<'transactions'>>): Tables<'transactions'> {
  return {
    id: 't1',
    user_id: 'user-1',
    account_id: 'acc-1',
    category_id: 'cat-1',
    type: 'expense',
    transfer_direction: null,
    transfer_group_id: null,
    amount_minor: 50_000,
    transaction_date: '2026-09-10',
    description: 'Mercado del mes',
    notes: null,
    is_reconciled: false,
    custom_fields: {},
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

const rows = [
  tx({}),
  tx({
    id: 't2',
    type: 'income',
    category_id: 'cat-2',
    amount_minor: 300_000,
    description: 'Salario',
  }),
]

/** Argumentos con los que la página pidió la última página de datos. */
function lastPageCall() {
  const calls = useLedgerPage.mock.calls
  return calls[calls.length - 1]
}

/** Textos de las opciones de un selector, en orden. */
function optionLabels(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '')
}

/** Líneas de una cifra del resumen («Ingresos», «Balance»...), una por moneda. */
function summaryLines(label: string): string[] {
  const term = [...document.querySelectorAll('dt')].find((dt) => dt.textContent === label)
  const value = term?.nextElementSibling
  if (!value) throw new Error(`No hay cifra «${label}» en el resumen`)
  return value.children.length > 0
    ? [...value.children].map((line) => line.textContent ?? '')
    : [value.textContent ?? '']
}

function renderLedger() {
  return render(<Ledger />)
}

const usdAccount = {
  id: 'acc-usd',
  name: 'Cuenta USD',
  currency_code: 'USD',
  is_archived: false,
} as Tables<'accounts'>

beforeEach(() => {
  vi.clearAllMocks()
  useAccounts.mockReturnValue({ data: accounts })
  usePrimaryCurrency.mockReturnValue({ data: 'COP', isPending: false })
  useLedgerPage.mockReturnValue({
    data: { rows, totalCount: 120 },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  })
  useLedgerTotals.mockReturnValue({
    data: {
      byAccount: [
        { type: 'income', accountId: 'acc-1', totalMinor: 200_000 },
        { type: 'income', accountId: 'acc-2', totalMinor: 100_000 },
        { type: 'expense', accountId: 'acc-1', totalMinor: 50_000 },
      ],
      count: 120,
    },
    isError: false,
  })
})

describe('Ledger', () => {
  it('muestra los movimientos de la página', () => {
    renderLedger()

    expect(screen.getAllByText('Mercado del mes').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Salario').length).toBeGreaterThan(0)
  })

  it('muestra el resumen del conjunto filtrado, no solo de la página', () => {
    renderLedger()

    // La página trae 2 filas, pero el resumen refleje las 120 que cumplen los filtros.
    // Con una sola moneda, las sumas de varias cuentas van en una sola cifra.
    expect(screen.getByText('COP 300.000')).toBeInTheDocument()
    expect(screen.getByText('COP 250.000')).toBeInTheDocument()
    expect(screen.getByText('120')).toBeInTheDocument()
  })

  it('pide al servidor los filtros de cuenta, tipo y fechas', async () => {
    const user = userEvent.setup()
    renderLedger()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cuenta' }), 'acc-1')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'expense')

    await waitFor(() => {
      expect(lastPageCall()[0]).toMatchObject({ accountId: 'acc-1', type: 'expense' })
    })
  })

  it('envía la búsqueda al servidor solo tras dejar de escribir', async () => {
    const user = userEvent.setup()
    renderLedger()

    await user.type(screen.getByRole('searchbox', { name: 'Buscar por descripción' }), 'mercado')

    await waitFor(() => {
      expect(lastPageCall()[0]).toMatchObject({ search: 'mercado' })
    })
  })

  it('solo ofrece categorías del tipo seleccionado', async () => {
    const user = userEvent.setup()
    renderLedger()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'income')

    const categorySelect = screen.getByRole('combobox', { name: 'Categoría' })
    expect(within(categorySelect).getByRole('option', { name: 'Salario' })).toBeInTheDocument()
    expect(
      within(categorySelect).queryByRole('option', { name: 'Alimentación' }),
    ).not.toBeInTheDocument()
  })

  it('limpia todos los filtros', async () => {
    const user = userEvent.setup()
    renderLedger()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cuenta' }), 'acc-1')
    await user.click(screen.getByRole('button', { name: /limpiar filtros/i }))

    await waitFor(() => {
      expect(lastPageCall()[0]).toEqual({ search: undefined })
    })
  })

  it('ordena por la columna elegida en el servidor', async () => {
    const user = userEvent.setup()
    renderLedger()

    expect(lastPageCall()[1]).toEqual({ field: 'transaction_date', direction: 'desc' })

    await user.click(screen.getByRole('button', { name: /monto/i }))

    await waitFor(() => {
      expect(lastPageCall()[1].field).toBe('amount_minor')
    })
  })

  it('pagina en el servidor y vuelve a la primera página al filtrar', async () => {
    const user = userEvent.setup()
    renderLedger()

    expect(screen.getByText('1–50 de 120')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await waitFor(() => expect(lastPageCall()[2]).toBe(1))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Cuenta' }), 'acc-2')
    await waitFor(() => expect(lastPageCall()[2]).toBe(0))
  })

  it('oculta el saldo acumulado hasta que se activa la columna', async () => {
    const user = userEvent.setup()
    renderLedger()

    expect(screen.queryByRole('columnheader', { name: /saldo acumulado/i })).not.toBeInTheDocument()

    await user.click(screen.getByText('Columnas'))
    await user.click(screen.getByRole('checkbox', { name: 'Saldo acumulado' }))

    expect(screen.getByRole('columnheader', { name: /saldo acumulado/i })).toBeInTheDocument()
  })

  it('exporta a CSV respetando los filtros activos', async () => {
    fetchLedgerForExport.mockResolvedValue(rows)
    const user = userEvent.setup()
    renderLedger()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Tipo' }), 'expense')
    await user.click(screen.getByRole('button', { name: /exportar csv/i }))

    await waitFor(() => expect(downloadCsv).toHaveBeenCalledOnce())

    expect(fetchLedgerForExport).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ type: 'expense' }),
      expect.objectContaining({ field: 'transaction_date' }),
    )

    const [filename, csv] = downloadCsv.mock.calls[0]
    expect(filename).toMatch(/^fintrack-libro-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csv).toContain('Mercado del mes')
  })

  it('avisa cuando ningún movimiento coincide con los filtros', () => {
    useLedgerPage.mockReturnValue({
      data: { rows: [], totalCount: 0 },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    })

    renderLedger()

    expect(screen.getByText('Ningún movimiento coincide con estos filtros.')).toBeInTheDocument()
    expect(screen.getByText('Sin movimientos')).toBeInTheDocument()
  })

  it('ofrece reintentar cuando la consulta falla', async () => {
    const refetch = vi.fn()
    useLedgerPage.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    })

    const user = userEvent.setup()
    renderLedger()

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar los movimientos')

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('con una sola moneda no muestra el selector de moneda', () => {
    renderLedger()

    expect(screen.queryByRole('combobox', { name: 'Moneda' })).not.toBeInTheDocument()
  })

  it('sin movimientos muestra el resumen en cero en la moneda principal', () => {
    useLedgerTotals.mockReturnValue({ data: { byAccount: [], count: 0 }, isError: false })

    renderLedger()

    expect(summaryLines('Ingresos')).toEqual(['COP 0'])
    expect(summaryLines('Gastos')).toEqual(['COP 0'])
    expect(summaryLines('Balance')).toEqual(['COP 0'])
  })

  describe('con cuentas en varias monedas', () => {
    beforeEach(() => {
      useAccounts.mockReturnValue({ data: [...accounts, usdAccount] })
      useLedgerPage.mockReturnValue({
        data: {
          rows: [
            ...rows,
            tx({
              id: 't3',
              account_id: 'acc-usd',
              type: 'income',
              category_id: 'cat-2',
              amount_minor: 1_500,
              description: 'Pago en dólares',
            }),
          ],
          totalCount: 121,
        },
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      })
      useLedgerTotals.mockReturnValue({
        data: {
          byAccount: [
            { type: 'income', accountId: 'acc-usd', totalMinor: 1_500 },
            { type: 'income', accountId: 'acc-1', totalMinor: 300_000 },
            { type: 'expense', accountId: 'acc-1', totalMinor: 50_000 },
            { type: 'expense', accountId: 'acc-usd', totalMinor: 400 },
          ],
          count: 121,
        },
        isError: false,
      })
    })

    it('muestra cada movimiento en la moneda de su cuenta', () => {
      renderLedger()

      const table = within(screen.getByRole('table'))
      const usdRow = within(table.getByText('Pago en dólares').closest('tr')!)
      expect(usdRow.getByText('+ USD 1.500')).toBeInTheDocument()
      const copRow = within(table.getByText('Mercado del mes').closest('tr')!)
      expect(copRow.getByText('− COP 50.000')).toBeInTheDocument()
    })

    it('separa el resumen por moneda, con la principal primero y sin sumarlas', () => {
      renderLedger()

      expect(summaryLines('Ingresos')).toEqual(['COP 300.000', 'USD 1.500'])
      expect(summaryLines('Gastos')).toEqual(['COP 50.000', 'USD 400'])
      expect(summaryLines('Balance')).toEqual(['COP 250.000', 'USD 1.100'])
      expect(summaryLines('Movimientos')).toEqual(['121'])
    })

    it('ordena primero la moneda principal del perfil', () => {
      usePrimaryCurrency.mockReturnValue({ data: 'USD', isPending: false })

      renderLedger()

      expect(summaryLines('Ingresos')).toEqual(['USD 1.500', 'COP 300.000'])
    })

    it('ofrece un selector de moneda con la principal primero', () => {
      usePrimaryCurrency.mockReturnValue({ data: 'USD', isPending: false })
      renderLedger()

      expect(optionLabels(screen.getByRole('combobox', { name: 'Moneda' }))).toEqual([
        'Todas las monedas',
        'USD',
        'COP',
      ])
    })

    it('elegir una moneda pide solo sus cuentas y acota el selector de cuenta', async () => {
      const user = userEvent.setup()
      renderLedger()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda' }), 'USD')

      await waitFor(() => {
        expect(lastPageCall()[0]).toMatchObject({ currencyCode: 'USD', accountIds: ['acc-usd'] })
      })
      expect(useLedgerTotals).toHaveBeenLastCalledWith(
        expect.objectContaining({ accountIds: ['acc-usd'] }),
      )
      expect(optionLabels(screen.getByRole('combobox', { name: 'Cuenta' }))).toEqual([
        'Todas las cuentas',
        'Cuenta USD',
      ])
    })

    it('elegir otra moneda limpia una cuenta que no es de esa moneda', async () => {
      const user = userEvent.setup()
      renderLedger()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Cuenta' }), 'acc-1')
      await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda' }), 'USD')

      await waitFor(() => {
        expect(lastPageCall()[0]).toMatchObject({ currencyCode: 'USD' })
      })
      expect(lastPageCall()[0].accountId).toBeUndefined()
      expect(screen.getByRole('combobox', { name: 'Cuenta' })).toHaveValue('')
    })

    it('limpiar filtros también quita la moneda', async () => {
      const user = userEvent.setup()
      renderLedger()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda' }), 'USD')
      await user.click(screen.getByRole('button', { name: /limpiar filtros/i }))

      await waitFor(() => {
        expect(lastPageCall()[0]).toEqual({ search: undefined })
      })
      expect(screen.getByRole('combobox', { name: 'Moneda' })).toHaveValue('')
    })

    it('filtrando una moneda sin movimientos, el resumen en cero va en esa moneda', async () => {
      useLedgerTotals.mockReturnValue({ data: { byAccount: [], count: 0 }, isError: false })
      const user = userEvent.setup()
      renderLedger()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda' }), 'USD')

      expect(summaryLines('Ingresos')).toEqual(['USD 0'])
      expect(summaryLines('Balance')).toEqual(['USD 0'])
    })

    it('exporta a CSV solo las cuentas de la moneda elegida', async () => {
      fetchLedgerForExport.mockResolvedValue(rows)
      const user = userEvent.setup()
      renderLedger()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda' }), 'COP')
      await user.click(screen.getByRole('button', { name: /exportar csv/i }))

      await waitFor(() => expect(downloadCsv).toHaveBeenCalledOnce())
      expect(fetchLedgerForExport).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ currencyCode: 'COP', accountIds: ['acc-1', 'acc-2'] }),
        expect.anything(),
      )
    })

    it('calcula el saldo acumulado al filtrar por una moneda', async () => {
      const user = userEvent.setup()
      renderLedger()

      await user.click(screen.getByText('Columnas'))
      await user.click(screen.getByRole('checkbox', { name: 'Saldo acumulado' }))
      await user.selectOptions(screen.getByRole('combobox', { name: 'Moneda' }), 'COP')

      expect(
        screen.queryByText(/El saldo acumulado solo se calcula con cuentas de una misma moneda/),
      ).not.toBeInTheDocument()
    })

    it('cada pata de una transferencia muestra su contraparte en la tabla y en las tarjetas', () => {
      useLedgerPage.mockReturnValue({
        data: {
          rows: [
            tx({
              id: 't-out',
              account_id: 'acc-1',
              category_id: null,
              type: 'transfer',
              transfer_direction: 'outgoing',
              transfer_group_id: 'g-1',
              amount_minor: 100_000,
              description: 'Paso a dólares',
            }),
            tx({
              id: 't-in',
              account_id: 'acc-usd',
              category_id: null,
              type: 'transfer',
              transfer_direction: 'incoming',
              transfer_group_id: 'g-1',
              amount_minor: 25,
              description: 'Paso a dólares',
            }),
          ],
          totalCount: 2,
          counterparts: new Map([
            ['t-out', { accountId: 'acc-usd', amountMinor: 25, direction: 'incoming' }],
            ['t-in', { accountId: 'acc-1', amountMinor: 100_000, direction: 'outgoing' }],
          ]),
        },
        isPending: false,
        isError: false,
        refetch: vi.fn(),
      })

      renderLedger()

      const table = within(screen.getByRole('table'))
      const outRow = within(table.getByText('→ Cuenta USD · + USD 25').closest('tr')!)
      expect(outRow.getByText('− COP 100.000')).toBeInTheDocument()
      expect(outRow.getByText('Bancolombia')).toBeInTheDocument()
      const inRow = within(table.getByText('← Bancolombia · − COP 100.000').closest('tr')!)
      expect(inRow.getByText('+ USD 25')).toBeInTheDocument()

      // Dos filas, no cuatro: la contraparte es información de la fila.
      expect(table.getAllByText('Paso a dólares')).toHaveLength(2)
      expect(screen.getByText('1–2 de 2')).toBeInTheDocument()

      // La misma contraparte aparece también en la tarjeta de móvil.
      const outCard = screen
        .getAllByText('→ Cuenta USD · + USD 25')
        .find((element) => element.closest('li'))
      const inCard = screen
        .getAllByText('← Bancolombia · − COP 100.000')
        .find((element) => element.closest('li'))
      expect(within(outCard!.closest('li')!).getByText('− COP 100.000')).toBeInTheDocument()
      expect(within(inCard!.closest('li')!).getByText('+ USD 25')).toBeInTheDocument()
    })

    it('las transferencias entre monedas no entran en el resumen por moneda', () => {
      useLedgerTotals.mockReturnValue({
        data: {
          byAccount: [
            { type: 'income', accountId: 'acc-1', totalMinor: 300_000 },
            { type: 'transfer', accountId: 'acc-1', totalMinor: 100_000 },
            { type: 'transfer', accountId: 'acc-usd', totalMinor: 25 },
          ],
          count: 3,
        },
        isError: false,
      })

      renderLedger()

      // USD aparece porque tiene movimientos en el conjunto, pero la pata que
      // entra no suma ingresos ni balance, y la que sale no resta en COP.
      expect(summaryLines('Ingresos')).toEqual(['COP 300.000', 'USD 0'])
      expect(summaryLines('Gastos')).toEqual(['COP 0', 'USD 0'])
      expect(summaryLines('Balance')).toEqual(['COP 300.000', 'USD 0'])
    })

    it('no calcula el saldo acumulado mezclando monedas y explica cómo verlo', async () => {
      const user = userEvent.setup()
      renderLedger()

      await user.click(screen.getByText('Columnas'))
      await user.click(screen.getByRole('checkbox', { name: 'Saldo acumulado' }))

      expect(
        screen.getByText(
          /El saldo acumulado solo se calcula con cuentas de una misma moneda\. Filtra por una moneda o una cuenta para verlo\./,
        ),
      ).toBeInTheDocument()

      await user.selectOptions(screen.getByRole('combobox', { name: 'Cuenta' }), 'acc-usd')

      expect(
        screen.queryByText(/El saldo acumulado solo se calcula con cuentas de una misma moneda/),
      ).not.toBeInTheDocument()
    })
  })
})
