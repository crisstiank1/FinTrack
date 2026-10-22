import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { LedgerCurrencyTotals } from '@/features/ledger/api'

interface LedgerSummaryProps {
  /** Totales por moneda, con la principal primero. `undefined` mientras cargan. */
  totals: LedgerCurrencyTotals[] | undefined
  count: number | undefined
  isError: boolean
  /** Moneda en la que se muestran los ceros cuando el filtro no trae movimientos. */
  currencyCode: string
}

const countFormatter = new Intl.NumberFormat('es-CO')

/**
 * Resumen del conjunto filtrado completo, no de la página en pantalla.
 *
 * Se calcula sobre todas las filas filtradas (ver `fetchLedgerTotals`), así que
 * sigue siendo correcto aunque la tabla muestre 50 filas de 12.000. Con movimientos en varias monedas, cada cifra
 * lleva una línea por moneda: FinTrack no convierte divisas, así que sumarlas
 * daría un número sin sentido.
 */
export function LedgerSummary({ totals, count, isError, currencyCode }: LedgerSummaryProps) {
  if (isError) {
    return (
      <p
        role="status"
        className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card"
      >
        No pudimos calcular el resumen. La tabla y la exportación siguen funcionando.
      </p>
    )
  }

  const rows: Pick<
    LedgerCurrencyTotals,
    'currencyCode' | 'incomeMinor' | 'expenseMinor' | 'balanceMinor'
  >[] =
    totals && totals.length > 0
      ? totals
      : [{ currencyCode, incomeMinor: 0, expenseMinor: 0, balanceMinor: 0 }]

  const amounts = (pick: (row: (typeof rows)[number]) => number) =>
    totals ? rows.map((row) => formatAmount(pick(row), row.currencyCode)) : ['—']

  const items = [
    { label: 'Ingresos', values: amounts((row) => row.incomeMinor), tone: 'text-success' },
    { label: 'Gastos', values: amounts((row) => row.expenseMinor), tone: 'text-danger' },
    { label: 'Balance', values: amounts((row) => row.balanceMinor), tone: 'text-foreground' },
    {
      label: 'Movimientos',
      values: [count === undefined ? '—' : countFormatter.format(count)],
      tone: 'text-foreground',
    },
  ]

  return (
    <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5 lg:grid-cols-4 lg:[&>div:not(:first-child)]:border-l lg:[&>div:not(:first-child)]:border-border lg:[&>div:not(:first-child)]:pl-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className={cn('mt-0.5 text-lg font-bold tabular-nums', item.tone)}>
            {item.values.length === 1
              ? item.values[0]
              : item.values.map((value) => (
                  <span key={value} className="block">
                    {value}
                  </span>
                ))}
          </dd>
        </div>
      ))}
    </dl>
  )
}
