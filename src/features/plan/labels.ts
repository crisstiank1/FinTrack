import { classificationGroupLabel } from '@/features/categories/classifications/labels'
import { formatAmount } from '@/lib/currency'
import { formatLongDate } from '@/lib/dates'

import type { AllocationGroup } from './calculations/allocation'
import type { Diff, DiffRowKind } from './calculations/diff'
import type { CategoryLineKind } from './mutations'

/**
 * Textos y tonos del Plan mensual.
 *
 * Aquí viven las reglas de presentación que `docs/09-plan-mensual.md` y
 * `docs/03-ui-ux.md` declaran no negociables, para que ningún componente las
 * reimplemente ni decida por su cuenta qué significa un `null`, un `0` o un
 * negativo. Los componentes llaman a estas funciones; no repiten literales.
 *
 * Solo contiene lo que se renderiza en esta entrega. Los estados de pago, el
 * reparto y la reconciliación traerán los suyos cuando existan.
 */

/** Sin presupuesto aplicable: la diferencia es nula, nunca `0`. */
export const NO_BUDGET_LABEL = 'Sin presupuesto'

/**
 * No hay ingreso planeado con el que comparar. Distinto de «Sobreasignado»:
 * sin referencia no hay exceso que declarar, aunque existan presupuestos en
 * `/budgets`, que viven al margen del plan del mes.
 */
export const NO_PLANNED_INCOME_LABEL = 'Sin ingreso planeado'

/** «Por asignar» negativo se dice en texto, nunca como un negativo desnudo. */
export const OVER_ALLOCATED_LABEL = 'Sobreasignado'

/** Nota fija bajo el resumen. No es un tooltip: se lee siempre. */
export const UNASSIGNED_NOTE = '«Por asignar» compara planes; no es dinero disponible.'

export type PlanTone = 'neutral' | 'positive' | 'negative'

/**
 * Importe planeado tal como se escribe.
 *
 * `null` significa que no hay nada que defina ese plan —ninguna fuente,
 * ninguna línea, ninguna categoría presupuestada— y se dice con palabras. Un
 * `0` es una decisión explícita del usuario y se conserva como `0`: convertirlo
 * en «Sin presupuesto» borraría esa decisión.
 */
export function formatPlannedAmount(plannedMinor: number | null, currencyCode: string): string {
  if (plannedMinor === null) return NO_BUDGET_LABEL
  return formatAmount(plannedMinor, currencyCode)
}

/**
 * Ingreso planeado, y todo lo que se deriva de él.
 *
 * Su ausencia no es «Sin presupuesto»: lo que falta es el ingreso con el que
 * comparar, no un presupuesto de gasto. Distinguirlo importa porque el
 * restante planeado **es** «por asignar», y este es el único sitio donde se
 * decide cómo se dice.
 */
export function formatPlannedIncomeAmount(
  plannedMinor: number | null,
  currencyCode: string,
): string {
  if (plannedMinor === null) return NO_PLANNED_INCOME_LABEL
  return formatAmount(plannedMinor, currencyCode)
}

export const diffStatusLabel: Record<Diff['status'], string> = {
  no_budget: NO_BUDGET_LABEL,
  on_target: 'En objetivo',
  favorable: 'Favorable',
  unfavorable: 'Desfavorable',
}

/** El color solo acompaña al texto; nunca es el único portador del sentido. */
export const diffStatusTone: Record<Diff['status'], PlanTone> = {
  no_budget: 'neutral',
  on_target: 'neutral',
  favorable: 'positive',
  unfavorable: 'negative',
}

/**
 * Diferencia completa: «Favorable por COP 20.000».
 *
 * La igualdad exacta es «En objetivo», ni favorable ni desfavorable, y sin
 * presupuesto se dice «Sin presupuesto» — en ninguno de los dos casos se
 * escribe una cantidad, porque no la hay.
 */
export function formatDiff(diff: Diff, currencyCode: string): string {
  if (diff.status === 'no_budget' || diff.status === 'on_target')
    return diffStatusLabel[diff.status]
  return `${diffStatusLabel[diff.status]} por ${formatAmount(diff.amountMinor, currencyCode)}`
}

export interface UnassignedLabel {
  text: string
  tone: PlanTone
}

