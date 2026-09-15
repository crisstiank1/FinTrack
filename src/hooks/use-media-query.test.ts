import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useMediaQuery } from './use-media-query'

type Listener = () => void

/**
 * `matchMedia` controlable: `src/test/setup.ts` deja uno que siempre responde
 * `false` y no avisa de cambios, así que aquí se sustituye por uno que sí.
 */
function installMatchMedia({ legacy = false } = {}) {
  let matches = false
  const listeners = new Set<Listener>()

  const original = window.matchMedia

  window.matchMedia = ((query: string) => {
    const base = {
      get matches() {
        return matches
      },
      media: query,
      onchange: null,
      dispatchEvent: () => false,
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
    }

    if (legacy) return base
    return {
      ...base,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    }
  }) as unknown as typeof window.matchMedia

  return {
    listeners,
    set(next: boolean) {
      matches = next
      act(() => listeners.forEach((listener) => listener()))
    },
    restore() {
      window.matchMedia = original
    },
  }
}

describe('useMediaQuery', () => {
  let media: ReturnType<typeof installMatchMedia>

  beforeEach(() => {
    media = installMatchMedia()
  })

  afterEach(() => {
    media.restore()
  })

  it('devuelve el valor de la consulta desde el primer render', () => {
    media.set(true)

    const { result } = renderHook(() => useMediaQuery('(min-width: 40rem)'))

    expect(result.current).toBe(true)
  })

  it('se actualiza cuando la consulta cambia', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 64rem)'))
    expect(result.current).toBe(false)

    media.set(true)
    expect(result.current).toBe(true)

    media.set(false)
    expect(result.current).toBe(false)
  })

  it('retira su listener al desmontarse', () => {
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 40rem)'))
    expect(media.listeners.size).toBe(1)

    unmount()

    expect(media.listeners.size).toBe(0)
  })

  it('después de desmontarse no recibe más actualizaciones', () => {
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 40rem)'))
    unmount()

    media.set(true)

    expect(result.current).toBe(false)
  })

  it('funciona con la API antigua addListener/removeListener', () => {
    media.restore()
    media = installMatchMedia({ legacy: true })

    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 40rem)'))
    media.set(true)
    expect(result.current).toBe(true)

    unmount()
    expect(media.listeners.size).toBe(0)
  })
})
