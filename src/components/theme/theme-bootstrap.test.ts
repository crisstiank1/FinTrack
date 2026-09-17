import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import indexHtml from '../../../index.html?raw'

/**
 * Prueba el script en línea de `index.html` tal cual está publicado: es el que
 * aplica el tema antes del primer pintado y el que convierte, una sola vez, una
 * preferencia «sistema» guardada antes de M17.
 */
const bootstrapScript = (() => {
  const match = indexHtml.match(/<script>([\s\S]*?)<\/script>/)
  if (!match) throw new Error('index.html no tiene el script de tema en línea')
  return match[1]
})()

function runBootstrap({ stored, prefersDark }: { stored: string | null; prefersDark: boolean }) {
  if (stored === null) localStorage.removeItem('fintrack-theme')
  else localStorage.setItem('fintrack-theme', stored)

  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : false,
      media: query,
    })),
  )

  new Function(bootstrapScript)()
}

// El enlace del favicon se crea una vez y no se quita: cada ejecución del script
// deja un MutationObserver que lo actualiza cuando cambia la clase del documento.
const favicon = document.createElement('link')
favicon.id = 'favicon'
document.head.appendChild(favicon)

beforeEach(() => {
  document.documentElement.className = ''
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('script de tema de index.html', () => {
  it('convierte «sistema» en oscuro si el dispositivo está en oscuro, y lo guarda', () => {
    runBootstrap({ stored: 'system', prefersDark: true })

    expect(localStorage.getItem('fintrack-theme')).toBe('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('convierte «sistema» en claro si el dispositivo está en claro, y lo guarda', () => {
    runBootstrap({ stored: 'system', prefersDark: false })

    expect(localStorage.getItem('fintrack-theme')).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('una preferencia explícita no se toca, aunque el dispositivo diga lo contrario', () => {
    runBootstrap({ stored: 'light', prefersDark: true })

    expect(localStorage.getItem('fintrack-theme')).toBe('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('el oscuro guardado se aplica antes del primer pintado', () => {
    runBootstrap({ stored: 'dark', prefersDark: false })

    expect(document.documentElement).toHaveClass('dark')
  })

  it('sin preferencia guardada no escribe nada y queda en claro', () => {
    runBootstrap({ stored: null, prefersDark: true })

    expect(localStorage.getItem('fintrack-theme')).toBeNull()
    expect(document.documentElement).not.toHaveClass('dark')
  })
})
