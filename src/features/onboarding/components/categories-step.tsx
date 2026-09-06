import { Button } from '@/components/ui/button'
import { DEFAULT_CATEGORIES, type DefaultCategory } from '@/features/categories/default-categories'
import { getIcon } from '@/lib/icons'

interface CategoriesStepProps {
  onBack: () => void
  onNext: () => void
}

export function CategoriesStep({ onBack, onNext }: CategoriesStepProps) {
  const income = DEFAULT_CATEGORIES.filter((category) => category.group === 'income')
  const essential = DEFAULT_CATEGORIES.filter((category) => category.group === 'essential')
  const flexible = DEFAULT_CATEGORIES.filter((category) => category.group === 'flexible')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Categorías listas para ti
        </h1>
        <p className="text-sm text-muted-foreground">
          Crearemos estas categorías predeterminadas. Podrás editarlas o crear las tuyas después
          desde Ajustes.
        </p>
      </div>

      <div className="flex max-h-72 flex-col gap-4 overflow-y-auto pr-1">
        <CategoryPreviewGroup title="Ingresos" items={income} />
        <CategoryPreviewGroup title="Gastos esenciales" items={essential} />
        <CategoryPreviewGroup title="Gastos flexibles" items={flexible} />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>
          Atrás
        </Button>
        <Button type="button" className="flex-1" onClick={onNext}>
          Crear categorías y continuar
        </Button>
      </div>
    </div>
  )
}

function CategoryPreviewGroup({ title, items }: { title: string; items: DefaultCategory[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((category) => {
          const Icon = getIcon(category.icon)
          return (
            <span
              key={category.name}
              className="flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1 text-xs text-foreground"
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {category.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}
