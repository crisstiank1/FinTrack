import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

type ThemeProviderProps = ComponentProps<typeof NextThemesProvider>

const THEMES = ['light', 'dark']

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    // Solo claro y oscuro (M17). La conversión de una preferencia «sistema»
    // guardada antes ocurre en `index.html`, antes de que esto se monte.
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={THEMES}
      storageKey="fintrack-theme"
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
