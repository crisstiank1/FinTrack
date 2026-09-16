import { forwardRef, type InputHTMLAttributes } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const thousands = new Intl.NumberFormat('es-CO')

interface AmountInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  /** Entero en unidades mínimas. `0` se muestra vacío: todavía no hay importe. */
  value: number
  onChange: (value: number) => void
}

/**
 * Importe con un «$» fijo delante, para el alta rápida del dashboard.
 *
 * Existe aparte de `CurrencyInput` por dos diferencias que ese componente
 * compartido no tiene: el «$» no se puede borrar porque no forma parte del
 * valor, y un importe en 0 se muestra vacío —con `0` de marcador— en vez de
 * escribir un cero que habría que borrar antes de teclear.
 *
 * El «$» es el mismo para COP, USD y ARS, así que no dice la moneda: eso lo
 * hacen la etiqueta del campo y la línea «Se registrará como…» de quien lo usa.
 */
export const AmountInput = forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onChange, className, placeholder = '0', ...props }, ref) => {
    const display = value > 0 ? thousands.format(value) : ''

    return (
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-semibold text-muted-foreground"
        >
          $
        </span>
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          className={cn('pl-7', className)}
          value={display}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '')
            onChange(digits ? Number(digits) : 0)

            // Al agrupar miles cambia la longitud: el cursor vuelve al final para
            // que seguir tecleando no escriba en medio de la cifra.
            const input = event.target
            requestAnimationFrame(() => {
              input.setSelectionRange(input.value.length, input.value.length)
            })
          }}
        />
      </div>
    )
  },
)
AmountInput.displayName = 'AmountInput'
