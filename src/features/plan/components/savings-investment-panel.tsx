import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/currency'
import { getIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

import type { AccountTypeBalance, ContributionBalances } from '../hooks'
import {
  accountTypeBalanceCaption,
  balanceTone,
  contributionBlockLabel,
  contributionLineLabel,
  formatContributionPlanned,
  otherCurrencyAccountsNote,
  otherCurrencyContributionLineLabel,
  ARCHIVED_ACCOUNT_BADGE,
  BALANCE_ERROR_LABEL,
  BALANCE_LOADING_LABEL,
  SAVINGS_INVESTMENT_NOTE,
  SAVINGS_INVESTMENT_TITLE,
  type ContributionAccountType,
  type ContributionBlockLabels,
  type PlanTone,
} from '../labels'

/** Lo que el mes dice de un tipo de cuenta: aportes reales y aportes planeados. */
export interface ContributionFigures {
  contributionsMinor: number
  /** `null` cuando no hay ninguna línea de aportes de ese tipo en el mes. */
  plannedMinor: number | null
}

/** Línea de aporte tal como la pinta la tarjeta, con su cuenta ya resuelta. */
export interface ContributionLineItem {
  id: string
  name: string
  accountName: string
  /** La cuenta se archivó después de crear la línea. */
  isAccountArchived: boolean
  /**
   * Moneda de la cuenta si no es la del Plan. Su planeado sigue contando; su
   * aporte real no.
   */
  otherCurrencyCode?: string
  plannedMinor: number
}

/** Lo necesario para planificar aportes de un tipo en el mes. */
export interface ContributionPlanning {
  lines: ContributionLineItem[]
  /** Hay al menos una cuenta del tipo sin archivar en la moneda del Plan. */
  hasActiveAccounts: boolean
  /** Cuentas del tipo sin archivar, en la moneda del Plan y sin aporte este mes (U11). */
  availableAccountCount: number
  isBusy?: boolean
  onAdd: () => void
  onEdit: (lineId: string) => void
  onDelete: (lineId: string) => void
}

interface SavingsInvestmentPanelProps {
  currencyCode: string
  savings: ContributionFigures
  investment: ContributionFigures
  /** Saldos al cierre del mes; `undefined` mientras se calculan. */
  balances: ContributionBalances | undefined
  isBalanceError: boolean
  /**
   * Líneas de aporte y sus acciones, por tipo. `undefined` en un mes sin plan:
   * sin `plan_month_id` no hay dónde guardar una línea, así que la tarjeta
   * muestra solo aportes y saldo.
   */
  planning?: Record<ContributionAccountType, ContributionPlanning>
}

const ICON_KEY: Record<ContributionAccountType, string> = {
  savings: 'piggy-bank',
  investment: 'trending-up',
}

const TONE_STYLES: Record<PlanTone, string> = {
  neutral: 'text-foreground',
  positive: 'text-success',
  negative: 'text-danger',
}

/**
 * Ahorro e inversión del mes.
 *
 * Las cifras son de solo lectura; lo único que se edita son los **aportes
 * planeados**, líneas medidas por cuenta con importe propio. Viven aquí y no en
 * «Facturas y gastos variables» porque no son gasto.
 *
 * Cada tarjeta separa dos cifras que no se pueden sumar entre sí: los
 * **aportes del mes**, que son transferencias registradas hacia cuentas de ese
 * tipo, y el **saldo en cuentas** al cierre del mes, que es un stock. El saldo
 * es contexto: no entra en el Restante ni en el cuadro Presupuesto vs. Actual
 * (docs/09-plan-mensual.md, «Las tres cifras de ahorro»).
 *
 * El saldo llega por su propia consulta, así que carga o falla por su cuenta y
 * nunca bloquea los aportes, que ya vienen resueltos con el resto del mes.
 */
export function SavingsInvestmentPanel({
  currencyCode,
  savings,
  investment,
  balances,
  isBalanceError,
  planning,
}: SavingsInvestmentPanelProps) {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className="mt-8">
      <h2 id={titleId} className="text-base font-semibold text-foreground">
        {SAVINGS_INVESTMENT_TITLE}
      </h2>
      {/* Nota fija, no un tooltip: se lee siempre (docs/03-ui-ux.md). */}
      <p className="mt-0.5 text-sm text-muted-foreground">{SAVINGS_INVESTMENT_NOTE}</p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <ContributionCard
          type="savings"
          index={0}
          figures={savings}
          balance={balances?.savings}
          asOfDate={balances?.asOfDate}
          isBalanceError={isBalanceError}
          currencyCode={currencyCode}
          planning={planning?.savings}
        />
        <ContributionCard
          type="investment"
          index={1}
          figures={investment}
          balance={balances?.investment}
          asOfDate={balances?.asOfDate}
          isBalanceError={isBalanceError}
          currencyCode={currencyCode}
          planning={planning?.investment}
        />
      </div>
    </section>
  )
}

