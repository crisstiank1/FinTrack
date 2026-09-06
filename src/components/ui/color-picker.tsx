import { cn } from '@/lib/utils'

export const SWATCHES = [
  '#E83E8C',
  '#A855F7',
  '#3B82F6',
  '#16805B',
  '#B26B00',
  '#C62848',
  '#0EA5E9',
  '#64748B',
] as const

interface ColorPickerProps {
  value: string | null
  onChange: (value: string) => void
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
      {SWATCHES.map((hex) => {
        const selected = value === hex

        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={hex}
            title={hex}
            onClick={() => onChange(hex)}
            className={cn(
              'size-8 rounded-full border-2 transition-transform',
              selected ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105',
            )}
            style={{ backgroundColor: hex }}
          />
        )
      })}
    </div>
  )
}
