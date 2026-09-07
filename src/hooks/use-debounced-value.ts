import { useEffect, useState } from 'react'

/**
 * Retrasa la propagación de un valor que cambia rápido.
 *
 * Se usa en la búsqueda del libro: sin esto cada tecla dispararía una consulta
 * al servidor, y las respuestas podrían además llegar desordenadas.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timeout)
  }, [value, delayMs])

  return debounced
}
