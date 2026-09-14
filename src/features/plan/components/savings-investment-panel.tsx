import { useId } from 'react'
import { Link } from 'react-router-dom'

import { formatAmount } from '@/lib/currency'
import { getIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

import type { AccountTypeBalance, ContributionBalances } from '../hooks'
import {
  accountTypeBalanceCaption,
  balanceTone,
  contributionBlockLabel,
  formatContributionPlanned,
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

interface SavingsInvestmentPanelProps {
  currencyCode: string
  savings: ContributionFigures
  investment: ContributionFigures
  /** Saldos al cierre del mes; `undefined` mientras se calculan. */
  balances: ContributionBalances | undefined
  isBalanceError: boolean
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
 * Ahorro e inversión del mes, de solo lectura.
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
        />
        <ContributionCard
          type="investment"
          index={1}
          figures={investment}
          balance={balances?.investment}
          asOfDate={balances?.asOfDate}
          isBalanceError={isBalanceError}
          currencyCode={currencyCode}
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
}

function ContributionCard({
  type,
  index,
  figures,
  balance,
  asOfDate,
  isBalanceError,
  currencyCode,
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
    </>
  )
}
