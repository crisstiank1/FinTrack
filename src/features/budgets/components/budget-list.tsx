import { useState } from 'react'
import { Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getIcon } from '@/lib/icons'
import type { Tables } from '@/types/database.types'

import type { BudgetProgress } from '../progress'
import { BudgetHistory } from './budget-history'
import { BudgetProgressBar } from './budget-progress-bar'

export interface BudgetListItem {
  category: Tables<'categories'>
  progress: BudgetProgress
  /** Todas las versiones de esa categoría, para el historial. */
  versions: Tables<'budgets'>[]
}

interface BudgetListProps {
  items: BudgetListItem[]
  currencyCode: string
  onEdit: (category: Tables<'categories'>) => void
  onCorrect: (budgetId: string, amountMinor: number) => void | Promise<void>
  onDelete: (budgetId: string) => void | Promise<void>
  isSubmitting?: boolean
}

export function BudgetList({
  items,
  currencyCode,
  onEdit,
  onCorrect,
  onDelete,
  isSubmitting,
}: BudgetListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item, index) => (
        <BudgetRow
          key={item.category.id}
          item={item}
          index={index}
          currencyCode={currencyCode}
          onEdit={onEdit}
          onCorrect={onCorrect}
          onDelete={onDelete}
          isSubmitting={isSubmitting}
        />
      ))}
    </ul>
  )
}

function BudgetRow({
  item,
  index,
  currencyCode,
  onEdit,
  onCorrect,
  onDelete,
  isSubmitting,
}: {
  item: BudgetListItem
  index: number
} & Omit<BudgetListProps, 'items'>) {
  const [showHistory, setShowHistory] = useState(false)
  const { category, progress, versions } = item
  const Icon = getIcon(category.icon)
  const accentColor = category.color ?? '#765362'

  return (
    <li
      className="animate-card-in rounded-xl border border-border bg-card p-4"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex size-8 items-center justify-center rounded-full"
            style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
          >
            <Icon className="size-4" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{category.name}</span>
            {category.is_archived && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                Archivada
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Una categoría archivada no puede estrenar presupuesto: cualquier
              INSERT con ella lo rechaza el trigger. Solo queda corregir o
              eliminar lo que ya existe, que es lo que ofrece el historial. */}
          {!category.is_archived && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onEdit(category)}
              aria-label={`Editar presupuesto de ${category.name}`}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Editar
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((open) => !open)}
          >
            {showHistory ? 'Ocultar historial' : 'Historial'}
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <BudgetProgressBar
          progress={progress}
          categoryName={category.name}
          currencyCode={currencyCode}
        />
      </div>

      {showHistory && (
        <div className="mt-4 border-t border-border pt-4">
          <BudgetHistory
            categoryName={category.name}
            rows={versions}
            currencyCode={currencyCode}
            onCorrect={onCorrect}
            onDelete={onDelete}
            isSubmitting={isSubmitting}
          />
        </div>
      )}
    </li>
  )
}
