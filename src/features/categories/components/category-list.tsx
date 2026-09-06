import { Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getIcon } from '@/lib/icons'
import type { Tables } from '@/types/database.types'

interface CategoryListProps {
  categories: Tables<'categories'>[]
  onEdit: (category: Tables<'categories'>) => void
  onArchive: (category: Tables<'categories'>) => void
}

export function CategoryList({ categories, onEdit, onArchive }: CategoryListProps) {
  const income = categories.filter((category) => category.type === 'income')
  const expense = categories.filter((category) => category.type === 'expense')

  return (
    <div className="flex flex-col gap-8">
      <CategoryGroup title="Ingresos" categories={income} onEdit={onEdit} onArchive={onArchive} />
      <CategoryGroup title="Gastos" categories={expense} onEdit={onEdit} onArchive={onArchive} />
    </div>
  )
}

function CategoryGroup({
  title,
  categories,
  onEdit,
  onArchive,
}: {
  title: string
  categories: Tables<'categories'>[]
  onEdit: (category: Tables<'categories'>) => void
  onArchive: (category: Tables<'categories'>) => void
}) {
  if (categories.length === 0) return null

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {categories.map((category, index) => {
          const Icon = getIcon(category.icon)
          const accentColor = category.color ?? (category.type === 'income' ? '#16805B' : '#765362')

          return (
            <div
              key={category.id}
              className="animate-card-in flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-opacity duration-300"
              style={{ animationDelay: `${index * 30}ms`, opacity: category.is_archived ? 0.6 : 1 }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex size-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <span className="text-sm font-medium text-foreground">{category.name}</span>
                {category.is_archived && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    Archivada
                  </span>
                )}
              </div>

              {!category.is_archived && (
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onEdit(category)}
                    aria-label={`Editar ${category.name}`}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onArchive(category)}>
                    Archivar
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
