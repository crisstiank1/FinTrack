/**
 * Estado de progreso de presupuesto. Se reutiliza el vocabulario y los
 * umbrales de `docs/06-presupuestos.md` (vía `@/features/budgets/progress`)
 * para que la aplicación tenga un solo lenguaje de estado, en vez de definir
 * un segundo criterio que podría divergir del de `/budgets`.
 */
export {
  classifyBudgetStatus as classifyProgressStatus,
  type BudgetStatus as ProgressStatus,
} from '@/features/budgets/progress'

export type BillPaymentStatus = 'pagada' | 'parcial' | 'pendiente' | 'vencida' | 'no_aplica'

/**
 * Estado de pago de una línea `bill`. Eje independiente del progreso de
 * presupuesto (docs/09-plan-mensual.md, sección "Estados"). "Hoy" se recibe
 * ya resuelto por quien llama, en la zona horaria del perfil
 * (`profiles.timezone`) — esta función no calcula fechas, solo compara los
 * strings ISO `YYYY-MM-DD` recibidos, que ordenan correctamente como texto.
 */
export function resolveBillPaymentStatus(
  actualMinor: number,
  plannedMinor: number | null,
  dueDateIso: string,
  todayIso: string,
): BillPaymentStatus {
  if (plannedMinor === null) return 'no_aplica'
  if (actualMinor >= plannedMinor) return 'pagada'
  if (actualMinor > 0) return 'parcial'
  return dueDateIso >= todayIso ? 'pendiente' : 'vencida'
}
