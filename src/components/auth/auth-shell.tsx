import { useId, type ReactNode } from 'react'

import { SiteFooter } from '@/components/layout/site-footer'
import { Logo } from '@/components/shared/logo'
import { cn } from '@/lib/utils'

interface AuthShellProps {
  formSide: 'left' | 'right'
  children: ReactNode
}

export function AuthShell({ formSide, children }: AuthShellProps) {
  const formOrder = formSide === 'left' ? 'lg:order-1' : 'lg:order-2'
  const brandOrder = formSide === 'left' ? 'lg:order-2' : 'lg:order-1'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 py-10 text-foreground">
      <main className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card shadow-card-hover lg:grid-cols-2">
        <div
          key={formSide}
          className={cn(
            'animate-auth-panel-in flex flex-col justify-center p-8 sm:p-10',
            formOrder,
          )}
        >
          {children}
        </div>
        <div
          className={cn(
            // Halos de marca sobre la superficie elevada; el texto conserva su
            // contraste porque los halos son casi transparentes.
            'relative hidden flex-col justify-center gap-8 overflow-hidden bg-surface-elevated bg-[radial-gradient(28rem_20rem_at_100%_0%,var(--glow-1),transparent_70%),radial-gradient(24rem_18rem_at_0%_100%,var(--glow-2),transparent_70%)] p-10',
            brandOrder,
            'lg:flex',
          )}
        >
          <BrandingPanel />
        </div>
      </main>
      <SiteFooter className="w-full max-w-4xl border-t-0 px-0 text-center [&_ul]:justify-center" />
    </div>
  )
}

function BrandingPanel() {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <Logo className="h-20" />
      <div className="flex flex-col gap-2">
        <p className="text-3xl font-bold text-foreground">
          Tus finanzas,{' '}
          <span className="bg-linear-to-r from-brand-from to-brand-to bg-clip-text text-transparent">
            con claridad.
          </span>
        </p>
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
  const id = useId()
  const lineId = `${id}-line`
  const areaId = `${id}-area`
  const points = '20,120 70,100 120,110 170,60 220,75 260,30'

  return (
    <svg
      viewBox="0 0 280 160"
      className="w-full max-w-xs"
      role="img"
      aria-label="Ilustración de una tendencia financiera ascendente"
    >
      <defs>
        <linearGradient id={lineId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" style={{ stopColor: 'var(--brand-from)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--brand-to)' }} />
        </linearGradient>
        <linearGradient id={areaId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--brand-from)', stopOpacity: 0.25 }} />
          <stop offset="100%" style={{ stopColor: 'var(--brand-from)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="280" height="160" rx="20" className="fill-surface" />
      <polygon points={`${points} 260,130 20,130`} fill={`url(#${areaId})`} />
      <polyline
        points={points}
        fill="none"
        stroke={`url(#${lineId})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="260" cy="30" r="6" style={{ fill: 'var(--brand-to)' }} />
      <circle cx="170" cy="60" r="5" className="fill-primary-soft" />
      <circle cx="120" cy="110" r="5" className="fill-primary-soft" />
      <rect x="20" y="130" width="240" height="2" className="fill-border" />
    </svg>
  )
}
