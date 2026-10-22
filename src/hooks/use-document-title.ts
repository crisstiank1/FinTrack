import { useEffect } from 'react'

/**
 * Título de la pestaña: «<página> · FinTrack». Los lectores de pantalla lo
 * anuncian al cambiar de ruta y es lo que distingue varias pestañas abiertas.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} · FinTrack`
    return () => {
      document.title = previous
    }
  }, [title])
}
