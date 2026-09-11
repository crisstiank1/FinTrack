import type { TransactionForCalculation } from '@/lib/calculations'

import {
  ALLOCATION_GROUPS,
  type AllocationGroup,
  type AllocationPercentages,
} from './calculations/allocation'
import type { TransferContributionCandidate } from './calculations/contributions'
import type { ExpenseClassificationGroup, PlanExpenseTransaction } from './calculations/expenses'
import type { PlanIncomeSourceInput, PlanLineAmountInput } from './calculations/reconciliation'

/**
 * Adaptación entre las filas que devuelve la base de datos y los contratos de
 * `calculations/`.
 *
 * Existe por tres motivos, y ninguno es de negocio:
 *
 * 1. **Estrechamiento.** `database.types.ts` expone cada columna `text` como
 *    `string`, mientras la capa pura trabaja con uniones cerradas. Qué hacer
 *    con un valor inesperado es una decisión con consecuencias visibles, así
 *    que vive en un sitio probado y no diluida dentro de una hook con red y
 *    caché.
 * 2. **Relaciones entre filas.** `contributions.ts` declara explícitamente
 *    fuera de su alcance emparejar las dos patas de una transferencia: «quien
 *    llama resuelve el emparejamiento por `transfer_group_id` y el tipo de
 *    ambas cuentas antes de pasarlo aquí».
 * 3. **Atribución.** El ingreso por fuente reparte movimientos entre fuentes a
 *    través del puente de categorías. Es un reparto, no una fórmula.
 *
 * Ninguna fórmula del Plan mensual se define aquí. La única función que suma
 * dinero es `buildIncomeActualBySource`, y lo hace conservando exactamente el
 * total que devuelve `calculateMonthlyIncome`: reparte `ingresoActual`, no lo
 * recalcula (docs/09-plan-mensual.md).
 *
 * Todo lo de este archivo es puro: ni red, ni caché, ni fechas del sistema.
 *
 * Las filas de entrada se declaran con los campos mínimos que cada función
 * lee, igual que `budgets/resolution.ts` y `calculations/expenses.ts`, para
 * que la lógica sea comprobable sin depender del esquema aplicado. Las filas
 * de `database.types.ts` las satisfacen estructuralmente.
 */

/* -------------------------------------------------------------------------- */
/* Estrechamiento de uniones                                                  */
/* -------------------------------------------------------------------------- */

/*
 * En todas las guardas, el `as readonly string[]` amplía el tipo del **array**,
 * no el del valor: el valor sigue comprobándose contra la lista real. Es lo
 * contrario de un cast sobre el valor, que se saltaría la comprobación.
 */

/** `plan_allocations.budget_group`: los cinco grupos del reparto. */
export function isAllocationGroup(value: string): value is AllocationGroup {
  return (ALLOCATION_GROUPS as readonly string[]).includes(value)
}

const EXPENSE_CLASSIFICATION_GROUPS = ['needs', 'wants', 'debt'] as const

/** `category_classifications.budget_group`: solo tres valores (C10). */
export function isExpenseClassificationGroup(value: string): value is ExpenseClassificationGroup {
  return (EXPENSE_CLASSIFICATION_GROUPS as readonly string[]).includes(value)
}

export const PLAN_LINE_KINDS = ['bill', 'variable', 'savings', 'investment'] as const

export type PlanLineKind = (typeof PLAN_LINE_KINDS)[number]

/** `plan_lines.kind`. No existe `debt`: la deuda es una clasificación de categoría. */
export function isPlanLineKind(value: string): value is PlanLineKind {
  return (PLAN_LINE_KINDS as readonly string[]).includes(value)
}

const TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const

type TransactionType = (typeof TRANSACTION_TYPES)[number]

function isTransactionType(value: string): value is TransactionType {
  return (TRANSACTION_TYPES as readonly string[]).includes(value)
}

const TRANSFER_DIRECTIONS = ['incoming', 'outgoing'] as const

type TransferDirection = (typeof TRANSFER_DIRECTIONS)[number]

