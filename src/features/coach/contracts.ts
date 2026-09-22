/**
 * Contratos de datos de FinTrack Coach.
 *
 * Solo tipos: este módulo no ejecuta nada, no consulta Supabase y no define
 * todavía ninguna API pública. Su función es fijar por escrito qué forma tienen
 * las salidas de las herramientas descritas en `docs/13-coach-fase-0.md` §3,
 * para que el día que exista la Edge Function no haya que inventarlas ni, peor,
 * dejar que el modelo dependa de nombres de tablas y columnas.
 *
 * Hay dos niveles y la frontera entre ellos es lo que protege al usuario:
 *
 * 1. **Salidas de herramienta** (`PeriodSummary`, `SpendingByCategory`,
 *    `BudgetStatus`, `CategoryDelta`, `CashflowStatus`, `CurrencyContext`).
 *    Son internas del backend. Conservan `categoryId` porque el frontend lo
 *    necesita para llevar al usuario a la pantalla correcta.
 * 2. **`CoachContextSnapshot`**, lo único que puede salir hacia el proveedor de
 *    IA. Indexa las categorías como `c1`, `c2`… y los presupuestos como `b1`,
 *    `b2`…, sin un solo identificador.
 *
 * Ninguno de los dos niveles admite descripciones de movimientos, notas,
 * nombres de cuenta, correos, tokens ni movimientos sin agregar. La lista
 * completa está en `docs/13-coach-fase-0.md` §5.
 *
 * Todos los importes son enteros en la unidad mínima **de su moneda**: pesos
 * para COP (exponente 0), centavos para USD, ARS, EUR y MXN (exponente 2). Por
 * eso cada contrato lleva su `currencyCode`: sin él, `4599` no significa nada.
 * Nadie los reescala por el camino; el frontend los renderiza con
 * `formatAmount`, que es el único sitio que aplica el exponente.
 */

import type { BudgetStatus as BudgetStatusKind } from '@/features/budgets/progress'

import type { CategoryDelta } from '../dashboard/comparison'

export type { CategoryDelta }

/* -------------------------------------------------------------------------- */
/* Piezas comunes                                                             */
/* -------------------------------------------------------------------------- */

/** Período analizado. Lo resuelve el backend con `profiles.timezone`, nunca el modelo. */
export interface CoachPeriod {
  /** 'YYYY-MM'. */
  monthKey: string
  /** Primer día del mes, 'YYYY-MM-DD'. */
  startDate: string
  /** Último día del mes, 'YYYY-MM-DD'. */
  endDate: string
  /** 'septiembre 2026', ya formateado para que el modelo no construya fechas. */
  label: string
}

/** Métrica del período con su equivalente del período anterior. */
export interface MetricChange {
  currentMinor: number
  previousMinor: number
  /** `null` cuando la base es 0: "creció un ∞ %" no informa de nada. */
  deltaPercent: number | null
}

/** Lo que queda fuera por estar en otra moneda. FinTrack no convierte divisas. */
export interface CurrencyExclusionSummary {
  count: number
  currencyCodes: string[]
}

/* -------------------------------------------------------------------------- */
/* Salidas de herramienta                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Monedas del usuario y cuál se está usando.
 *
 * Se resuelve antes que cualquier otra herramienta: con más de una moneda y sin
 * elección del usuario, el Coach pregunta en vez de mezclar.
 */
export interface CurrencyContext {
  /** Monedas en las que el usuario tiene cuentas, la principal primero. */
  currencyCodes: string[]
  /** La que usaría la interfaz para este usuario. */
  presentationCurrency: string
  /** `true` cuando hay varias monedas y el usuario no ha elegido una. */
  requiresCurrencyChoice: boolean
  balances: { currencyCode: string; balanceMinor: number }[]
}

/** Resumen del período: lo que hoy muestra el Dashboard. */
export interface PeriodSummary {
  period: CoachPeriod
  comparedTo: CoachPeriod
  currencyCode: string
  income: MetricChange
  expense: MetricChange
  netSavings: MetricChange
  /** Saldo consolidado al cierre de cada mes. */
  balance: MetricChange
  savingsRate: {
    /** Porcentaje, o `null` si no hubo ingresos. */
    current: number | null
    previous: number | null
    /** Diferencia en puntos porcentuales, no en porcentaje sobre porcentaje. */
    deltaPoints: number | null
  }
  transactionCount: number
}

