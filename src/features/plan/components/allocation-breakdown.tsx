import { SlidersHorizontal } from 'lucide-react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'

import type { AllocationGroup } from '../calculations/allocation'
import type { Diff } from '../calculations/diff'
import {
  allocationGroupLabel,
  diffStatusTone,
  formatAllocationDiff,
  formatAllocationPlanned,
  formatBasisPoints,
  ignoredAllocationGroupsNote,
  ALLOCATION_NOTE,
  UNCLASSIFIED_LABEL,
  UNCLASSIFIED_NOTE,
  type PlanTone,
} from '../labels'

export interface AllocationRow {
  group: AllocationGroup
  /** Puntos base guardados. `null` si el grupo no tiene porcentaje propio. */
  percentBp: number | null
  /** Importe asignado. `null` sin reparto o sin ingreso planeado que repartir. */
  plannedMinor: number | null
  actualMinor: number
  diff: Diff
}

interface AllocationBreakdownProps {
  rows: AllocationRow[]
  /** `false` cuando el mes no tiene porcentajes guardados. */
  hasAllocation: boolean
  /** Suma de lo asignado, que es exactamente el ingreso planeado. */
  totalPlannedMinor: number | null
  /** Gasto de categorías sin clasificar. Fuera de los cinco grupos. */
  unclassifiedMinor: number
  /** Grupos descartados por no pertenecer al reparto. */
  ignoredGroups: string[]
  currencyCode: string
  monthLabel: string
  /**
   * Abre el formulario del reparto. **Ausente cuando el mes no tiene plan**:
   * sin `plan_month_id` no hay a qué colgar las cinco filas, así que el botón
   * no se pinta en vez de ofrecer algo que no se podría guardar. Crear el plan
   * es trabajo del bloque de ingresos.
   */
  onConfigure?: () => void
  isBusy?: boolean
}

const TONE_STYLES: Record<PlanTone, string> = {
  neutral: 'text-muted-foreground',
  positive: 'text-success',
  negative: 'text-danger',
}

/**
 * Color de cada grupo en la barra y en el punto que lo ata a su fila.
 *
 * Son tokens del tema, no valores fijos, y el color nunca porta información por
 * sí solo: cada grupo lleva su nombre y su porcentaje en texto.
 */
const GROUP_COLORS: Record<AllocationGroup, string> = {
  needs: 'bg-primary',
  wants: 'bg-primary-soft',
  savings: 'bg-success',
  investment: 'bg-warning',
  debt: 'bg-danger',
}

/**
 * Reparto 50/30/20 del mes, en modo lectura.
 *
 * El reparto distribuye el **ingreso planeado** entre cinco destinos; no
 * descompone el gasto. Por eso la suma de los cinco grupos no coincide con
 * Gastos totales —ahorro e inversión son transferencias registradas— y por eso
 * el bloque lo dice con una nota fija (docs/09-plan-mensual.md).
 *
 * «Sin clasificar» va después del total y fuera de él: no es un sexto grupo,
 * es el gasto que todavía no pertenece a ninguno.
 *
 * Los importes asignados los calcula `resolveAllocation` por mayor resto, así
 * que la suma cuadra exactamente con el ingreso planeado. Aquí solo se muestra.
 */
