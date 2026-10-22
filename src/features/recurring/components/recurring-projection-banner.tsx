import { CalendarClock, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { useProjectRecurring, useRecurringProjectionStatus, useRecurringTemplates } from '../hooks'
import {
  projectLabel,
  skipAction,
  skipReason,
  summarizeProjection,
  type ProjectionResult,
} from '../logic'

/**
 * Aviso del Dashboard: aparece solo si hay plantillas activas sin proyectar
 * este mes. Proyectar crea borradores, nunca movimientos: el usuario los revisa
 * y los registra desde Hojas.
 */
export function RecurringProjectionBanner() {
  const { monthKey, pending, ready } = useRecurringProjectionStatus()
  const project = useProjectRecurring()
  const templatesQuery = useRecurringTemplates()
  const [lastResult, setLastResult] = useState<ProjectionResult | null>(null)

  async function handleProject() {
    try {
      const result = await project.mutateAsync(monthKey)
      setLastResult(result)
      const summary = summarizeProjection(result)
      toast.success(
        `${summary.created} borradores creados · ${summary.existing} ya existían · ${summary.skipped} omitidos`,
      )
    } catch (error) {
      toast.error('No se pudieron proyectar los movimientos recurrentes', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const skipped = lastResult?.results.filter((item) => skipReason(item.status) !== null) ?? []

  if (lastResult) {
    const summary = summarizeProjection(lastResult)
    return (
      <div role="status" className="mt-4 rounded-lg border border-border bg-card p-4 text-sm">
        <p className="font-medium text-foreground">
          {summary.created} borradores creados, {summary.existing} ya existían y {summary.skipped}{' '}
          omitidos.
        </p>
        {skipped.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-muted-foreground">
            {skipped.map((item) => {
              const name =
                templatesQuery.data?.find((template) => template.id === item.template_id)
                  ?.description ?? 'Plantilla'
              return (
                <li key={item.template_id}>
                  <span className="font-medium text-foreground">«{name}»</span> no se proyectó
                  porque {skipReason(item.status)}. {skipAction(item.status)}
                </li>
              )
            })}
          </ul>
        )}
        {lastResult.sheet_id && (
          <Link
            to={`/sheets?sheet=${lastResult.sheet_id}`}
            className="mt-2 inline-block font-medium underline underline-offset-4"
          >
            Revisar y registrar en Hojas
          </Link>
        )}
      </div>
    )
  }

  if (!ready || pending.length === 0) return null

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
        <div className="text-sm">
          <p className="font-medium text-foreground">
            Tienes movimientos recurrentes sin proyectar
          </p>
          <p className="text-muted-foreground">
            Se crearán como borradores para revisar. No se registra nada automáticamente.
          </p>
        </div>
      </div>
      <Button type="button" onClick={handleProject} disabled={project.isPending}>
        {project.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {projectLabel(pending.length)}
      </Button>
    </div>
  )
}
