import { ICON_KEYS, getIcon } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface IconPickerProps {
  value: string | null
  onChange: (value: string) => void
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-7 gap-2 sm:grid-cols-9" role="radiogroup" aria-label="Ícono">
      {ICON_KEYS.map((key) => {
        const Icon = getIcon(key)
        const selected = value === key

        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={key}
            title={key}
            onClick={() => onChange(key)}
            className={cn(
              'flex size-9 items-center justify-center rounded-md border transition-colors',
              selected
                ? 'border-primary bg-primary-soft text-primary'
                : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
