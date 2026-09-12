import { useId } from 'react'

import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'

import type { Diff } from '../calculations/diff'
import {
  diffStatusTone,
  formatRowDiff,
  formatRowPlannedAmount,
  planRowGroupLabel,
  planRowGroupNote,
  planRowLabel,
  type PlanRowGroupId,
  type PlanRowId,
  type PlanTone,
} from '../labels'

export interface PlanComparisonRow {
  id: PlanRowId
  /** `null` cuando no hay presupuesto que comparar. Nunca se sustituye por 0. */
  plannedMinor: number | null
  actualMinor: number
  diff: Diff
  /** Subtotal del grupo: se destaca, pero no cambia de significado. */
  isSubtotal?: boolean
}

export interface PlanComparisonGroup {
  id: PlanRowGroupId
  rows: PlanComparisonRow[]
}

interface BudgetVsActualTableProps {
  groups: PlanComparisonGroup[]
  currencyCode: string
  /** Mes ya formateado, para el título accesible de la tabla. */
  monthLabel: string
}

const TONE_STYLES: Record<PlanTone, string> = {
  neutral: 'text-muted-foreground',
  positive: 'text-success',
  negative: 'text-danger',
}

/**
 * Cuadro Presupuesto vs. Actual.
 *
 * Los grupos no son decoración: las filas del desglose —facturas, variables y
 * no planeado— suman los gastos totales, y las indicadoras —ahorro, inversión
 * y deuda— **no forman parte de esa suma**. Van en `<tbody>` distintos, con su
 * encabezado de grupo y una nota que lo dice con palabras, porque separar solo
 * por color dejaría la distinción fuera del alcance de quien no lo ve
 * (docs/09-plan-mensual.md, «Las dos particiones del gasto»).
 *
 * Ninguna celda es editable: todos los «Actual» se calculan desde
 * `transactions`.
 */
export function BudgetVsActualTable({
  groups,
  currencyCode,
  monthLabel,
}: BudgetVsActualTableProps) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className="mt-8">
      <h2 id={titleId} className="text-base font-semibold text-foreground">
        Presupuesto vs. Actual
      </h2>

      {/* Escritorio: tabla semántica. El desbordamiento vive en este
          contenedor, nunca en la página. */}
      <div className="mt-3 hidden overflow-x-auto rounded-xl border border-border sm:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Presupuesto frente a lo real en {monthLabel}. Las filas del desglose de gastos suman los
            gastos totales; los indicadores se miden aparte.
          </caption>
          <thead className="bg-surface-elevated">
            <tr>
              <th
                scope="col"
                className="border-b border-border px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Concepto
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

          {groups.map((group) => (
            <tbody key={group.id}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={4}
                  className="border-b border-border bg-muted/40 px-3 py-2 text-left text-sm font-semibold text-foreground"
                >
                  {planRowGroupLabel[group.id]}
                  {planRowGroupNote[group.id] && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {planRowGroupNote[group.id]}
                    </span>
                  )}
                </th>
              </tr>

              {group.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <th
                    scope="row"
                    className={cn(
                      'px-3 py-2.5 text-left font-normal text-foreground',
                      row.isSubtotal && 'font-semibold',
                    )}
                  >
                    {planRowLabel[row.id]}
                  </th>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-right tabular-nums text-foreground',
                      row.isSubtotal && 'font-semibold',
                    )}
                  >
                    {formatRowPlannedAmount(row.id, row.plannedMinor, currencyCode)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-right tabular-nums text-foreground',
                      row.isSubtotal && 'font-semibold',
                    )}
                  >
                    {formatAmount(row.actualMinor, currencyCode)}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2.5 text-left',
                      TONE_STYLES[diffStatusTone[row.diff.status]],
                    )}
                  >
                    {formatRowDiff(row.id, row.diff, currencyCode)}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {/* Móvil: las mismas filas como tarjetas. Cuatro columnas en 375px
          obligarían a leer de lado una frase como «Desfavorable por COP
          120.000». Ninguna tarjeta pierde concepto, planeado, actual ni
          diferencia. */}
      <ul aria-label={`Presupuesto frente a lo real en ${monthLabel}`} className="mt-3 sm:hidden">
        {groups.map((group) => (
          <li key={group.id} className="mb-5 last:mb-0">
            <h3 className="text-sm font-semibold text-foreground">{planRowGroupLabel[group.id]}</h3>
            {planRowGroupNote[group.id] && (
              <p className="mt-0.5 text-xs text-muted-foreground">{planRowGroupNote[group.id]}</p>
            )}

            <ul className="mt-2 flex flex-col gap-2">
              {group.rows.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    'rounded-xl border border-border bg-card p-3',
                    row.isSubtotal && 'border-foreground/20',
                  )}
                >
                  <p
                    className={cn(
                      'text-sm text-foreground',
                      row.isSubtotal ? 'font-semibold' : 'font-medium',
                    )}
                  >
                    {planRowLabel[row.id]}
                  </p>

                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Planeado</dt>
                    <dd className="text-right tabular-nums text-foreground">
                      {formatRowPlannedAmount(row.id, row.plannedMinor, currencyCode)}
                    </dd>

                    <dt className="text-muted-foreground">Actual</dt>
                    <dd className="text-right tabular-nums text-foreground">
                      {formatAmount(row.actualMinor, currencyCode)}
                    </dd>

                    <dt className="text-muted-foreground">Diferencia</dt>
                    <dd className={cn('text-right', TONE_STYLES[diffStatusTone[row.diff.status]])}>
                      {formatRowDiff(row.id, row.diff, currencyCode)}
                    </dd>
                  </dl>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}