export interface SpendingCategorySlice {
  categoryId: string
  categoryName: string
  amountMinor: number
  /** Proporción sobre el gasto total del período, entre 0 y 1. */
  share: number
}

/** Reparto del gasto del período por categoría, de mayor a menor. */
export interface SpendingByCategory {
  period: CoachPeriod
  currencyCode: string
  totalMinor: number
  categories: SpendingCategorySlice[]
}

export interface BudgetStatusLine {
  categoryId: string
  categoryName: string
  /** `null` sin presupuesto aplicable o con un 0 explícito. */
  budgetMinor: number | null
  spentMinor: number
  remainingMinor: number | null
  /** Proporción gastada (1 = 100 %). `null` sin presupuesto: no se divide entre 0. */
  ratio: number | null
  status: BudgetStatusKind
  /**
   * De dónde salió el presupuesto. `'exception'` y `'template'` con un
   * `budgetMinor` nulo significan un 0 deliberado, que no es lo mismo que no
   * haber configurado nunca esa categoría.
   */
  source: 'exception' | 'template' | null
}

export interface BudgetStatus {
  period: CoachPeriod
  currencyCode: string
  lines: BudgetStatusLine[]
}

/** Flujo de caja del período: si se gastó más de lo que entró. */
export interface CashflowStatus {
  period: CoachPeriod
  currencyCode: string
  incomeMinor: number
  expenseMinor: number
  netSavingsMinor: number
  /**
   * Única alerta del período. "Ahorro neto negativo" y "gastos mayores que
   * ingresos" son la misma condición y se emiten una sola vez.
   */
  alert: 'negative_net_savings' | null
}

/* -------------------------------------------------------------------------- */
/* Snapshot: lo único que puede salir hacia el proveedor de IA                 */
/* -------------------------------------------------------------------------- */

/**
 * Categoría del snapshot. Sin identificador: la referencia es su clave (`c1`).
 *
 * `percentage` va ya en porcentaje (28.4), no en proporción, a diferencia del
 * `share` de `SpendingCategorySlice`, que conserva el 0..1 que devuelve el
 * dominio. La conversión se hace una vez, aquí, para que la interfaz no tenga
 * que multiplicar por 100 al renderizar y no haya dos convenios conviviendo en
 * la misma pantalla.
 */
export interface SnapshotCategory {
  name: string
  amount: number
  percentage: number
}

/** Presupuesto del snapshot. Sin identificador: la referencia es su clave (`b1`). */
export interface SnapshotBudget {
  name: string
  budget: number | null
  spent: number
  remaining: number | null
  status: BudgetStatusKind
}

/** Variación por categoría, ya sin identificador. */
export interface SnapshotCategoryDelta {
  name: string
  current: number
  previous: number
  difference: number
  differencePercent: number | null
}

/**
 * Contexto agregado que recibe el modelo.
 *
 * El modelo no escribe cifras: cita rutas de este objeto —
 * `{{summary.expense.current}}`, `{{categories.c1.name}}`— y el frontend las
 * resuelve y las formatea. De ahí que las claves sean cortas y estables: son
 * parte del contrato con el prompt, no un detalle interno.
 */
export interface CoachContextSnapshot {
  /** Versión del formato, para poder cambiarlo sin romper prompts antiguos. */
  version: 'v1'
  period: Pick<CoachPeriod, 'label' | 'startDate' | 'endDate'>
  comparedTo: Pick<CoachPeriod, 'label' | 'startDate' | 'endDate'>
  currency: string
  summary?: {
    income: MetricChange
    expense: MetricChange
    netSavings: MetricChange
    savingsRate: PeriodSummary['savingsRate']
  }
  /** Indexadas `c1`, `c2`… por orden de gasto descendente. */
  categories?: Record<string, SnapshotCategory>
  /** Indexadas `d1`, `d2`… por variación descendente. */
  categoryDeltas?: Record<string, SnapshotCategoryDelta>
  /** Indexados `b1`, `b2`… */
  budgets?: Record<string, SnapshotBudget>
  cashflow?: Pick<CashflowStatus, 'incomeMinor' | 'expenseMinor' | 'netSavingsMinor' | 'alert'>
  exclusions: CurrencyExclusionSummary
}
