import { forwardRef, useEffect, useState, type InputHTMLAttributes } from 'react'

import { Input } from '@/components/ui/input'
import {
  formatMajorUnits,
  getCurrencyExponent,
  groupMoneyText,
  moneyTextToMajor,
  sanitizeMoneyText,
  toMajorUnit,
  toMinorUnit,
} from '@/lib/currency'
import { cn } from '@/lib/utils'

interface AmountInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  /** Entero en unidades mínimas de `currency`. `0` se muestra vacío. */
  value: number
  onChange: (value: number) => void
  /** Moneda del importe: decide cuántos decimales se aceptan y se muestran. */
  currency?: string
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
  ({ value, onChange, currency = 'COP', className, placeholder = '0', ...props }, ref) => {
    const exponent = getCurrencyExponent(currency)
    const [focused, setFocused] = useState(false)
    const [raw, setRaw] = useState<string>('')
    const [display, setDisplay] = useState<string>(() =>
      value > 0 ? formatMajorUnits(toMajorUnit(value, currency), exponent) : '',
    )

    // Un valor que llega de fuera (reset del formulario) reemplaza lo escrito.
    useEffect(() => {
      if (!focused) {
        const formatted = value > 0 ? formatMajorUnits(toMajorUnit(value, currency), exponent) : ''
        setRaw(value > 0 ? String(toMajorUnit(value, currency)) : '')
        setDisplay(formatted)
      }
    }, [value, currency, exponent, focused])

    function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
      const sanitized = sanitizeMoneyText(event.target.value, exponent)
      const major = moneyTextToMajor(sanitized)
      setRaw(sanitized)
      setDisplay(groupMoneyText(sanitized))
      onChange(major > 0 ? toMinorUnit(major, currency) : 0)

      const input = event.target
      requestAnimationFrame(() => {
        input.setSelectionRange(input.value.length, input.value.length)
      })
    }

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
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          className={cn('pl-7', className)}
          value={display}
          onChange={handleChange}
          onFocus={(event) => {
            setFocused(true)
            const input = event.target
            requestAnimationFrame(() => {
              input.setSelectionRange(input.value.length, input.value.length)
            })
          }}
          onBlur={(event) => {
            setFocused(false)
            const groupedRaw = groupMoneyText(raw)
            setDisplay(exponent > 0 ? formatMajorUnits(moneyTextToMajor(raw), exponent) : groupedRaw)
            event.target.setSelectionRange(0, 0)
          }}
        />
      </div>
    )
  },
)
AmountInput.displayName = 'AmountInput'