function isTransferDirection(value: string | null): value is TransferDirection {
  return value !== null && (TRANSFER_DIRECTIONS as readonly string[]).includes(value)
}

/* -------------------------------------------------------------------------- */
/* Filas de entrada                                                           */
/* -------------------------------------------------------------------------- */

/** Movimiento visto por categoría: el ingreso por fuente y el gasto del mes. */
export interface PlanCategorizedTransaction {
  type: string
  category_id: string | null
  amount_minor: number
}

/** Movimiento visto por cuenta, para el saldo acumulado de un tipo de cuenta. */
export interface PlanBalanceTransaction {
  type: string
  transfer_direction: string | null
  account_id: string
  amount_minor: number
}

/** Una pata de transferencia, tal como llega de `transactions`. */
export interface PlanTransferLeg {
  type: string
  transfer_direction: string | null
  transfer_group_id: string | null
  account_id: string
  amount_minor: number
}

/** Cuenta vista solo como portadora de un tipo, para emparejar transferencias. */
export interface PlanAccountTypeRow {
  id: string
  type: string
}

export interface CategoryClassificationRow {
  category_id: string
  budget_group: string
}

export interface PlanAllocationRow {
  budget_group: string
  percent_bp: number
}

export interface PlanLineRow {
  id: string
  kind: string
  category_id: string | null
  planned_minor: number | null
}

export interface PlanIncomeSourceRow {
  planned_minor: number
}

export interface PlanIncomeSourceCategoryRow {
  plan_income_source_id: string
  category_id: string
}

/* -------------------------------------------------------------------------- */
/* Adaptadores a los contratos de calculations/                               */
/* -------------------------------------------------------------------------- */

/**
 * Movimientos del mes con el `type` estrechado, para las dos particiones del
 * gasto.
 *
 * Una fila con un `type` desconocido se descarta, y es neutral: no siendo
 * `income` ni `expense` tampoco habría entrado en ninguna suma. El CHECK de
 * `transactions` hace el caso inalcanzable.
 */
export function toPlanExpenseTransactions(
  rows: PlanCategorizedTransaction[],
): PlanExpenseTransaction[] {
  const result: PlanExpenseTransaction[] = []

  for (const row of rows) {
    if (!isTransactionType(row.type)) continue
    result.push({
      type: row.type,
      category_id: row.category_id,
      amount_minor: row.amount_minor,
    })
  }

  return result
}

/**
 * Movimientos con `type` y `transfer_direction` estrechados, para
 * `calculateBalanceForAccountType` (`saldoEnAhorro`).
 *
 * Una transferencia sin dirección reconocible se **descarta** en vez de
 * pasarse tal cual: `signedAmountMinor` trata como saliente todo lo que no sea
 * `incoming`, así que una fila así restaría del saldo en silencio. Descartarla
 * deja el saldo honesto, y `transactions_transfer_consistency_check` hace el
 * caso inalcanzable.
 *
 * En ingresos y gastos la dirección se normaliza a `null`, que es lo que ese
 * mismo CHECK garantiza.
 */
export function toBalanceTransactions(rows: PlanBalanceTransaction[]): TransactionForCalculation[] {
  const result: TransactionForCalculation[] = []

  for (const row of rows) {
    if (!isTransactionType(row.type)) continue

    if (row.type === 'transfer') {
      if (!isTransferDirection(row.transfer_direction)) continue
      result.push({
        type: row.type,
        transfer_direction: row.transfer_direction,
        account_id: row.account_id,
        amount_minor: row.amount_minor,
      })
      continue
    }

    result.push({
      type: row.type,
      transfer_direction: null,
      account_id: row.account_id,
      amount_minor: row.amount_minor,
    })
  }

  return result
}

/** `ingresoPlaneado`: adapta las fuentes al contrato de `sumPlannedIncome`. */
export function toPlannedIncomeSources(rows: PlanIncomeSourceRow[]): PlanIncomeSourceInput[] {
  return rows.map((row) => ({ plannedMinor: row.planned_minor }))
}

