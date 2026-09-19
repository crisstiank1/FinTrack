import * as React from 'react'

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

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  /**
   * Valor en unidades mínimas de la cuenta (amount_minor), que no es el mismo
   * entero según la moneda: en COP `15000` son 15.000 de a peso; en USD `4500`
   * son 45,00. El exponente de `currency` hace la conversión a lo que se ve.
   */
  value: number
  onChange: (value: number) => void
  /** Moneda del importe: decide cuántos decimales se aceptan y se muestran. */
  currency?: string
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, currency = 'COP', ...props }, ref) => {
    const exponent = getCurrencyExponent(currency)
    const [focused, setFocused] = React.useState(false)
    const [raw, setRaw] = React.useState<string>('')
    const [display, setDisplay] = React.useState<string>(() =>
      value > 0 ? formatMajorUnits(toMajorUnit(value, currency), exponent) : '',
    )

    // Un valor que llega de fuera (editar un movimiento, reset del formulario)
    // reemplaza lo que se estuviera escribiendo.
    React.useEffect(() => {
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
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
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
          // Pisar decimales al salir del campo: lo que el usuario escribió como
          // `45` queda `45,00` cuando la moneda tiene centavos.
          const groupedRaw = groupMoneyText(raw)
          setDisplay(exponent > 0 ? formatMajorUnits(moneyTextToMajor(raw), exponent) : groupedRaw)
          event.target.setSelectionRange(0, 0)
        }}
      />
    )
  },
)
CurrencyInput.displayName = 'CurrencyInput'

export { CurrencyInput }