import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface DashboardPanelProps {
  title: string
  description?: string
  /** Acción secundaria alineada al título (ej. "Ver todos"). */
  action?: ReactNode
  /** Posición en la secuencia; escalona la animación de entrada. */
  index?: number
  className?: string
  children: ReactNode
}

/** Contenedor común de los bloques del dashboard: gráficos y listas. */
export function DashboardPanel({
  title,
  description,
  action,
  index = 0,
  className,
  children,
}: DashboardPanelProps) {
  const titleId = useId()

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'animate-card-in flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm',
        className,
      )}
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {/* first-letter, no `capitalize`: date-fns devuelve 'septiembre 2026'
              en minúscula, pero `capitalize` también rompería 'Últimos 6 meses'. */}
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground first-letter:uppercase">
              {description}
            </p>
          )}
        </div>
        {action}
      </div>

      <div className="mt-4 flex-1">{children}</div>
    </section>
  )
}
