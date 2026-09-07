import { TYPE_LABELS } from '@/features/ledger/labels'
import { cn } from '@/lib/utils'

const TYPE_STYLES: Record<string, string> = {
  income: 'bg-success/12 text-success',
  expense: 'bg-danger/12 text-danger',
  transfer: 'bg-muted text-muted-foreground',
}

/** Distintivo del tipo de movimiento en la tabla del libro. */
export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        TYPE_STYLES[type] ?? TYPE_STYLES.transfer,
      )}
    >
      {TYPE_LABELS[type] ?? type}
    </span>
  )
}