/**
 * «Por asignar», con sus tres lecturas:
 *
 * - `null`: no hay ingreso planeado, así que no hay comparación válida.
 * - Negativo: se ha asignado más que el ingreso planeado, y se dice
 *   «Sobreasignado» con la magnitud en positivo.
 * - Cero o positivo: la cifra tal cual. Un `0` significa que el plan está
 *   completo, no que falte información.
 */
export function formatUnassigned(
  unassignedMinor: number | null,
  currencyCode: string,
): UnassignedLabel {
  if (unassignedMinor === null) return { text: NO_PLANNED_INCOME_LABEL, tone: 'neutral' }

  if (unassignedMinor < 0) {
    return {
      text: `${OVER_ALLOCATED_LABEL} por ${formatAmount(-unassignedMinor, currencyCode)}`,
      tone: 'negative',
    }
  }

  return { text: formatAmount(unassignedMinor, currencyCode), tone: 'neutral' }
}

/** Las seis tarjetas del resumen de esta entrega. */
export type PlanSummaryCardId =
  'income' | 'expenses' | 'assigned' | 'unassigned' | 'remaining' | 'savingsContributions'

/**
 * `savingsContributions` es **«Aportes a ahorro»**, el flujo del mes.
 * Nunca «Total ahorrado»: ese nombre se confundiría con el saldo acumulado,
 * que es otra cifra distinta y no entra en esta pantalla
 * (docs/09-plan-mensual.md, «Las tres cifras de ahorro»).
 */
export const planSummaryLabel: Record<PlanSummaryCardId, string> = {
  income: 'Ingreso total',
  expenses: 'Total gastado',
  assigned: 'Presupuesto asignado',
  unassigned: 'Por asignar',
  remaining: 'Restante',
  savingsContributions: 'Aportes a ahorro',
}

/* -------------------------------------------------------------------------- */
/* Facturas y gastos variables                                                */
/* -------------------------------------------------------------------------- */

/*
 * Nombres de los dos tipos de línea medidos por categoría, en todas sus formas.
 * Las variantes —singular, plural, título, frases— son decisiones de redacción
 * y se escriben enteras: no se derivan unas de otras con `toLowerCase()` ni
 * pegando trozos, porque eso rompe en cuanto una cambia de forma distinta.
 *
 * Van antes de `planRowLabel`, que usa el plural: una constante no puede leerse
 * antes de declararse al cargar el módulo.
 */

/**
 * Tipo de una línea medida por categoría, en singular. Única fuente del texto:
 * lo usan el formulario de líneas y la reconciliación.
 */
export const planLineKindLabel: Record<CategoryLineKind, string> = {
  bill: 'Factura',
  variable: 'Gasto variable',
}

/**
 * Los mismos tipos en plural, como grupo: títulos del panel de líneas y filas
 * del cuadro Presupuesto vs. Actual, que así no pueden decir cosas distintas.
 */
export const planLineKindGroupLabel: Record<CategoryLineKind, string> = {
  bill: 'Facturas',
  variable: 'Gastos variables',
}

/** Título del bloque de líneas. También lo nombra la reconciliación. */
export const PLAN_LINES_TITLE = 'Facturas y gastos variables'

/** Filas de la reconciliación con el presupuesto que describe cada tipo de línea. */
export const reconciliationDescribedLabel: Record<CategoryLineKind, string> = {
  bill: 'Descrito en facturas',
  variable: 'Descrito en gastos variables',
}

/** Vacío del bloque de líneas: «septiembre 2026 no tiene facturas ni gastos variables descritos.» */
export function planLinesEmptyLabel(monthLabel: string): string {
  return `${monthLabel} no tiene facturas ni gastos variables descritos.`
}

/** Invitación de la reconciliación para una categoría presupuestada sin línea. */
export const DESCRIBE_FROM_PLAN_LINES_LABEL =
  'Puedes describirla desde Facturas y gastos variables.'

/** Filas del cuadro Presupuesto vs. Actual en esta entrega. */
export type PlanRowId =
  | 'income'
  | 'expensesTotal'
  | 'bills'
  | 'variables'
  | 'unplanned'
  | 'savings'
  | 'investment'
  | 'debt'
  | 'remaining'

export const planRowLabel: Record<PlanRowId, string> = {
  income: 'Ingresos',
  expensesTotal: 'Gastos totales',
  bills: planLineKindGroupLabel.bill,
  variables: planLineKindGroupLabel.variable,
  unplanned: 'No planeado',
  savings: 'Ahorro',
  investment: 'Inversión',
  debt: 'Deuda',
  remaining: 'Restante',
}

