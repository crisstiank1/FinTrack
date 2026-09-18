import { AlertCircle } from 'lucide-react'
import type { ReactNode } from 'react'

import { CurrencyInput } from '@/components/ui/currency-input'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface SheetCellProps {
  error?: string
  className?: string
  children: ReactNode
}

/**
 * Celda de la rejilla: envuelve al control y, cuando la validación (espejo de
 * `register_sheet_draft`) la marca, muestra el texto de error debajo. El borde
 * de error lo pintan los controles con `aria-invalid`.
 */
export function SheetCell({ error, className, children }: SheetCellProps) {
  return (
    <div className={cn('min-w-0', className)}>
      {children}
      {error && (
        <p
          role="alert"
          className="mt-0.5 flex items-start gap-1 text-xs leading-tight text-destructive"
        >
          <AlertCircle className="mt-px size-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

export interface GridCellProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  placeholder?: string
  maxLength?: number
}

/** Caja de texto (o fecha) de una celda de la rejilla. */
export function InputCell({
  value,
  onChange,
  onBlur,
  error,
  placeholder,
  maxLength,
  type = 'text',
}: GridCellProps & { type?: 'text' | 'date' }) {
  return (
    <SheetCell error={error}>
      <Input
        className="h-9"
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </SheetCell>
  )
}

export interface SelectOption {
  value: string
  label: string
}

/** Selector nativo de una celda (cuenta, tipo, categoría). */
export function SelectCell({
  value,
  onChange,
  onBlur,
  error,
  placeholder = 'Selecciona…',
  options,
  label,
}: GridCellProps & { options: readonly SelectOption[]; label: string }) {
  return (
    <SheetCell error={error}>
      <Select
        className={cn('h-9', !!error && 'border-destructive focus-visible:ring-destructive')}
        value={value}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </SheetCell>
  )
}

/** Importe en unidades mínimas; debajo, la lectura en la moneda de la cuenta si la hay. */
export function AmountCell({
  value,
  onChange,
  onBlur,
  error,
  helper,
  currency = 'COP',
}: GridCellProps & { helper?: string; currency?: string }) {
  return (
    <SheetCell error={error}>
      <CurrencyInput
        className="h-9"
        currency={currency}
        value={value ? Number(value) : 0}
        onChange={(numeric) => onChange(numeric ? String(numeric) : '')}
        onBlur={onBlur}
      />
      {helper && <p className="mt-0.5 truncate text-xs text-muted-foreground">{helper}</p>}
    </SheetCell>
  )
}
