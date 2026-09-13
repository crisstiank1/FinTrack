import { useCallback, useSyncExternalStore } from 'react'

/**
 * Indica si una media query se cumple, y se actualiza cuando deja de hacerlo.
 *
 * Usa `useSyncExternalStore` en vez del par `useState` + `useEffect` de
 * `usePrefersReducedMotion`: el primer render ya lee `matchMedia`, así que una
 * interfaz que cambia de estructura según el ancho no pinta primero la
 * variante equivocada y luego salta.
 *
 * Sin `window` —un render en servidor— devuelve `false`, el valor más estrecho.
 * Es determinista y nunca produce más estructura de la que cabe.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)

      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', onChange)
        return () => media.removeEventListener('change', onChange)
      }

      // Safari anterior a 14 solo conoce la API antigua. Si tampoco existe, el
      // error sale tal cual: ocultarlo dejaría la interfaz congelada en un ancho.
      media.addListener(onChange)
      return () => media.removeListener(onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