/**
 * Filas que se miden contra el ingreso planeado y no contra un presupuesto:
 * los ingresos, y el restante, que es «por asignar» leído al revés.
 *
 * Está en un solo sitio porque la distinción tiene que valer para **todas** las
 * columnas de esas filas. Que el planeado dijera «Sin ingreso planeado» y la
 * diferencia «Sin presupuesto» hacía que una misma fila diera dos versiones de
 * la misma ausencia.
 */
const INCOME_MEASURED_ROWS: readonly PlanRowId[] = ['income', 'remaining']

function isIncomeMeasuredRow(rowId: PlanRowId): boolean {
  return INCOME_MEASURED_ROWS.includes(rowId)
}

/**
 * Filas que se planifican por cuenta, con importe propio en la línea: ahorro e
 * inversión. Su ausencia es «Sin aportes planeados», no «Sin presupuesto»,
 * porque no son presupuestos por categoría de `/budgets`. Mismo criterio que
 * la reconciliación, en planeado y en diferencia.
 */
const CONTRIBUTION_ROWS: readonly PlanRowId[] = ['savings', 'investment']

function isContributionRow(rowId: PlanRowId): boolean {
  return CONTRIBUTION_ROWS.includes(rowId)
}

/**
 * «Planeado» de una fila del cuadro.
 *
 * Ingresos y restante se miden contra el ingreso planeado; ahorro e inversión,
 * contra sus aportes planeados; el resto, contra un presupuesto. Cuando falta,
 * cada uno lo dice a su manera.
 */
export function formatRowPlannedAmount(
  rowId: PlanRowId,
  plannedMinor: number | null,
  currencyCode: string,
): string {
  if (isIncomeMeasuredRow(rowId)) {
    return formatPlannedIncomeAmount(plannedMinor, currencyCode)
  }
  if (isContributionRow(rowId)) {
    return formatContributionPlanned(plannedMinor, currencyCode)
  }
  return formatPlannedAmount(plannedMinor, currencyCode)
}

/**
 * «Diferencia» de una fila del cuadro.
 *
 * `calculateDiff` devuelve `no_budget` siempre que no hay nada que comparar,
 * sin saber por qué falta. Aquí se nombra la causa real de cada fila: en
 * ingresos y restante lo que falta es el ingreso planeado, y en ahorro e
 * inversión, los aportes planeados; no un presupuesto.
 */
export function formatRowDiff(rowId: PlanRowId, diff: Diff, currencyCode: string): string {
  if (diff.status === 'no_budget' && isIncomeMeasuredRow(rowId)) return NO_PLANNED_INCOME_LABEL
  if (diff.status === 'no_budget' && isContributionRow(rowId)) return NO_CONTRIBUTION_PLAN_LABEL
  return formatDiff(diff, currencyCode)
}

/**
 * Tono del restante realmente ocurrido.
 *
 * Negativo significa que salió más dinero del que entró, contando los aportes:
 * es la señal más importante del mes y no debe leerse igual que un sobrante. El
 * signo sigue estando en el texto, así que el color solo acompaña
 * (docs/03-ui-ux.md).
 */
export function remainingTone(remainingActualMinor: number): PlanTone {
  return remainingActualMinor < 0 ? 'negative' : 'neutral'
}

/**
 * Convención de signo de cada fila (docs/09-plan-mensual.md, «Diferencia»).
 *
 * En ingresos, ahorro e inversión, más real que planeado es favorable. En
 * gastos, facturas, variables y deuda, es al revés. El restante sigue la regla
 * de los ingresos: que sobre más de lo planeado es una buena noticia.
 */
export const planRowDiffKind: Record<PlanRowId, DiffRowKind> = {
  income: 'income_like',
  expensesTotal: 'expense_like',
  bills: 'expense_like',
  variables: 'expense_like',
  unplanned: 'expense_like',
  savings: 'income_like',
  investment: 'income_like',
  debt: 'expense_like',
  remaining: 'income_like',
}

/**
 * Los dos grupos del cuadro, y por qué están separados: las filas del desglose
 * suman Gastos totales; las indicadoras no forman parte de esa suma. La
 * separación es semántica, no decorativa.
 */