/**
 * `ahorroPlan` / `inversionPlan`: adapta las líneas del eje cuenta al contrato
 * de `sumPlannedLineAmounts`.
 *
 * Una línea sin `planned_minor` se omite en vez de contarse como 0. Para el
 * total da lo mismo, pero omitirla no afirma que el usuario planeara cero. C7
 * garantiza que el eje cuenta siempre lleva importe.
 */
export function toPlannedLineAmounts(
  lines: Pick<PlanLineRow, 'planned_minor'>[],
): PlanLineAmountInput[] {
  const result: PlanLineAmountInput[] = []

  for (const line of lines) {
    if (line.planned_minor === null) continue
    result.push({ plannedMinor: line.planned_minor })
  }

  return result
}

/* -------------------------------------------------------------------------- */
/* Mapas de configuración                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Clasificación por categoría, para `groupExpensesByClassification`.
 *
 * Un `budget_group` desconocido se omite del mapa, de modo que el gasto de esa
 * categoría cae en «Sin clasificar»: la fila visible que el documento exige
 * como comportamiento por defecto, nunca una asignación adivinada
 * (docs/09-plan-mensual.md, «Clasificación de categorías»). C10 hace el caso
 * inalcanzable.
 *
 * Si una categoría apareciera dos veces, gana la primera fila. U1 lo impide;
 * el criterio existe solo para que el resultado sea determinista.
 */
export function buildClassificationMap(
  rows: CategoryClassificationRow[],
): Partial<Record<string, ExpenseClassificationGroup>> {
  const map: Partial<Record<string, ExpenseClassificationGroup>> = {}

  for (const row of rows) {
    if (row.category_id in map) continue
    if (!isExpenseClassificationGroup(row.budget_group)) continue
    map[row.category_id] = row.budget_group
  }

  return map
}

export interface AllocationPercentagesResult {
  percentages: AllocationPercentages
  /**
   * Grupos descartados por no ser uno de los cinco del reparto. Una lista no
   * vacía significa que `percentages` puede no sumar 10 000, es decir que se
   * rompió la precondición de `resolveAllocation`: quien llama decide qué
   * mostrar y no debe tratarlo como un reparto válido.
   */
  ignoredGroups: string[]
}

/**
 * Porcentajes del reparto, para `resolveAllocation`.
 *
 * Un grupo desconocido no se envía al cálculo: entraría como una parte del
 * ingreso sin destino real. Se descarta y se **informa de forma explícita** en
 * `ignoredGroups`, en vez de anotarlo en una consola que nadie lee. T4 y el
 * CHECK de `budget_group` hacen el caso inalcanzable.
 *
 * Ante un grupo repetido gana la primera fila; U5 lo impide.
 */
export function buildAllocationPercentages(rows: PlanAllocationRow[]): AllocationPercentagesResult {
  const percentages: AllocationPercentages = {}
  const ignoredGroups: string[] = []

  for (const row of rows) {
    if (!isAllocationGroup(row.budget_group)) {
      ignoredGroups.push(row.budget_group)
      continue
    }
    if (percentages[row.budget_group] !== undefined) continue
    percentages[row.budget_group] = row.percent_bp
  }

  return { percentages, ignoredGroups }
}

/* -------------------------------------------------------------------------- */
/* Líneas de plan                                                             */
/* -------------------------------------------------------------------------- */

export interface PlanLinePartition<T> {
  bills: T[]
  variables: T[]
  savings: T[]
  investments: T[]
  /**
   * Líneas con un `kind` fuera del contrato. No se clasifican como factura ni
   * como nada más por defecto: describirían un gasto que nadie planeó así.
   * Quien llama decide si avisar.
   */
  unknownKindLineIds: string[]
}

/**
 * Reparte las líneas del mes por `kind`.
 *
 * Genérica sobre la fila completa, igual que `selectBudgetCategories`, para
 * que quien llama conserve las columnas que solo necesita la interfaz
 * (`name`, `due_date`, `position`) sin que este archivo tenga que conocerlas.
 *
 * El orden de entrada se conserva: la lectura ordena por `position`, que U12
 * hace único dentro del mes.
 */
