import { ChevronDown } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'

import type { BudgetCoverage } from '../calculations/reconciliation'
import {
  formatContributionPlanned,
  formatPlannedIncomeAmount,
  formatUnassigned,
  formatZeroBudget,
  linesWithoutBudgetCountLabel,
  linesWithZeroBudgetCountLabel,
  planLineKindLabel,
  reconciliationDescribedLabel,
  reconciliationHeadline,
  unlinkedCategoriesCountLabel,
  ARCHIVED_NO_NEW_BUDGETS_LABEL,
  DESCRIBE_FROM_PLAN_LINES_LABEL,
  NO_BUDGET_LABEL,
  UNASSIGNED_NOTE,
  type PlanTone,
} from '../labels'
import { budgetsHrefForMonth } from '../links'
import type { CategoryLineKind } from '../mutations'

/** Categoría con presupuesto y sin línea, con su nombre ya resuelto. */
export interface ReconciliationCategoryItem {
  categoryId: string
  name: string
  isArchived: boolean
  /** Presupuesto efectivo del mes, tal como llega de `useEffectiveCategoryBudgets`. */
  amountMinor: number
}

/** Línea cuya categoría no suma a lo asignado este mes. */
export interface ReconciliationLineItem {
  lineId: string
  name: string
  kind: CategoryLineKind
  categoryName: string
  isCategoryArchived: boolean
}

export interface BudgetReconciliationPanelProps {
  monthKey: string
  monthLabel: string
  currencyCode: string
  /** Sin plan no hay líneas que crear, así que no se invita a describir nada. */
  hasPlan: boolean
  /** `null` cuando el mes no tiene ninguna fuente de ingreso. */
  incomePlannedMinor: number | null
  coverage: Pick<
    BudgetCoverage,
    | 'totalMinor'
    | 'billsMinor'
    | 'variablesMinor'
    | 'unlinkedMinor'
    | 'coveredMinor'
    | 'hasCategoryBudgets'
  >
  /** `null` sin líneas de ahorro. */
  savingsPlannedMinor: number | null
  /** `null` sin líneas de inversión. */
  investmentPlannedMinor: number | null
  /** El mismo `asignado` de la tarjeta «Presupuesto asignado». */
  assignedMinor: number
  /** `null` sin ingreso planeado. */
  unassignedMinor: number | null
  unlinkedCategories: ReconciliationCategoryItem[]
  linesWithoutBudget: ReconciliationLineItem[]
  linesWithZeroBudget: ReconciliationLineItem[]
}

const TONE_STYLES: Record<PlanTone, string> = {
  neutral: 'text-foreground',
  positive: 'text-success',
  negative: 'text-danger',
}

const ARCHIVED_BADGE =
  'rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground'

const LINK_STYLES = 'text-sm font-medium text-primary underline underline-offset-4'

/**
 * Reconciliación del presupuesto: de dónde sale «Asignado» y cuánto de ese
 * presupuesto describen ya las facturas y los gastos variables
 * (docs/09-plan-mensual.md, «Reconciliación del presupuesto»).
 *
 * Es **de solo lectura**. No abre formularios, no crea líneas ni presupuestos
 * y no preselecciona categorías: cambiar un presupuesto se hace en `/budgets`,
 * y la pantalla solo enlaza allí, una vez por grupo, porque esa ruta no puede
 * llevar a una categoría concreta.
 *
 * Todas las cifras llegan calculadas —de `buildBudgetCoverage` y de
 * `summarizeAllocation`— y cómo se dice un `null`, un `0` o un negativo lo
 * decide `labels.ts`. Aquí no se suma nada.
 *
 * Nace plegado en cualquier ancho: el titular ya dice el estado principal, y
 * no depender del tamaño de la ventana evita un salto al montar.
 */