export type PlanRowGroupId = 'income' | 'breakdown' | 'indicators'

export const planRowGroupLabel: Record<PlanRowGroupId, string> = {
  income: 'Ingresos',
  breakdown: 'Desglose de gastos',
  indicators: 'Indicadores',
}

export const planRowGroupNote: Record<PlanRowGroupId, string | null> = {
  income: null,
  breakdown: 'Facturas, gastos variables y no planeado suman los gastos totales.',
  indicators: 'No forman parte de los gastos totales: se miden aparte.',
}

/* -------------------------------------------------------------------------- */
/* Reparto 50/30/20                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Los cinco destinos del ingreso. El orden lo fija `ALLOCATION_GROUPS`.
 *
 * Los tres que también se clasifican por categoría se toman de
 * `features/categories/classifications`, que es su módulo dueño, en vez de
 * repetir aquí las mismas cadenas: dos copias divergirían en cuanto alguien
 * renombrase una. Ahorro e inversión sí son propios del reparto, porque no se
 * clasifican por categoría sino que se miden por transferencias.
 */
export const allocationGroupLabel: Record<AllocationGroup, string> = {
  ...classificationGroupLabel,
  savings: 'Ahorro',
  investment: 'Inversión',
}

/**
 * Convención de signo por grupo.
 *
 * Necesidades, deseos y deuda son gasto: quedarse por debajo de lo asignado es
 * favorable. Ahorro e inversión son aportes: superar lo asignado lo es.
 */
export const allocationGroupDiffKind: Record<AllocationGroup, DiffRowKind> = {
  needs: 'expense_like',
  wants: 'expense_like',
  savings: 'income_like',
  investment: 'income_like',
  debt: 'expense_like',
}

/**
 * Gasto de categorías sin clasificar. **No es un grupo del reparto**: es una
 * fila aparte que nunca entra en la suma, porque asignarlo en silencio
 * falsearía el mes entero (docs/09-plan-mensual.md).
 */
export const UNCLASSIFIED_LABEL = 'Sin clasificar'

/** El mes no tiene porcentajes guardados. No es un error: es un mes sin plan. */
export const NO_ALLOCATION_LABEL = 'Sin reparto configurado'

/** Hay reparto, pero este grupo no tiene porcentaje propio. */
export const NO_PERCENT_LABEL = 'Sin definir'

/**
 * Nota fija del bloque. Explica la diferencia que más confunde de estas
 * plantillas: el reparto mide destinos del ingreso, no gastos.
 */
export const ALLOCATION_NOTE =
  'Los cinco grupos no suman los gastos totales: ahorro e inversión son transferencias registradas, no gastos.'

/** Aviso cuando hay gasto sin clasificar. Se explica, no se reparte. */
export const UNCLASSIFIED_NOTE =
  'Este gasto no entra en ningún grupo mientras su categoría no esté clasificada.'

const percentFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

/** Puntos base como porcentaje legible: 5000 → «50 %». */
export function formatBasisPoints(basisPoints: number | null): string {
  if (basisPoints === null) return NO_PERCENT_LABEL
  return `${percentFormatter.format(basisPoints / 100)} %`
}

/**
 * Importe asignado a un grupo.
 *
 * Sin importe hay dos causas distintas, y se dicen distinto: o el mes no tiene
 * reparto, o lo tiene pero no hay ingreso planeado que repartir. Nunca un `0`,
 * que fingiría un reparto que nadie configuró.
 */
export function formatAllocationPlanned(
  plannedMinor: number | null,
  hasAllocation: boolean,
  currencyCode: string,
): string {
  if (plannedMinor !== null) return formatAmount(plannedMinor, currencyCode)
  return hasAllocation ? NO_PLANNED_INCOME_LABEL : NO_ALLOCATION_LABEL
}

/** Diferencia de un grupo, nombrando la misma causa que su importe asignado. */
export function formatAllocationDiff(
  diff: Diff,
  hasAllocation: boolean,
  currencyCode: string,
): string {
  if (diff.status === 'no_budget') {
    return hasAllocation ? NO_PLANNED_INCOME_LABEL : NO_ALLOCATION_LABEL
  }
  return formatDiff(diff, currencyCode)
}

