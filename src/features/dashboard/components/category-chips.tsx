import { useState } from 'react'

import { getIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

/** Categoría tal como la pinta un chip. */
export interface CategoryChip {
  id: string
  name: string
  icon: string | null
}

interface CategoryChipsProps {
  categories: CategoryChip[]
  value?: string
  onChange: (category: CategoryChip) => void
  /** Chips a la vista antes de «Más…». */
  visibleCount?: number
  /** Nombre accesible del grupo. */
  label?: string
}

/**
 * Categorías como chips, para elegir con un toque en vez de abrir un desplegable.
 *
 * Se muestran las primeras `visibleCount` —quien llama las ordena por uso— y el
 * resto queda tras «Más…». Sin ese corte, un usuario con veinte categorías
 * tendría un muro de chips que empuja el resto del formulario fuera de la
 * pantalla; con él, lo habitual está a un toque y lo raro a dos.
 *
 * La elegida siempre se ve, aunque esté fuera de las primeras: esconder la
 * categoría seleccionada haría dudar de qué se va a guardar.
 */
export function CategoryChips({
  categories,
  value,
  onChange,
  visibleCount = 8,
  label = 'Categoría',
}: CategoryChipsProps) {
  const [isExpanded, setExpanded] = useState(false)

  if (categories.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No tienes categorías de este tipo. Créalas en Ajustes.
      </p>
    )
  }

  const hasMore = !isExpanded && categories.length > visibleCount
  const visible = isExpanded ? categories : withSelected(categories, value, visibleCount)

  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {visible.map((category) => {
        const Icon = getIcon(category.icon)
        const isSelected = category.id === value

        return (
          <button
            key={category.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(category)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isSelected
                ? 'border-primary bg-primary/12 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {category.name}
          </button>
        )
      })}

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Más…
        </button>
      )}
    </div>
  )
}

/** Las primeras `count`, con la elegida dentro aunque no estuviera. */
function withSelected(
  categories: CategoryChip[],
  value: string | undefined,
  count: number,
): CategoryChip[] {
  const head = categories.slice(0, count)
  if (!value || head.some((category) => category.id === value)) return head

  const selected = categories.find((category) => category.id === value)
  return selected ? [selected, ...head.slice(0, count - 1)] : head
}
