import { AlertTriangle, TrendingDown } from 'lucide-react'
import { Link } from 'react-router-dom'

import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'

import { budgetAlertMessage, budgetAlertSeverity, budgetStatusTone, isBudgetAlert } from '../labels'
import type { BudgetProgress, GlobalBudgetAlert } from '../progress'

export interface BudgetAlertItem {
  categoryId: string
  categoryName: string
  isArchived: boolean
  progress: BudgetProgress
}

interface BudgetAlertsProps {
  items: BudgetAlertItem[]
  globalAlert: GlobalBudgetAlert | null
  currencyCode: string
  /**
   * Mes al que apuntan los enlaces de acción. Se pasa desde el dashboard; en
   * la propia pantalla de presupuestos se omite, porque el enlace llevaría al
   * sitio donde ya está el usuario.
   */
  linkToMonth?: string
}

/**
 * Alertas del mes: una por presupuesto que cruza umbral, más la global.
 *
 * Son derivadas, no persistentes: se calculan al vuelo desde el progreso y no
 * hay nada que marcar como leído. `classifyBudgetStatus` ya devuelve un único
 * estado por categoría, así que no puede haber dos avisos para la misma.
 */
export function BudgetAlerts({ items, globalAlert, currencyCode, linkToMonth }: BudgetAlertsProps) {
  const alerts = items
    .filter((item) => isBudgetAlert(item.progress.status))
    .sort((a, b) => budgetAlertSeverity[b.progress.status] - budgetAlertSeverity[a.progress.status])

  if (alerts.length === 0 && !globalAlert) return null

  return (
    <ul className="flex flex-col gap-2">
      {globalAlert && (
        <li
          role="status"
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/8 p-3 text-sm"
        >
          <TrendingDown className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <span className="text-foreground">
            Gastaste {formatAmount(Math.abs(globalAlert.netSavingsMinor), currencyCode)} más de lo
            que ingresaste este mes.
          </span>
        </li>
      )}

      {alerts.map((item) => {
        const message = budgetAlertMessage(item.categoryName, item.progress, currencyCode)
        if (!message) return null

        const tone = budgetStatusTone[item.progress.status]

        return (
          <li
            key={item.categoryId}
            className={cn(
              'flex flex-wrap items-start gap-2 rounded-lg border p-3 text-sm',
              tone === 'danger' ? 'border-danger/30 bg-danger/8' : 'border-warning/30 bg-warning/8',
            )}
          >
            <AlertTriangle
              className={cn(
                'mt-0.5 size-4 shrink-0',
                tone === 'danger' ? 'text-danger' : 'text-warning',
              )}
              aria-hidden="true"
            />
            <span className="flex-1 text-foreground">{message}</span>

            {/* Una categoría archivada no admite un presupuesto nuevo, así que
                proponer "ajustarlo" llevaría a una acción que la base de datos
                rechaza. Se informa del umbral y nada más. */}
            {item.isArchived ? (
              <span className="text-xs text-muted-foreground">Categoría archivada</span>
            ) : (
              linkToMonth && (
                <Link
                  to={`/budgets?month=${linkToMonth}`}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Ajustar presupuesto
                </Link>
              )
            )}
          </li>
        )
      })}
    </ul>
  )
}