/**
 * Aviso cuando el reparto guardado trae un grupo fuera del contrato.
 *
 * `buildAllocationPercentages` los descarta para no enviarlos al cálculo, y
 * eso puede dejar la suma por debajo del 100 %: quien lo lee tiene derecho a
 * saberlo. `null` cuando no hay nada que avisar.
 */
export function ignoredAllocationGroupsNote(ignoredGroups: readonly string[]): string | null {
  if (ignoredGroups.length === 0) return null

  const listado = ignoredGroups.join(', ')
  return ignoredGroups.length === 1
    ? `El reparto guardado incluye un grupo que no existe (${listado}); se descarta, así que los porcentajes pueden no sumar 100 %.`
    : `El reparto guardado incluye grupos que no existen (${listado}); se descartan, así que los porcentajes pueden no sumar 100 %.`
}

/* -------------------------------------------------------------------------- */
/* Reconciliación del presupuesto                                             */
/* -------------------------------------------------------------------------- */

/**
 * Aportes a ahorro o inversión sin línea que los planifique.
 *
 * No es «Sin presupuesto»: los aportes se planifican por cuenta, con importe
 * propio en la línea, y no son presupuestos por categoría de `/budgets`.
 */
export const NO_CONTRIBUTION_PLAN_LABEL = 'Sin aportes planeados'

/** Aporte planeado. Un `0` guardado en la línea se conserva como `0`. */
export function formatContributionPlanned(
  plannedMinor: number | null,
  currencyCode: string,
): string {
  if (plannedMinor === null) return NO_CONTRIBUTION_PLAN_LABEL
  return formatAmount(plannedMinor, currencyCode)
}

/*
 * Presupuesto vigente de 0 («Presupuesto en COP 0»): una decisión explícita del
 * usuario en `/budgets`. `buildBudgetProgress` no calcula umbrales contra 0,
 * pero la causa importa: una categoría que nunca tuvo presupuesto invita a
 * completarlo, y una con 0 ya lo tiene. Se reexporta el texto de `/budgets`
 * para que las dos pantallas digan lo mismo del mismo presupuesto.
 */
export { formatZeroBudget } from '@/features/budgets/labels'

/**
 * Presupuesto de una línea mientras su progreso todavía no llegó.
 *
 * No se escribe «Sin presupuesto» ni «Gastado COP 0»: aún no se sabe, y
 * cualquiera de los dos afirmaría algo que puede ser falso.
 */
export const LINE_BUDGET_LOADING_LABEL = 'Calculando presupuesto…'

/**
 * Categoría archivada sin presupuesto: `/budgets` rechaza estrenar uno, así que
 * no se invita a completarlo. Lo usan el panel de líneas y la reconciliación.
 */
export const ARCHIVED_NO_NEW_BUDGETS_LABEL = 'Categoría archivada: no admite presupuestos nuevos.'

export interface ReconciliationHeadline {
  /** Titular del bloque, visible también con el bloque plegado. */
  title: string
  detail: string
  tone: PlanTone
}

export interface ReconciliationHeadlineInput {
  assignedMinor: number
  /** `null` cuando el mes no tiene ninguna fuente de ingreso. */
  incomePlannedMinor: number | null
  /** `porAsignar` de `summarizeAllocation`; `null` sin ingreso planeado. */
  unassignedMinor: number | null
}

/**
 * Titular de la reconciliación, con sus tres lecturas:
 *
 * - Sin ingreso planeado: solo lo asignado, y la ausencia dicha con palabras.
 * - Sobreasignado: el exceso **es** el titular, en positivo y en texto.
 * - Si no: «Asignado A de I» y lo que queda por asignar, que puede ser `0`.
 *
 * Una fuente de 0 es ingreso planeado: se compara contra COP 0, y cualquier
 * asignación la supera. No recalcula `porAsignar`; lo recibe ya resuelto.
 */
export function reconciliationHeadline(
  { assignedMinor, incomePlannedMinor, unassignedMinor }: ReconciliationHeadlineInput,
  currencyCode: string,
): ReconciliationHeadline {
  const assigned = `Asignado ${formatAmount(assignedMinor, currencyCode)}`

  if (incomePlannedMinor === null || unassignedMinor === null) {
    return { title: assigned, detail: NO_PLANNED_INCOME_LABEL, tone: 'neutral' }
  }

  const ofIncome = `${assigned} de ${formatAmount(incomePlannedMinor, currencyCode)}`
  const unassigned = formatUnassigned(unassignedMinor, currencyCode)

  if (unassignedMinor < 0) {
    return {
      title: unassigned.text,
      detail: `${ofIncome}. Se asignó más que el ingreso planeado.`,
      tone: unassigned.tone,
    }
  }

  return { title: ofIncome, detail: `Por asignar: ${unassigned.text}`, tone: 'neutral' }
}

