import { formatAmount } from '@/lib/currency'

export interface ChartTooltipEntry {
  name?: string
  value?: number
  color?: string
  dataKey?: string | number
  /** Recharts pone aquí el dato original; en un donut es donde vive el color. */
  payload?: { color?: string; fill?: string }
}

interface ChartTooltipProps {
  active?: boolean
  label?: string
  payload?: readonly ChartTooltipEntry[]
  currencyCode: string
  /** Transforma la etiqueta del eje ('sep') en algo legible ('septiembre 2026'). */
  formatLabel?: (label: string) => string
}

/**
 * Tooltip compartido por los gráficos del dashboard. Es HTML, no SVG, así que
 * puede usar directamente las clases de token en vez de colores calculados.
 */
export function ChartTooltip({
  active,
  label,
  payload,
  currencyCode,
  formatLabel,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 shadow-lg">
      {label !== undefined && (
        <p className="text-xs font-medium capitalize text-muted-foreground">
          {formatLabel ? formatLabel(label) : label}
        </p>
      )}
      <ul className="mt-1 flex flex-col gap-1">
        {payload.map((entry, index) => (
          <li key={entry.dataKey ?? index} className="flex items-center gap-2 text-sm">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{
                backgroundColor: entry.color ?? entry.payload?.color ?? entry.payload?.fill,
              }}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums text-foreground">
              {formatAmount(entry.value ?? 0, currencyCode)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
