import { useId } from 'react'
import { AlertCircle, Plus, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** Esqueleto de carga que reserva el mismo espacio que el dashboard real. */
export function DashboardSkeleton() {
  return (
    <div className="mt-6 animate-pulse" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-72 rounded-2xl border border-border bg-card sm:col-span-2 lg:row-span-2" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-34 min-h-34 rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="h-72 rounded-2xl border border-border bg-card" />
        <div className="h-72 rounded-2xl border border-border bg-card" />
      </div>
    </div>
  )
}

export function DashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mt-6 flex flex-col items-center rounded-2xl border border-border bg-card p-10 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-danger/12 text-danger">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h2 className="mt-4 text-lg font-semibold text-foreground">
        No pudimos cargar tus movimientos
      </h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Revisa tu conexión e inténtalo de nuevo. Tus datos no se han perdido.
      </p>
      <Button type="button" className="mt-5" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

/** Primer uso: el usuario tiene cuentas pero todavía ningún movimiento. */
export function DashboardEmptyState({ onCreate }: { onCreate: () => void }) {
  const titleId = useId()

  return (
    <section
      aria-labelledby={titleId}
      className="animate-card-in mt-6 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card p-10 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-primary/12 text-primary">
        <Sparkles className="size-6" aria-hidden="true" />
      </span>
      <h2 id={titleId} className="mt-4 text-lg font-semibold text-foreground">
        Tu dashboard está listo
      </h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Registra tu primer ingreso o gasto y aquí verás tu saldo, en qué se va tu dinero y cómo
        evoluciona mes a mes.
      </p>
      <Button type="button" className="mt-5" onClick={onCreate}>
        <Plus className="size-4" aria-hidden="true" />
        Registrar movimiento
      </Button>
    </section>
  )
}

/** Hueco dentro de un panel cuando el mes en pantalla no tiene datos. */
export function PanelEmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center rounded-lg border border-dashed border-border p-6">
      <p className="max-w-xs text-center text-sm text-muted-foreground">{children}</p>
    </div>
  )
}
