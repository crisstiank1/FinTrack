import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'

/** Solo claro y oscuro: el modo «sistema» se retiró en M17. */
const THEMES = ['light', 'dark'] as const
type ThemeOption = (typeof THEMES)[number]

const ICONS: Record<ThemeOption, typeof Sun> = {
  light: Sun,
  dark: Moon,
}

const LABELS: Record<ThemeOption, string> = {
  light: 'Tema claro',
  dark: 'Tema oscuro',
}

function isThemeOption(value: string | undefined): value is ThemeOption {
  return !!value && (THEMES as readonly string[]).includes(value)
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const current: ThemeOption = mounted && isThemeOption(theme) ? theme : 'light'
  const Icon = ICONS[current]

  // Cualquier valor que no sea claro u oscuro se trata como claro, así que el
  // botón siempre lleva a uno de los dos.
  function handleClick() {
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleClick}
      aria-label={`Cambiar tema. Tema actual: ${LABELS[current]}`}
      title={LABELS[current]}
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  )
}
