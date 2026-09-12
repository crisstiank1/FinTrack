import { X } from 'lucide-react'
import { useId } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import {
  classificationGroupHint,
  classificationGroupLabel,
  UNCLASSIFIED_CATEGORY_LABEL,
} from '../labels'
import { historicalReason, type ClassifiedCategory } from '../mutations'
import { CLASSIFICATION_GROUPS, type ClassificationGroup } from '../schemas'

/** Categoría tal como la pinta el panel. */
export interface PanelCategory {
  id: string
  name: string
  type: string
  is_archived: boolean
}

interface ClassificationPanelProps {
  unclassified: ClassifiedCategory<PanelCategory>[]
  classified: ClassifiedCategory<PanelCategory>[]
  historical: ClassifiedCategory<PanelCategory>[]
  /** `true` mientras el usuario no tenga ninguna categoría de gasto. */
  hasNoExpenseCategories: boolean
  isBusy?: boolean
  onClassify: (categoryId: string, group: ClassificationGroup) => void
  onChangeGroup: (classificationId: string, group: ClassificationGroup) => void
  onRemove: (entry: ClassifiedCategory<PanelCategory>) => void
}

/**
 * Clasificación de las categorías de gasto en Necesidades, Deseos y Deuda.
 *
 * **No hay siembra, preclasificación ni sugerencias preseleccionadas.** Las
 * categorías empiezan sin grupo y la persona elige uno explícitamente. FinTrack
 * no deduce el grupo por el nombre de la categoría, por el importe, por el
 * historial ni por el presupuesto (docs/09-plan-mensual.md).
 *
 * Vive en Ajustes y no en `/plan` porque la clasificación pertenece a la
 * categoría y no al mes: clasificar «Vivienda» como necesidad cambia la lectura
 * de todos los meses, cerrados incluidos, y una pantalla encabezada por un mes
 * concreto daría a entender lo contrario.
 *
 * Tres bloques, y el tercero existe por una regla del esquema: el trigger
 * prohíbe **estrenar** una clasificación sobre una categoría archivada o que no
 * sea de gasto, pero permite seguir corrigiendo una que ya existe. Esas son las
 * «históricas», y sin ellas archivar una categoría dejaría sus meses cerrados
 * sin poder arreglarse.
 */
export function ClassificationPanel({
  unclassified,
  classified,
  historical,
  hasNoExpenseCategories,
  isBusy,
  onClassify,
  onChangeGroup,
  onRemove,
}: ClassificationPanelProps) {
  const titleId = useId()

  return (
    <section id="clasificacion-gastos" aria-labelledby={titleId} className="mt-12">
      <h2 id={titleId} className="text-lg font-semibold text-foreground">
        Clasificación de gastos
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Elige a qué grupo pertenece cada categoría de gasto. Es lo que permite que el Plan mensual
        reparta lo que realmente gastaste entre Necesidades, Deseos y Deuda. FinTrack no lo decide
        por ti, y una categoría puede quedarse sin clasificar.
      </p>

      {hasNoExpenseCategories ? (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Todavía no tienes categorías de gasto. Crea una para poder clasificarla.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          <Block
            title={UNCLASSIFIED_CATEGORY_LABEL}
            description="Su gasto queda fuera de los grupos del reparto hasta que elijas uno."
            entries={unclassified}
            emptyLabel="Todas tus categorías de gasto activas tienen grupo."
            isBusy={isBusy}
            onSelect={(entry, group) => onClassify(entry.category.id, group)}
            onRemove={onRemove}
          />

          <Block
            title="Clasificadas"
            description="Puedes cambiar el grupo cuando quieras; el cambio afecta a todos los meses."
            entries={classified}
            emptyLabel="Todavía no has clasificado ninguna categoría."
            isBusy={isBusy}
            onSelect={(entry, group) =>
              entry.classificationId && onChangeGroup(entry.classificationId, group)
            }
            onRemove={onRemove}
          />

          {historical.length > 0 && (
            <Block
              title="Archivadas con clasificación"
              description="Aquí también aparecen las que dejaron de ser de gasto. Conservan su grupo y puedes corregirlo, pero no podrías volver a clasificarlas desde cero."
              entries={historical}
              isBusy={isBusy}
              onSelect={(entry, group) =>
                entry.classificationId && onChangeGroup(entry.classificationId, group)
              }
              onRemove={onRemove}
            />
          )}
        </div>
      )}
    </section>
  )
}

interface BlockProps {
  title: string
  description: string
  entries: ClassifiedCategory<PanelCategory>[]
  /** Ausente en el bloque histórico, que solo se pinta cuando tiene filas. */
  emptyLabel?: string
  isBusy?: boolean
  onSelect: (entry: ClassifiedCategory<PanelCategory>, group: ClassificationGroup) => void
  onRemove: (entry: ClassifiedCategory<PanelCategory>) => void
}

function Block({
  title,
  description,
  entries,
  emptyLabel,
  isBusy,
  onSelect,
  onRemove,
}: BlockProps) {
  const titleId = useId()

  return (
    <div>
      <h3 id={titleId} className="text-sm font-semibold text-foreground">
        {title}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>

      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul aria-labelledby={titleId} className="mt-3 flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.category.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.category.name}
                </p>
                {entry.group === null ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {UNCLASSIFIED_CATEGORY_LABEL}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {classificationGroupHint[entry.group]}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1">
                {/* Botones de estado, no de acción: `aria-pressed` dice cuál
                    está elegido sin depender del color, y en «Sin clasificar»
                    ninguno lo está, que es exactamente el punto de partida. */}
                {CLASSIFICATION_GROUPS.map((group) => {
                  const isCurrent = entry.group === group

                  return (
                    <Button
                      key={group}
                      type="button"
                      variant={isCurrent ? 'default' : 'outline'}
                      size="sm"
                      aria-pressed={isCurrent}
                      disabled={isBusy}
                      // Volver a pulsar el grupo actual no escribe nada: sería
                      // una mutación que no cambia nada y un `updated_at`
                      // movido sin motivo.
                      onClick={() => !isCurrent && onSelect(entry, group)}
                      className={cn(!isCurrent && 'text-muted-foreground')}
                    >
                      {classificationGroupLabel[group]}
                    </Button>
                  )
                })}

                {entry.classificationId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={isBusy}
                    onClick={() => onRemove(entry)}
                    aria-label={`Quitar la clasificación de ${entry.category.name}`}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </div>

              {(entry.category.is_archived || entry.category.type !== 'expense') && (
                <span className="w-full text-xs text-muted-foreground">
                  {historicalReason(entry.category)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