export function BudgetReconciliationPanel({
  monthKey,
  monthLabel,
  currencyCode,
  hasPlan,
  incomePlannedMinor,
  coverage,
  savingsPlannedMinor,
  investmentPlannedMinor,
  assignedMinor,
  unassignedMinor,
  unlinkedCategories,
  linesWithoutBudget,
  linesWithZeroBudget,
}: BudgetReconciliationPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const titleId = useId()
  const detailId = useId()

  const headline = reconciliationHeadline(
    { assignedMinor, incomePlannedMinor, unassignedMinor },
    currencyCode,
  )
  const unassigned = formatUnassigned(unassignedMinor, currencyCode)
  const monthName = monthLabel.split(' ')[0]
  const budgetsHref = budgetsHrefForMonth(monthKey)

  const counts = [
    unlinkedCategoriesCountLabel(unlinkedCategories.length),
    linesWithoutBudgetCountLabel(linesWithoutBudget.length),
  ]
  if (linesWithZeroBudget.length > 0) {
    counts.push(linesWithZeroBudgetCountLabel(linesWithZeroBudget.length, currencyCode))
  }

  return (
    <section aria-labelledby={titleId} className="mt-8">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm font-medium text-muted-foreground">
              Reconciliación del presupuesto
            </h2>
            <p
              className={cn(
                'mt-1 text-lg font-semibold tabular-nums text-balance',
                TONE_STYLES[headline.tone],
              )}
            >
              {headline.title}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{headline.detail}</p>
            <p className="mt-2 text-xs text-muted-foreground">{counts.join(' · ')}</p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={isOpen}
            aria-controls={detailId}
            onClick={() => setIsOpen((open) => !open)}
          >
            <ChevronDown
              className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
              aria-hidden="true"
            />
            {isOpen ? 'Ocultar detalle' : 'Ver detalle'}
          </Button>
        </div>

        {/* El contenedor existe siempre, para que `aria-controls` apunte a algo;
            su contenido solo se monta desplegado, así que plegado no deja
            texto oculto que un lector o una búsqueda puedan encontrar. */}
        <div id={detailId} hidden={!isOpen}>
          {isOpen && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {!hasPlan && (
                    <p className="text-sm text-muted-foreground first-letter:uppercase">
                      {monthLabel} todavía no tiene plan: no hay ingreso con el que comparar ni
                      líneas que describan el presupuesto.
                    </p>
                  )}
                  {hasPlan && incomePlannedMinor === null && (
                    <p className="text-sm text-muted-foreground">
                      Añade una fuente de ingreso para saber cuánto queda por asignar.
                    </p>
                  )}
                </div>
                <Link to={budgetsHref} className={LINK_STYLES}>
                  Ir a Presupuestos de {monthName}
                </Link>
              </div>

              <div className="mt-3 grid gap-6 lg:grid-cols-2">
                {/* Cuadre. Dos columnas caben en 375 px, así que la misma tabla
                sirve en móvil sin desbordar la página. */}
                <div>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full border-collapse text-sm">
                      <caption className="sr-only">
                        Cuadre del presupuesto de {monthLabel}: presupuesto por categorías, aportes
                        planeados por cuenta y lo que queda por asignar.
                      </caption>

                      <tbody>
                        <Row
                          label="Presupuesto por categorías"
                          value={
                            coverage.hasCategoryBudgets
                              ? formatAmount(coverage.totalMinor, currencyCode)
                              : NO_BUDGET_LABEL
                          }
                          strong
                        />
                        {coverage.hasCategoryBudgets ? (
                          <>
                            <Row
                              label={reconciliationDescribedLabel.bill}
                              value={formatAmount(coverage.billsMinor, currencyCode)}
                              indent
                            />
                            <Row
                              label={reconciliationDescribedLabel.variable}
                              value={formatAmount(coverage.variablesMinor, currencyCode)}
                              indent
                            />
                            <Row
                              label="Sin línea descriptiva"
                              value={formatAmount(coverage.unlinkedMinor, currencyCode)}
                              note={
                                coverage.unlinkedMinor === 0
                                  ? 'Todo el presupuesto está descrito'
                                  : undefined
                              }
                              indent
                            />
                          </>
                        ) : (
                          <tr className="border-b border-border">
                            <td colSpan={2} className="px-3 py-2.5 text-xs text-muted-foreground">
                              Ninguna categoría tiene presupuesto en {monthLabel}.
                            </td>
                          </tr>
                        )}
                      </tbody>

                      <tbody>
                        <tr>
                          <th
                            scope="colgroup"
                            colSpan={2}
                            className="border-b border-border bg-muted/40 px-3 py-2 text-left text-sm font-semibold text-foreground"
                          >
                            Planificado por cuenta
                          </th>
                        </tr>
                        <Row
                          label="Aportes a ahorro planeados"
                          value={formatContributionPlanned(savingsPlannedMinor, currencyCode)}
                          indent
                        />
                        <Row
                          label="Aportes a inversión planeados"
                          value={formatContributionPlanned(investmentPlannedMinor, currencyCode)}
                          indent
                        />
                      </tbody>

                      <tbody>
                        <Row
                          label="Asignado"
                          value={formatAmount(assignedMinor, currencyCode)}
                          strong
                        />
                        <Row
                          label="Ingreso planeado"
                          value={formatPlannedIncomeAmount(incomePlannedMinor, currencyCode)}
                        />
                        <Row
                          label="Por asignar"
                          value={unassigned.text}
                          tone={unassigned.tone}
                          note={
                            unassignedMinor === 0
                              ? 'Todo el ingreso planeado está asignado'
                              : undefined
                          }
                          last
                        />
                      </tbody>
                    </table>
                  </div>

                  {coverage.hasCategoryBudgets && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Cubierto por líneas: {formatAmount(coverage.coveredMinor, currencyCode)} de{' '}
                      {formatAmount(coverage.totalMinor, currencyCode)}.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <Group
                    title="Presupuestos sin línea"
                    emptyLabel="Ninguna categoría con presupuesto está sin línea."
                    note="Su gasto cuenta como «No planeado» hasta que una factura o un gasto variable lo describa. No es un error."
                    isEmpty={unlinkedCategories.length === 0}
                  >
                    {unlinkedCategories.map((category) => (
                      <li
                        key={category.categoryId}
                        className="rounded-xl border border-border bg-card p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-foreground">
                            <span className="truncate">{category.name}</span>
                            {category.isArchived && (
                              <span className={ARCHIVED_BADGE}>Archivada</span>
                            )}
                          </p>
                          <p className="tabular-nums text-foreground">
                            {formatAmount(category.amountMinor, currencyCode)}
                          </p>
                        </div>
                        {category.isArchived ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Categoría archivada: no admite líneas nuevas.
                          </p>
                        ) : (
                          hasPlan && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {DESCRIBE_FROM_PLAN_LINES_LABEL}
                            </p>
                          )
                        )}
                      </li>
                    ))}
                  </Group>

                  <Group
                    title="Líneas sin presupuesto"
                    emptyLabel="Ninguna línea está sin presupuesto."
                    note={`Son válidas: describen el gasto de su categoría, pero esa categoría no tiene presupuesto en ${monthLabel}, así que no suman a lo asignado.`}
                    isEmpty={linesWithoutBudget.length === 0}
                    action={
                      linesWithoutBudget.some((line) => !line.isCategoryArchived) && (
                        <Link to={budgetsHref} className={LINK_STYLES}>
                          Completar presupuestos en {monthName}
                        </Link>
                      )
                    }
                  >
                    {linesWithoutBudget.map((line) => (
                      <LineRow
                        key={line.lineId}
                        line={line}
                        status={
                          line.isCategoryArchived ? ARCHIVED_NO_NEW_BUDGETS_LABEL : NO_BUDGET_LABEL
                        }
                      />
                    ))}
                  </Group>

                  {linesWithZeroBudget.length > 0 && (
                    <Group
                      title={`Líneas con presupuesto en ${formatAmount(0, currencyCode)}`}
                      note={`Su categoría tiene un presupuesto explícito de ${formatAmount(0, currencyCode)} en ${monthLabel}: la línea es válida y no suma a lo asignado.`}
                      isEmpty={false}
                    >
                      {linesWithZeroBudget.map((line) => (
                        <LineRow
                          key={line.lineId}
                          line={line}
                          status={formatZeroBudget(currencyCode)}
                        />
                      ))}
                    </Group>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nota fija, no un tooltip: se lee siempre (docs/03-ui-ux.md). */}
      <p className="mt-3 text-xs text-muted-foreground">{UNASSIGNED_NOTE}</p>
    </section>
  )
}

interface RowProps {
  label: string
  value: string
  /** Marca discreta de completo; se lee, no depende del color. */
  note?: string
  tone?: PlanTone
  strong?: boolean
  indent?: boolean
  last?: boolean
}

function Row({ label, value, note, tone = 'neutral', strong, indent, last }: RowProps) {
  return (
    <tr className={cn(!last && 'border-b border-border')}>
      <th
        scope="row"
        className={cn(
          'px-3 py-2.5 text-left align-top text-foreground',
          strong ? 'font-semibold' : 'font-normal',
          indent && 'pl-6',
        )}
      >
        {label}
        {note && <span className="block text-xs font-normal text-muted-foreground">{note}</span>}
      </th>
      <td
        className={cn(
          'px-3 py-2.5 text-right align-top tabular-nums',
          strong && 'font-semibold',
          TONE_STYLES[tone],
        )}
      >
        {value}
      </td>
    </tr>
  )
}

interface GroupProps {
  title: string
  /** Texto cuando el grupo no tiene filas. Un grupo que solo se pinta con filas no lo necesita. */
  emptyLabel?: string
  note: string
  isEmpty: boolean
  action?: ReactNode
  children: ReactNode
}

function Group({ title, emptyLabel, note, isEmpty, action, children }: GroupProps) {
  const titleId = useId()

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={titleId} className="text-sm font-semibold text-foreground">
          {title}
        </h3>
        {!isEmpty && action}
      </div>

      {isEmpty ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
          <ul aria-labelledby={titleId} className="mt-2 flex flex-col gap-2">
            {children}
          </ul>
        </>
      )}
    </div>
  )
}

function LineRow({ line, status }: { line: ReconciliationLineItem; status: string }) {
  return (
    <li className="rounded-xl border border-border bg-card p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
        <span className="truncate">{line.name}</span>
        {line.isCategoryArchived && <span className={ARCHIVED_BADGE}>Archivada</span>}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {planLineKindLabel[line.kind]} · {line.categoryName}
      </p>
      <p className="mt-1 text-xs text-foreground">{status}</p>
    </li>
  )
}