/** «1 categoría con presupuesto sin línea» / «0 categorías con presupuesto sin línea». */
export function unlinkedCategoriesCountLabel(count: number): string {
  return count === 1
    ? '1 categoría con presupuesto sin línea'
    : `${count} categorías con presupuesto sin línea`
}

/** «1 línea sin presupuesto» / «5 líneas sin presupuesto». No incluye las de 0 explícito. */
export function linesWithoutBudgetCountLabel(count: number): string {
  return count === 1 ? '1 línea sin presupuesto' : `${count} líneas sin presupuesto`
}

/** «1 línea con presupuesto en COP 0». Solo se muestra cuando hay alguna. */
export function linesWithZeroBudgetCountLabel(count: number, currencyCode: string): string {
  const zero = formatAmount(0, currencyCode)
  return count === 1
    ? `1 línea con presupuesto en ${zero}`
    : `${count} líneas con presupuesto en ${zero}`
}

/* -------------------------------------------------------------------------- */
/* Ahorro e inversión                                                         */
/**
 * Aviso de lo que el Plan deja fuera por estar en otra moneda: ingresos, gastos
 * y aportes (ver `scopePlanMonthToCurrency`). `null` si no falta nada.
 */
export function excludedMovementsNote(exclusions: {
  count: number
  currencyCodes: readonly string[]
}): string | null {
  if (exclusions.count === 0) return null

  const codes = exclusions.currencyCodes.join(', ')
  return exclusions.count === 1
    ? `1 movimiento en otra moneda (${codes}) no se incluye en este Plan.`
    : `${exclusions.count} movimientos en otras monedas (${codes}) no se incluyen en este Plan.`
}

/* -------------------------------------------------------------------------- */

/*
 * Dos cifras por tipo de cuenta, y nunca con el mismo nombre: los **aportes del
 * mes** son un flujo y el **saldo en cuentas** es un stock
 * (docs/09-plan-mensual.md, «Las tres cifras de ahorro»). Por eso aquí no hay
 * «Total ahorrado», ni «Ahorrado» a secas, ni «Dinero disponible».
 */

export const SAVINGS_INVESTMENT_TITLE = 'Ahorro e inversión'

/** Nota fija del bloque. No es un tooltip: se lee siempre. */
export const SAVINGS_INVESTMENT_NOTE =
  'Los aportes son transferencias registradas en el mes hacia tus cuentas de ahorro o inversión. El saldo es lo acumulado en esas cuentas y no se suma a las cifras del mes.'

export type ContributionAccountType = 'savings' | 'investment'

export interface ContributionBlockLabels {
  title: string
  contributions: string
  balance: string
  /** No existe ninguna cuenta del tipo. Distinto de un saldo de 0. */
  noAccounts: string
  createAccount: string
}

export const contributionBlockLabel: Record<ContributionAccountType, ContributionBlockLabels> = {
  savings: {
    title: 'Ahorro',
    contributions: 'Aportes a ahorro del mes',
    balance: 'Saldo en cuentas de ahorro',
    noAccounts: 'Sin cuentas de ahorro',
    createAccount: 'Crear una cuenta de ahorro',
  },
  investment: {
    title: 'Inversión',
    contributions: 'Aportes a inversión del mes',
    balance: 'Saldo en cuentas de inversión',
    noAccounts: 'Sin cuentas de inversión',
    createAccount: 'Crear una cuenta de inversión',
  },
}

/** El saldo todavía no llegó. No se escribe un 0 que aún no se sabe. */
export const BALANCE_LOADING_LABEL = 'Calculando saldo…'

/**
 * Cuentas del tipo en otra moneda: su saldo no entra en el del Plan, que no
 * convierte divisas.
 */
export function otherCurrencyAccountsNote(count: number): string {
  return count === 1
    ? '1 cuenta en otra moneda no se suma'
    : `${count} cuentas en otra moneda no se suman`
}

