import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { LedgerTotals } from '@/features/ledger/api'

interface LedgerSummaryProps {
  totals: LedgerTotals | undefined
  isError: boolean
  currencyCode: string
}

const countFormatter = new Intl.NumberFormat('es-CO')

/**
 * Resumen del conjunto filtrado completo, no de la página en pantalla.
 *
 * Se calcula en el servidor, así que sigue siendo correcto aunque la tabla
 * muestre 50 filas de 12.000.
 */
export function LedgerSummary({ totals, isError, currencyCode }: LedgerSummaryProps) {
  if (isError) {
    return (
      <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        No pudimos calcular el resumen. La tabla y la exportación siguen funcionando.
      </p>
    )
  }

  const items = [
    {
      label: 'Ingresos',
      value: totals ? formatAmount(totals.incomeMinor, currencyCode) : '—',
      tone: 'text-success',
    },
    {
      label: 'Gastos',
      value: totals ? formatAmount(totals.expenseMinor, currencyCode) : '—',
      tone: 'text-danger',
    },
    {
      label: 'Balance',
      value: totals ? formatAmount(totals.balanceMinor, currencyCode) : '—',
      tone: 'text-foreground',
    },
    {
      label: 'Movimientos',
      value: totals ? countFormatter.format(totals.count) : '—',
      tone: 'text-foreground',
    },
  ]

  return (
    <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className={cn('mt-0.5 text-lg font-semibold tabular-nums', item.tone)}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
