import * as React from 'react'

import { Input } from '@/components/ui/input'

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: number
  onChange: (value: number) => void
}

function formatThousands(digits: string): string {
  if (!digits) return ''
  return new Intl.NumberFormat('es-CO').format(Number(digits))
}

// Input de texto que muestra separadores de miles en formato local (es-CO)
// mientras el valor real que se envía a react-hook-form sigue siendo un
// entero simple (amount_minor no tiene decimales, ver lib/currency.ts).
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, ...props }, ref) => {
    const [display, setDisplay] = React.useState(() => formatThousands(String(value || '')))

    React.useEffect(() => {
      const digits = String(value ?? '').replace(/\D/g, '')
      setDisplay(formatThousands(digits))
    }, [value])

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      const digits = event.target.value.replace(/\D/g, '')
      const formatted = formatThousands(digits)
      setDisplay(formatted)
      onChange(digits ? Number(digits) : 0)

      const input = event.target
      requestAnimationFrame(() => {
        input.setSelectionRange(formatted.length, formatted.length)
      })
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={display}
        onChange={handleChange}
      />
    )
  },
)
CurrencyInput.displayName = 'CurrencyInput'

export { CurrencyInput }