/** Falló solo el saldo: el resto del bloque y de la pantalla sigue siendo válido. */
export const BALANCE_ERROR_LABEL = 'No pudimos calcular el saldo.'

/**
 * Pie del saldo: «Al 30 de septiembre de 2026 · 2 cuentas · 1 archivada».
 *
 * La fecha dice a qué día corresponde el stock, con el mismo formato que el
 * dashboard. Las archivadas solo se nombran cuando hay alguna: están sumadas en
 * el saldo, y quien lo lee tiene derecho a saberlo.
 */
export function accountTypeBalanceCaption(
  asOfDate: string,
  accountCount: number,
  archivedCount: number,
): string {
  const parts = [
    `Al ${formatLongDate(asOfDate)}`,
    accountCount === 1 ? '1 cuenta' : `${accountCount} cuentas`,
  ]
  if (archivedCount > 0) {
    parts.push(archivedCount === 1 ? '1 archivada' : `${archivedCount} archivadas`)
  }
  return parts.join(' · ')
}

/** Un saldo negativo se destaca; el signo sigue estando en el texto. */
export function balanceTone(balanceMinor: number): PlanTone {
  return balanceMinor < 0 ? 'negative' : 'neutral'
}

/* -------------------------------------------------------------------------- */
/* Líneas de aporte                                                           */
/* -------------------------------------------------------------------------- */

/*
 * Textos de las líneas de aporte planeado, dentro de cada tarjeta del bloque
 * «Ahorro e inversión». Siempre dicen «aporte»: una línea de aporte no es un
 * gasto y no vive en «Facturas y gastos variables». Frases completas, como el
 * resto del archivo.
 */

export interface ContributionLineLabels {
  /** Nombre accesible de la lista de líneas del tipo. */
  list: string
  addButton: string
  dialogTitleNew: string
  accountField: string
  /** No existe ninguna cuenta activa del tipo: no se puede planificar. */
  noAccounts: string
  /** Todas las cuentas activas del tipo ya tienen un aporte este mes (U11). */
  accountsExhausted: string
}

export const contributionLineLabel: Record<ContributionAccountType, ContributionLineLabels> = {
  savings: {
    list: 'Aportes a ahorro planeados',
    addButton: 'Añadir aporte a ahorro',
    dialogTitleNew: 'Nuevo aporte a ahorro',
    accountField: 'Cuenta de ahorro',
    noAccounts: 'Necesitas una cuenta de ahorro para planificar un aporte.',
    accountsExhausted: 'Todas tus cuentas de ahorro ya tienen un aporte planeado este mes.',
  },
  investment: {
    list: 'Aportes a inversión planeados',
    addButton: 'Añadir aporte a inversión',
    dialogTitleNew: 'Nuevo aporte a inversión',
    accountField: 'Cuenta de inversión',
    noAccounts: 'Necesitas una cuenta de inversión para planificar un aporte.',
    accountsExhausted: 'Todas tus cuentas de inversión ya tienen un aporte planeado este mes.',
  },
}

export const CONTRIBUTION_LINE_NAME_LABEL = 'Nombre'

export const CONTRIBUTION_LINE_NAME_PLACEHOLDER = 'Ej. Fondo de emergencia'

export const CONTRIBUTION_LINE_AMOUNT_LABEL = 'Importe planeado'

/** Marca de una línea cuya cuenta se archivó después de crearla. */
export const ARCHIVED_ACCOUNT_BADGE = 'Archivada'

/**
 * Marca de una línea cuya cuenta está en otra moneda. Su importe planeado sigue
 * contando, porque es una cifra escrita en la moneda del Plan; su aporte real
 * no, porque llega en la moneda de la cuenta.
 */
export function otherCurrencyContributionLineLabel(currencyCode: string): string {
  return `Cuenta en ${currencyCode}: su aporte real no se cuenta`
}

/** Al editar, la cuenta se enuncia en vez de ofrecerse: cambiarla es otro aporte. */
export function lockedContributionAccountLabel(accountName: string): string {
  return `Cuenta: ${accountName}. Para cambiarla, elimina el aporte y crea otro.`
}

export const DELETE_CONTRIBUTION_TITLE = 'Eliminar aporte'

export const DELETE_CONTRIBUTION_DESCRIPTION =
  'Se eliminará el aporte planeado. La cuenta y sus movimientos no se tocan.'
