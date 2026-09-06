import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { AccountsStep } from '@/features/onboarding/components/accounts-step'
import { CategoriesStep } from '@/features/onboarding/components/categories-step'
import { ConfirmationStep } from '@/features/onboarding/components/confirmation-step'
import { WelcomeStep } from '@/features/onboarding/components/welcome-step'
import type { DraftAccountValues, WelcomeStepValues } from '@/features/onboarding/schemas'
import { useAuth } from '@/features/auth/auth-provider'
import { DEFAULT_CATEGORIES } from '@/features/categories/default-categories'
import { SWATCHES } from '@/components/ui/color-picker'
import { supabase } from '@/lib/supabase'

const TOTAL_STEPS = 4

const ACCOUNT_TYPE_ICON: Record<DraftAccountValues['type'], string> = {
  cash: 'wallet',
  checking: 'landmark',
  savings: 'piggy-bank',
  digital_wallet: 'smartphone',
  credit_card: 'credit-card',
}

export function OnboardingWizard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [profile, setProfile] = useState<WelcomeStepValues | null>(null)
  const [accounts, setAccounts] = useState<DraftAccountValues[]>([])
  const [isFinishing, setIsFinishing] = useState(false)

  function goTo(nextStep: number, dir: 'forward' | 'back') {
    setDirection(dir)
    setStep(nextStep)
  }

  async function handleFinish() {
    if (!user || !profile) return
    setIsFinishing(true)

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ display_name: profile.displayName, currency_code: profile.currencyCode })
        .eq('id', user.id)
      if (profileError) throw profileError

      const { error: accountsError } = await supabase.from('accounts').insert(
        accounts.map((account, index) => ({
          user_id: user.id,
          name: account.name,
          type: account.type,
          initial_balance_minor: account.initialBalance,
          currency_code: profile.currencyCode,
          icon: ACCOUNT_TYPE_ICON[account.type],
          color: SWATCHES[index % SWATCHES.length],
        })),
      )
      if (accountsError) throw accountsError

      const { error: categoriesError } = await supabase.from('categories').insert(
        DEFAULT_CATEGORIES.map((category) => ({
          user_id: user.id,
          name: category.name,
          type: category.type,
          icon: category.icon,
          is_system: true,
        })),
      )
      if (categoriesError) throw categoriesError

      const { error: completeError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id)
      if (completeError) throw completeError

      navigate('/dashboard', { replace: true })
    } catch (error) {
      toast.error('No se pudo completar la configuración inicial', {
        description: error instanceof Error ? error.message : undefined,
      })
      setIsFinishing(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <p className="text-sm font-medium text-muted-foreground">
          Paso {step} de {TOTAL_STEPS}
        </p>
        <div className="mt-2 flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
            <div
              key={index}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                index < step ? 'bg-primary' : 'bg-border'
              }`}
            />
          ))}
        </div>
      </div>

      <div
        key={`${step}-${direction}`}
        className={direction === 'forward' ? 'animate-wizard-step-forward' : 'animate-wizard-step-back'}
      >
        {step === 1 && (
          <WelcomeStep
            defaultValues={profile ?? undefined}
            onNext={(values) => {
              setProfile(values)
              goTo(2, 'forward')
            }}
          />
        )}
        {step === 2 && (
          <AccountsStep
            defaultValues={accounts.length > 0 ? accounts : undefined}
            onBack={() => goTo(1, 'back')}
            onNext={(values) => {
              setAccounts(values)
              goTo(3, 'forward')
            }}
          />
        )}
        {step === 3 && <CategoriesStep onBack={() => goTo(2, 'back')} onNext={() => goTo(4, 'forward')} />}
        {step === 4 && (
          <ConfirmationStep
            profile={profile}
            accounts={accounts}
            onBack={() => goTo(3, 'back')}
            onFinish={handleFinish}
            isFinishing={isFinishing}
          />
        )}
      </div>
    </div>
  )
}