interface ContributionCardProps {
  type: ContributionAccountType
  /** Posición en la cuadrícula; escalona la animación de entrada. */
  index: number
  figures: ContributionFigures
  balance: AccountTypeBalance | undefined
  asOfDate: string | undefined
  isBalanceError: boolean
  currencyCode: string
  planning: ContributionPlanning | undefined
}

function ContributionCard({
  type,
  index,
  figures,
  balance,
  asOfDate,
  isBalanceError,
  currencyCode,
  planning,
}: ContributionCardProps) {
  const titleId = useId()
  const labels = contributionBlockLabel[type]
  const Icon = getIcon(ICON_KEY[type])

  return (
    <section
      aria-labelledby={titleId}
      className="animate-card-in rounded-2xl border border-border bg-card p-5 shadow-sm"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <h3 id={titleId} className="text-sm font-semibold text-foreground">
          {labels.title}
        </h3>
      </div>

      <dl className="mt-4 divide-y divide-border">
        {/* Flujo del mes. Un mes sin aportes es COP 0: es un valor medido. */}
        <div className="pb-4">
          <dt className="text-sm text-muted-foreground">{labels.contributions}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {formatAmount(figures.contributionsMinor, currencyCode)}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            Planeado: {formatContributionPlanned(figures.plannedMinor, currencyCode)}
          </dd>
          {planning && (
            <dd className="mt-3">
              <ContributionLines
                type={type}
                planning={planning}
                currencyCode={currencyCode}
                otherCurrencyAccountCount={balance?.otherCurrencyCount ?? 0}
              />
            </dd>
          )}
        </div>

        {/* Stock al cierre del mes. Sin cuentas no hay saldo: no se dice COP 0. */}
        <div className="pt-4">
          <dt className="text-sm text-muted-foreground">{labels.balance}</dt>
          <BalanceFigure
            labels={labels}
            balance={balance}
            asOfDate={asOfDate}
            isError={isBalanceError}
            currencyCode={currencyCode}
          />
        </div>
      </dl>
    </section>
  )
}

interface BalanceFigureProps {
  labels: ContributionBlockLabels
  balance: AccountTypeBalance | undefined
  asOfDate: string | undefined
  isError: boolean
  currencyCode: string
}

