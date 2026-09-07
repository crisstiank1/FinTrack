import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

/**
 * Recharts pinta SVG y necesita valores de color reales: no acepta clases de
 * Tailwind ni resuelve `var(--token)` en todas sus props. Para no romper la
 * regla de "no hardcodear colores de tema en componentes" (docs/03-ui-ux.md),
 * leemos los mismos tokens CSS que usa el resto de la app y los reevaluamos
 * cada vez que cambia el tema.
 */
export interface ChartTheme {
  income: string
  expense: string
  balance: string
  grid: string
  axis: string
  surface: string
  border: string
  foreground: string
}

/**
 * Valores del tema claro de index.css. Se usan mientras el efecto no ha corrido
 * y en entornos sin CSS aplicado (jsdom), donde getComputedStyle no devuelve
 * las variables personalizadas.
 */
const FALLBACK: ChartTheme = {
  income: '#16805b',
  expense: '#c62848',
  balance: '#e83e8c',
  grid: '#f1d8e2',
  axis: '#765362',
  surface: '#ffffff',
  border: '#f1d8e2',
  foreground: '#2b1720',
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme()
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK)

  useEffect(() => {
    const styles = getComputedStyle(document.documentElement)
    const read = (token: string, fallback: string) =>
      styles.getPropertyValue(token).trim() || fallback

    setTheme({
      income: read('--success', FALLBACK.income),
      expense: read('--danger', FALLBACK.expense),
      balance: read('--primary', FALLBACK.balance),
      grid: read('--border', FALLBACK.grid),
      axis: read('--muted-foreground', FALLBACK.axis),
      surface: read('--surface', FALLBACK.surface),
      border: read('--border', FALLBACK.border),
      foreground: read('--foreground', FALLBACK.foreground),
    })
  }, [resolvedTheme])

  return theme
}
