import type { ReactNode } from 'react'
import { Wallet } from 'lucide-react'

import { cn } from '@/lib/utils'

interface AuthShellProps {
  formSide: 'left' | 'right'
  children: ReactNode
}

export function AuthShell({ formSide, children }: AuthShellProps) {
  const formOrder = formSide === 'left' ? 'lg:order-1' : 'lg:order-2'
  const brandOrder = formSide === 'left' ? 'lg:order-2' : 'lg:order-1'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl lg:grid-cols-2">
        <div
          key={formSide}
          className={cn('animate-auth-panel-in flex flex-col justify-center p-8 sm:p-10', formOrder)}
        >
          {children}
        </div>
        <div
          className={cn(
            'hidden flex-col justify-center gap-8 bg-surface-elevated p-10',
            brandOrder,
            'lg:flex',
          )}
        >
          <BrandingPanel />
        </div>
      </div>
    </div>
  )
}

function BrandingPanel() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-primary">
        <Wallet className="size-6" aria-hidden="true" />
        <span className="text-lg font-semibold">FinTrack</span>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-2xl font-semibold text-foreground">Tus finanzas, con claridad.</p>
        <p className="text-sm text-muted-foreground">
          Registra ingresos y gastos, organiza tus cuentas y entiende hacia dónde va tu dinero cada
          mes.
        </p>
      </div>
      <DecorativeChart />
    </div>
  )
}

function DecorativeChart() {
  return (
    <svg
      viewBox="0 0 280 160"
      className="w-full max-w-xs"
      role="img"
      aria-label="Ilustración de una tendencia financiera ascendente"
    >
      <rect x="0" y="0" width="280" height="160" rx="16" className="fill-surface" />
      <polyline
        points="20,120 70,100 120,110 170,60 220,75 260,30"
        fill="none"
        className="stroke-primary"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="260" cy="30" r="6" className="fill-primary" />
      <circle cx="170" cy="60" r="5" className="fill-primary-soft" />
      <circle cx="120" cy="110" r="5" className="fill-primary-soft" />
      <rect x="20" y="130" width="240" height="2" className="fill-border" />
    </svg>
  )
}