export function partitionPlanLines<T extends PlanLineRow>(lines: T[]): PlanLinePartition<T> {
  const partition: PlanLinePartition<T> = {
    bills: [],
    variables: [],
    savings: [],
    investments: [],
    unknownKindLineIds: [],
  }

  for (const line of lines) {
    if (!isPlanLineKind(line.kind)) {
      partition.unknownKindLineIds.push(line.id)
      continue
    }

    if (line.kind === 'bill') partition.bills.push(line)
    else if (line.kind === 'variable') partition.variables.push(line)
    else if (line.kind === 'savings') partition.savings.push(line)
    else partition.investments.push(line)
  }

  return partition
}

/**
 * Categorías descritas por un conjunto de líneas, para
 * `splitExpensesByPlanLine` y `sumBudgetsForCategories`.
 *
 * Una línea del eje cuenta no tiene categoría (C6) y se omite.
 */
export function planLineCategoryIds(lines: Pick<PlanLineRow, 'category_id'>[]): string[] {
  const ids: string[] = []

  for (const line of lines) {
    if (line.category_id === null) continue
    ids.push(line.category_id)
  }

  return ids
}

/* -------------------------------------------------------------------------- */
/* Transferencias: emparejamiento de patas                                    */
/* -------------------------------------------------------------------------- */

/** Tipos de cuenta que reciben aportes. `credit_card` no es uno de ellos. */
const CONTRIBUTION_ACCOUNT_TYPES = ['savings', 'investment'] as const

function isContributionAccountType(value: string): boolean {
  return (CONTRIBUTION_ACCOUNT_TYPES as readonly string[]).includes(value)
}

/**
 * Candidatos a aporte, emparejando las dos patas de cada transferencia por
 * `transfer_group_id` (docs/09-plan-mensual.md, «Las tres cifras de ahorro»).
 *
 * Un grupo produce **como mucho un candidato**, y solo si cumple todo esto:
 *
 * - Exactamente dos filas con ese `transfer_group_id`.
 * - Una entrante y una saliente. Nunca se empareja por posición ni por
 *   `account_id`. El importe se toma de la pata entrante, que es la única que
 *   cuenta, y eso es lo que impide sumar dos veces la misma transferencia.
 * - Ambas cuentas conocidas, con su tipo resuelto.
 * - El destino es `savings` o `investment`.
 * - El origen es de un tipo distinto del destino, así que mover dinero entre
 *   dos cuentas de ahorro no cuenta como ahorrar de nuevo.
 *
 * Los grupos incompletos —una sola pata, tres o más filas, dos patas en la
 * misma dirección, una cuenta desconocida— se **ignoran por completo**. Una
 * pata aislada no cuenta nunca: elegir dos filas de entre tres, o suponer el
 * origen que falta, inventaría un aporte que el usuario no registró.
 *
 * El prefiltrado por tipo de destino no altera ninguna suma:
 * `sumTransferContributions` vuelve a exigir `destino = objetivo` y
 * `origen ≠ objetivo`, así que todo candidato que habría contado sigue aquí.
 */
export function buildTransferContributionCandidates(
  transactions: PlanTransferLeg[],
  accounts: PlanAccountTypeRow[],
): TransferContributionCandidate[] {
  const typeByAccount = new Map(accounts.map((account) => [account.id, account.type]))

  const legsByGroup = new Map<string, PlanTransferLeg[]>()

  for (const transaction of transactions) {
    if (transaction.type !== 'transfer') continue
    if (transaction.transfer_group_id === null) continue

    const legs = legsByGroup.get(transaction.transfer_group_id)
    if (legs) legs.push(transaction)
    else legsByGroup.set(transaction.transfer_group_id, [transaction])
  }

  const candidates: TransferContributionCandidate[] = []

  for (const legs of legsByGroup.values()) {
    if (legs.length !== 2) continue

    const incoming = legs.filter((leg) => leg.transfer_direction === 'incoming')
    const outgoing = legs.filter((leg) => leg.transfer_direction === 'outgoing')
    if (incoming.length !== 1 || outgoing.length !== 1) continue

    const destinationAccountType = typeByAccount.get(incoming[0].account_id)
    const sourceAccountType = typeByAccount.get(outgoing[0].account_id)
    if (destinationAccountType === undefined || sourceAccountType === undefined) continue

    if (!isContributionAccountType(destinationAccountType)) continue
    if (sourceAccountType === destinationAccountType) continue

    candidates.push({
      amountMinor: incoming[0].amount_minor,
      destinationAccountType,
      sourceAccountType,
    })
  }

  return candidates
}