function BalanceFigure({ labels, balance, asOfDate, isError, currencyCode }: BalanceFigureProps) {
  if (isError) {
    return <dd className="mt-1 text-sm text-foreground">{BALANCE_ERROR_LABEL}</dd>
  }

  if (!balance || !asOfDate) {
    return (
      <dd className="mt-1 text-sm text-muted-foreground" aria-live="polite">
        {BALANCE_LOADING_LABEL}
      </dd>
    )
  }

  // Hay cuentas del tipo, pero todas en otra moneda: decir «Sin cuentas» sería
  // falso, y su saldo no se puede sumar al del Plan.
  if (balance.accountCount === 0 && balance.otherCurrencyCount > 0) {
    return (
      <dd className="mt-1 text-sm text-muted-foreground">
        {otherCurrencyAccountsNote(balance.otherCurrencyCount)}
      </dd>
    )
  }

  if (balance.accountCount === 0) {
    return (
      <>
        <dd className="mt-1 text-base font-medium text-foreground">{labels.noAccounts}</dd>
        <dd className="mt-1 text-xs">
          <Link
            to="/accounts"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {labels.createAccount}
          </Link>
        </dd>
      </>
    )
  }

  return (
    <>
      <dd
        className={cn(
          'mt-1 text-2xl font-semibold tabular-nums',
          TONE_STYLES[balanceTone(balance.balanceMinor)],
        )}
      >
        {formatAmount(balance.balanceMinor, currencyCode)}
      </dd>
      <dd className="mt-1 text-xs text-muted-foreground">
        {accountTypeBalanceCaption(asOfDate, balance.accountCount, balance.archivedCount)}
      </dd>
      {balance.otherCurrencyCount > 0 && (
        <dd className="mt-1 text-xs text-muted-foreground">
          {otherCurrencyAccountsNote(balance.otherCurrencyCount)}
        </dd>
      )}
    </>
  )
}

interface ContributionLinesProps {
  type: ContributionAccountType
  planning: ContributionPlanning
  currencyCode: string
  /**
   * Cuentas del tipo en otra moneda. Cambia el texto de «no tienes cuenta» por
   * «no tienes cuenta en esta moneda» (M10). Llega del saldo, así que mientras
   * se calcula se dice la frase general, que nunca es falsa.
   */
  otherCurrencyAccountCount: number
}

/**
 * Aportes planeados de un tipo y la acción para añadir otro.
 *
 * Cada fila muestra solo lo planeado: el real se mide por tipo de cuenta y ya
 * está arriba, en «Aportes del mes». La acción solo aparece cuando el servidor
 * aceptaría una línea nueva; si no, se dice por qué con palabras.
 */
function ContributionLines({
  type,
  planning,
  currencyCode,
  otherCurrencyAccountCount,
}: ContributionLinesProps) {
  const labels = contributionLineLabel[type]

  return (
    <div className="flex flex-col gap-2">
      {planning.lines.length > 0 && (
        <ul aria-label={labels.list} className="flex flex-col gap-1.5">
          {planning.lines.map((line) => (
            <li
              key={line.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <p className="min-w-0 flex-1 text-foreground">
                <span className="font-medium">{line.name}</span>
                <span className="text-muted-foreground"> · {line.accountName}</span>
                <span className="tabular-nums">
                  {' '}
                  · {formatAmount(line.plannedMinor, currencyCode)}
                </span>
                {line.isAccountArchived && (
                  <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {ARCHIVED_ACCOUNT_BADGE}
                  </span>
                )}
                {line.otherCurrencyCode && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {otherCurrencyContributionLineLabel(line.otherCurrencyCode)}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => planning.onEdit(line.id)}
                  disabled={planning.isBusy}
                  aria-label={`Editar ${line.name}`}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  onClick={() => planning.onDelete(line.id)}
                  disabled={planning.isBusy}
                  aria-label={`Eliminar ${line.name}`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!planning.hasActiveAccounts ? (
        <p className="text-xs text-muted-foreground">
          {otherCurrencyAccountCount > 0
            ? labels.noAccountsInCurrency(currencyCode)
            : labels.noAccounts}{' '}
          <Link
            to="/accounts"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {contributionBlockLabel[type].createAccount}
          </Link>
        </p>
      ) : planning.availableAccountCount === 0 ? (
        <p className="text-xs text-muted-foreground">{labels.accountsExhausted}</p>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={planning.onAdd}
            disabled={planning.isBusy}
          >
            <Plus className="size-4" aria-hidden="true" />
            {labels.addButton}
          </Button>
        </div>
      )}
    </div>
  )
}
