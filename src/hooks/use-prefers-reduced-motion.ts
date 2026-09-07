import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Indica si el usuario pidió reducir el movimiento.
 *
 * index.css ya neutraliza las animaciones CSS, pero librerías como Recharts
 * animan desde JavaScript y esa regla no las alcanza: hay que consultarlas
 * y desactivarlas explícitamente.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(QUERY)
    setPrefersReducedMotion(media.matches)

    const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches)
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [])

  return prefersReducedMotion
}
