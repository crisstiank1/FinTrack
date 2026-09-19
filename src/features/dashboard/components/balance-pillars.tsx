import { CreditCard, Scale, Wallet } from 'lucide-react'

import { formatAmount } from '@/lib/currency'

import { percentDelta, type BalancePillars as BalancePillarsForCurrency } from '../summary'
import { KpiCard } from './kpi-card'

interface BalancePillarsProps {
  /** Desglose de cada moneda, la de presentación primero. */
  pillars: BalancePillarsForCurrency[]
  /** Moneda en la que se presentan las cifras principales. */
  currencyCode: string
  /** 'Todas las cuentas', 'Cuentas en COP' o el nombre de la cuenta filtrada. */
  scopeLabel: string
  /** 'Al 30 de septiembre de 2026'. */
  asOfLabel: string
}

/** Pilar de reserva para cuando la moneda de presentación no tiene cuentas en el alcance. */
function emptyPillar(currencyCode: string): BalancePillarsForCurrency {
  return {
    currencyCode,
    liquidMinor: 0,
    debtMinor: 0,
    netMinor: 0,
    previousLiquidMinor: 0,
    previousDebtMinor: 0,
    previousNetMinor: 0,
  }
}

/**
 * El primer vistazo del dashboard: cuánto dinero real hay hoy, cuánto se debe
 * en tarjetas y qué queda después de pagar.
 *
 * FinTrack no convierte divisas: la deuda se muestra en valor absoluto y los
 * saldos de otras monedas aparecen aparte, en la tarjeta de patrimonio.
 */
export function BalancePillars({
  pillars,
  currencyCode,
  scopeLabel,
  asOfLabel,
}: BalancePillarsProps) {
  const main =
    pillars.find((pillar) => pillar.currencyCode === currencyCode) ?? emptyPillar(currencyCode)
  const otherBalances = pillars.filter((pillar) => pillar.currencyCode !== currencyCode)

  const debtDelta = percentDelta(Math.abs(main.debtMinor), Math.abs(main.previousDebtMinor))

  return (
    <>
      <KpiCard
        index={0}
        label="Dinero disponible"
        value={formatAmount(main.liquidMinor, currencyCode)}
        icon={Wallet}
        tone="income"
        delta={percentDelta(main.liquidMinor, main.previousLiquidMinor)}
        higherIsBetter
        caption={scopeLabel}
      />

      <KpiCard
        index={1}
        label="Deuda en tarjetas"
        value={formatAmount(Math.abs(main.debtMinor), currencyCode)}
        icon={CreditCard}
        tone="warning"
        delta={debtDelta}
        higherIsBetter={false}
        caption="Consumos pendientes de pago"
      />

      <KpiCard
        index={2}
        label="Balance total"
        value={formatAmount(main.netMinor, currencyCode)}
        icon={Scale}
        tone="savings"
        delta={percentDelta(main.netMinor, main.previousNetMinor)}
        higherIsBetter
        caption={asOfLabel}
        footer={
          otherBalances.length > 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Otras monedas:{' '}
              <span className="font-medium tabular-nums text-foreground">
                {otherBalances
                  .map((other) => formatAmount(other.netMinor, other.currencyCode))
                  .join(' · ')}
              </span>
            </p>
          ) : undefined
        }
      />
    </>
  )
}
