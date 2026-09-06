import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'

const THEMES = ['light', 'dark', 'system'] as const
type ThemeOption = (typeof THEMES)[number]

const ICONS: Record<ThemeOption, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

const LABELS: Record<ThemeOption, string> = {
  light: 'Tema claro',
  dark: 'Tema oscuro',
  system: 'Tema del sistema',
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

  function handleClick() {
    const nextIndex = (THEMES.indexOf(current) + 1) % THEMES.length
    setTheme(THEMES[nextIndex])
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
