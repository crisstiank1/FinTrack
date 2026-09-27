import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/currency'
import type { Tables } from '@/types/database.types'

import type { RecurringTemplate } from '../api'
import { useDeleteTemplate, useRecurringTemplates, useSetTemplateActive } from '../hooks'

interface Props {
  accounts: Tables<'accounts'>[]
  categories: Tables<'categories'>[]
}

/**
 * Lista de plantillas recurrentes en Ajustes: activar, desactivar o eliminar.
 * Es donde se corrige una plantilla que la proyección omitió por una cuenta o
 * categoría archivada.
 */
export function RecurringTemplatesSection({ accounts, categories }: Props) {
  const templatesQuery = useRecurringTemplates()
  const setActive = useSetTemplateActive()
  const deleteTemplate = useDeleteTemplate()
  const [deleting, setDeleting] = useState<RecurringTemplate | null>(null)

  const accountsById = new Map(accounts.map((account) => [account.id, account]))
  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const templates = templatesQuery.data ?? []

  async function toggle(template: RecurringTemplate) {
    try {
      await setActive.mutateAsync({ id: template.id, isActive: !template.is_active })
    } catch (error) {
      toast.error('No se pudo actualizar la plantilla', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    try {
      await deleteTemplate.mutateAsync(deleting.id)
      toast.success('Plantilla eliminada')
    } catch (error) {
      toast.error('No se pudo eliminar la plantilla', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <section className="mt-8" aria-labelledby="settings-recurring-title">
      <h2 id="settings-recurring-title" className="text-lg font-semibold text-foreground">
        Movimientos recurrentes
      </h2>
      <p className="text-sm text-muted-foreground">
        Se proyectan cada mes como borradores para revisar. Nunca se registran solos.
      </p>

      {templatesQuery.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando movimientos recurrentes...</p>
      ) : templatesQuery.isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          No se pudieron cargar tus movimientos recurrentes. Recarga la página para intentarlo de
          nuevo.
        </p>
      ) : templates.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Aún no tienes. Marca «Repetir cada mes» al registrar un ingreso o un gasto.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border rounded-md border border-border">
          {templates.map((template) => {
            const account = accountsById.get(template.account_id)
            const category = categoriesById.get(template.category_id)
            const problem = account?.is_archived
              ? 'Cuenta archivada: no se proyecta'
              : category?.is_archived
                ? 'Categoría archivada: no se proyecta'
                : null
            return (
              <li
                key={template.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {template.description}
                    {!template.is_active && (
                      <span className="text-muted-foreground"> · desactivada</span>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {template.type === 'expense' ? 'Gasto' : 'Ingreso'} de{' '}
                    {account ? formatAmount(template.amount_minor, account.currency_code) : '—'} ·
                    día {template.day_of_month} · {account?.name ?? 'Cuenta'} ·{' '}
                    {category?.name ?? 'Categoría'}
                  </p>
                  {problem && template.is_active && (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{problem}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => toggle(template)}
                  >
                    {template.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleting(template)}
                  >
                    Eliminar
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Eliminar plantilla recurrente"
        description="Dejará de proyectarse. Los borradores ya creados y los movimientos registrados no se borran."
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
      />
    </section>
  )
}