/* -------------------------------------------------------------------------- */
/* Ingreso por fuente                                                         */
/* -------------------------------------------------------------------------- */

export interface IncomeActualBySource {
  /** Una entrada por fuente del mes, en cero si no recibió nada. */
  bySource: Record<string, number>
  /**
   * Ingreso del mes que no se atribuye a ninguna fuente: sin categoría, con
   * una categoría que no alimenta ninguna fuente, o con una categoría
   * ambigua. Es una cifra visible, no un residuo escondido.
   */
  unattributedMinor: number
  /**
   * Categorías que el puente vincula a más de una fuente. U9 lo impide; si
   * ocurriera, su ingreso va entero a `unattributedMinor` en vez de
   * atribuirse a una fuente elegida al azar.
   */
  ambiguousCategoryIds: string[]
}

/**
 * `ingresoActual(f)`: ingreso del mes atribuido a cada fuente a través de las
 * categorías que la alimentan (docs/09-plan-mensual.md, «Ingreso»).
 *
 * La atribución es inequívoca porque U9 —único `(plan_month_id, category_id)`—
 * hace que una categoría de ingreso alimente una sola fuente del mes, y estas
 * filas del puente son las de un solo mes.
 *
 * Nada se adivina cuando esa condición no se cumple:
 *
 * - Categoría vinculada a varias fuentes → su ingreso va a
 *   `unattributedMinor` y la categoría se reporta en `ambiguousCategoryIds`.
 * - Movimiento sin categoría → `unattributedMinor`.
 * - Fuente sin categorías → aparece en `bySource` con 0.
 * - Vínculo a una fuente que no es del mes → se descarta, y su categoría
 *   queda sin vincular. F4 lo impide.
 * - Categoría de tipo `expense` en el puente → no aporta nada, porque solo se
 *   suman movimientos `income`. T2 lo impide.
 *
 * **Invariante:** `Σ bySource + unattributedMinor = ingresoActual`, el mismo
 * total que devuelve `calculateMonthlyIncome`. Esta función reparte el
 * ingreso; no lo redefine, y la cifra general no depende de ella.
 */
export function buildIncomeActualBySource(
  transactions: PlanCategorizedTransaction[],
  links: PlanIncomeSourceCategoryRow[],
  sourceIds: readonly string[],
): IncomeActualBySource {
  const knownSources = new Set(sourceIds)
  const sourceByCategory = new Map<string, string>()
  const ambiguous = new Set<string>()

  for (const link of links) {
    if (!knownSources.has(link.plan_income_source_id)) continue

    const existing = sourceByCategory.get(link.category_id)
    if (existing === undefined) {
      sourceByCategory.set(link.category_id, link.plan_income_source_id)
      continue
    }
    if (existing !== link.plan_income_source_id) ambiguous.add(link.category_id)
  }

  const bySource: Record<string, number> = {}
  for (const sourceId of sourceIds) bySource[sourceId] = 0

  let unattributedMinor = 0

  for (const transaction of transactions) {
    if (transaction.type !== 'income') continue

    const categoryId = transaction.category_id
    const sourceId = categoryId === null ? undefined : sourceByCategory.get(categoryId)

    if (sourceId === undefined || (categoryId !== null && ambiguous.has(categoryId))) {
      unattributedMinor += transaction.amount_minor
      continue
    }

    bySource[sourceId] += transaction.amount_minor
  }

  return { bySource, unattributedMinor, ambiguousCategoryIds: [...ambiguous] }
}