export function AllocationBreakdown({
  rows,
  hasAllocation,
  totalPlannedMinor,
  unclassifiedMinor,
  ignoredGroups,
  currencyCode,
  monthLabel,
  onConfigure,
  isBusy,
}: AllocationBreakdownProps) {
  const titleId = useId()
  const ignoredNote = ignoredAllocationGroupsNote(ignoredGroups)

  const segments = rows.filter((row) => (row.percentBp ?? 0) > 0)
  const barLabel = segments
    .map((row) => `${allocationGroupLabel[row.group]} ${formatBasisPoints(row.percentBp)}`)
    .join(', ')

  const planned = (row: AllocationRow) =>
    formatAllocationPlanned(row.plannedMinor, hasAllocation, currencyCode)
  const difference = (row: AllocationRow) =>
    formatAllocationDiff(row.diff, hasAllocation, currencyCode)

  return (
    <section aria-labelledby={titleId} className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={titleId} className="text-base font-semibold text-foreground">
          Reparto 50/30/20
        </h2>

        {onConfigure && (
          <Button type="button" variant="outline" size="sm" onClick={onConfigure} disabled={isBusy}>
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {hasAllocation ? 'Editar reparto' : 'Configurar reparto'}
          </Button>
        )}
      </div>

      {!hasAllocation && (
        <p className="mt-2 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground first-letter:uppercase">
          {monthLabel} no tiene reparto configurado. Abajo sigues viendo lo que realmente ocurrió en
          cada grupo.
        </p>
      )}

      {ignoredNote && (
        <p className="mt-2 rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
          {ignoredNote}
        </p>
      )}

      {/* La barra es refuerzo visual: su contenido íntegro está en la tabla y
          en las tarjetas. Los segmentos no llevan texto dentro porque uno
          estrecho lo volvería ilegible. */}
      {segments.length > 0 && (
        <div
          role="img"
          aria-label={`Reparto del ingreso planeado de ${monthLabel}: ${barLabel}`}
          className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted"
        >
          {segments.map((row) => (
            <span
              key={row.group}
              className={GROUP_COLORS[row.group]}
              style={{ width: `${(row.percentBp ?? 0) / 100}%` }}
            />
          ))}
        </div>
      )}

      {/* Escritorio */}
      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-border sm:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Reparto del ingreso planeado de {monthLabel} por grupo, con lo realmente ocurrido en
            cada uno.
          </caption>
          <thead className="bg-surface-elevated">
            <tr>
              <th
                scope="col"
                className="border-b border-border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Grupo
              </th>
              <th
                scope="col"
                className="border-b border-border px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                %
              </th>
              <th
                scope="col"
                className="border-b border-border px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Planeado
              </th>
              <th
                scope="col"
                className="border-b border-border px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Actual
              </th>
              <th
                scope="col"
                className="border-b border-border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Diferencia
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.group} className="border-b border-border">
                <th scope="row" className="px-3 py-2.5 text-left font-normal text-foreground">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn('size-2 shrink-0 rounded-full', GROUP_COLORS[row.group])}
                    />
                    {allocationGroupLabel[row.group]}
                  </span>
                </th>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {formatBasisPoints(row.percentBp)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                  {planned(row)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                  {formatAmount(row.actualMinor, currencyCode)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-left',
                    TONE_STYLES[diffStatusTone[row.diff.status]],
                  )}
                >
                  {difference(row)}
                </td>
              </tr>
            ))}

            <tr className="border-b border-border bg-muted/40">
              <th scope="row" className="px-3 py-2.5 text-left font-semibold text-foreground">
                Total repartido
              </th>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {formatBasisPoints(hasAllocation ? 10_000 : null)}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-foreground">
                {formatAllocationPlanned(totalPlannedMinor, hasAllocation, currencyCode)}
              </td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-left text-xs text-muted-foreground">
                {hasAllocation ? 'Igual al ingreso planeado' : ''}
              </td>
            </tr>
          </tbody>

          {/* `tbody` aparte: «Sin clasificar» no forma parte del reparto ni de
              su total, y la separación tiene que notarse sin depender del color. */}
          <tbody>
            <tr>
              <th scope="row" className="px-3 py-2.5 text-left font-normal text-foreground">
                {UNCLASSIFIED_LABEL}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Fuera de los cinco grupos
                </span>
              </th>
              <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                {formatAmount(unclassifiedMinor, currencyCode)}
              </td>
              <td className="px-3 py-2.5 text-left text-xs text-muted-foreground">
                {unclassifiedMinor > 0 ? UNCLASSIFIED_NOTE : 'Todo el gasto está clasificado'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Móvil */}
      <ul aria-label={`Reparto de ${monthLabel}`} className="mt-3 flex flex-col gap-2 sm:hidden">
        {rows.map((row) => (
          <li key={row.group} className="rounded-xl border border-border bg-card p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span
                aria-hidden="true"
                className={cn('size-2 shrink-0 rounded-full', GROUP_COLORS[row.group])}
              />
              {allocationGroupLabel[row.group]}
            </p>

            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Porcentaje</dt>
              <dd className="text-right tabular-nums text-foreground">
                {formatBasisPoints(row.percentBp)}
              </dd>

              <dt className="text-muted-foreground">Planeado</dt>
              <dd className="text-right tabular-nums text-foreground">{planned(row)}</dd>

              <dt className="text-muted-foreground">Actual</dt>
              <dd className="text-right tabular-nums text-foreground">
                {formatAmount(row.actualMinor, currencyCode)}
              </dd>

              <dt className="text-muted-foreground">Diferencia</dt>
              <dd className={cn('text-right', TONE_STYLES[diffStatusTone[row.diff.status]])}>
                {difference(row)}
              </dd>
            </dl>
          </li>
        ))}

        <li className="rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-semibold text-foreground">Total repartido</p>
          <p className="mt-1 text-right text-sm tabular-nums text-foreground">
            {formatAllocationPlanned(totalPlannedMinor, hasAllocation, currencyCode)}
          </p>
          {hasAllocation && (
            <p className="mt-1 text-xs text-muted-foreground">Igual al ingreso planeado</p>
          )}
        </li>

        <li className="rounded-xl border border-dashed border-border bg-card p-3">
          <p className="text-sm font-medium text-foreground">{UNCLASSIFIED_LABEL}</p>
          <p className="mt-1 text-right text-sm tabular-nums text-foreground">
            {formatAmount(unclassifiedMinor, currencyCode)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fuera de los cinco grupos.{' '}
            {unclassifiedMinor > 0 ? UNCLASSIFIED_NOTE : 'Todo el gasto está clasificado'}
          </p>
        </li>
      </ul>

      <p className="mt-3 text-xs text-muted-foreground">{ALLOCATION_NOTE}</p>
    </section>
  )
}
