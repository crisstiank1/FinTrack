import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { accountTypeOptions } from '@/features/accounts/schemas'
import { DEFAULT_CATEGORIES } from '@/features/categories/default-categories'
import type { DraftAccountValues, WelcomeStepValues } from '@/features/onboarding/schemas'
import { formatAmount } from '@/lib/currency'

interface ConfirmationStepProps {
  profile: WelcomeStepValues | null
  accounts: DraftAccountValues[]
  onBack: () => void
  onFinish: () => void
  isFinishing: boolean
}

export function ConfirmationStep({
  profile,
  accounts,
  onBack,
  onFinish,
  isFinishing,
}: ConfirmationStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Todo listo, {profile?.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">Revisa el resumen antes de empezar.</p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <SummaryRow label="Moneda principal" value={profile?.currencyCode ?? ''} />
        <SummaryRow label="Cuentas" value={`${accounts.length}`} />
        {accounts.map((account) => (
          <p key={account.name} className="pl-3 text-sm text-muted-foreground">
            {account.name} ({accountTypeOptions.find((option) => option.value === account.type)?.label}
            ) · {formatAmount(account.initialBalance, profile?.currencyCode ?? 'COP')}
          </p>
        ))}
        <SummaryRow label="Categorías" value={`${DEFAULT_CATEGORIES.length} predeterminadas`} />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isFinishing}>
          Atrás
        </Button>
        <Button type="button" className="flex-1" onClick={onFinish} disabled={isFinishing}>
          {isFinishing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Ir a mi dashboard
        </Button>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
