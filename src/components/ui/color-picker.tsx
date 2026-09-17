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

const RAINBOW_GRADIENT =
  'conic-gradient(from 0deg, #E83E8C, #A855F7, #3B82F6, #16805B, #B26B00, #C62848, #0EA5E9, #E83E8C)'

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  // Fuera de las 8 muestras curadas: viene del selector nativo de abajo.
  const isCustom = value !== null && !(SWATCHES as readonly string[]).includes(value)
  const customValue = value ?? '#e83e8c'

  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Color">
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

      <label
        className={cn(
          'relative size-8 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 transition-transform',
          isCustom ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105',
        )}
        style={{ background: isCustom ? customValue : RAINBOW_GRADIENT }}
        title="Color personalizado"
      >
        <input
          type="color"
          value={customValue}
          onChange={(event) => onChange(event.target.value)}
          className="size-full cursor-pointer opacity-0"
          aria-label="Color personalizado"
        />
      </label>
    </div>
  )
}
