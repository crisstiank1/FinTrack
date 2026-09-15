import { useSearchParams } from 'react-router-dom'

import { currentMonthKey } from '@/lib/dates'

/**
 * El mes de una pantalla vive en la URL como `?month=YYYY-MM`.
 *
 * Así un enlace desde otra pantalla abre el mismo mes en el que estaba quien lo
 * pulsó, y recargar no devuelve al mes actual. Es el contrato de `/budgets` y de
 * `/transactions`; quien enlaza a ellas lo construye con ese mismo formato.
 *
 * Tres reglas comunes:
 *
 * - **Formato estricto** `YYYY-MM`, con mes de 01 a 12: es el valor de un
 *   `<input type="month">` y el de `currentMonthKey()`.
 * - **Ausente o inválido cae al mes actual sin reescribir la URL.** Un enlace
 *   roto no debe convertirse en otro enlace distinto sin que nadie lo pida.
 * - **Escribir reemplaza la entrada del historial** y conserva los demás
 *   parámetros: cambiar de mes no llena el botón «Atrás» ni borra nada ajeno.
 */

const MONTH_KEY = /^\d{4}-(?:0[1-9]|1[0-2])$/
const PARAM = 'month'

function isMonthKey(value: string | null): value is string {
  return value !== null && MONTH_KEY.test(value)
}

function useWriteMonth(): (value: string) => void {
  const [, setSearchParams] = useSearchParams()

  return (value: string) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set(PARAM, value)
        return next
      },
      { replace: true },
    )
}

/**
 * Mes obligatorio: siempre hay uno. Lo usa `/budgets`, donde un presupuesto
 * pertenece siempre a un mes concreto.
 */
export function useMonthParam(): [string, (monthKey: string) => void] {
  const [searchParams] = useSearchParams()
  const write = useWriteMonth()

  const raw = searchParams.get(PARAM)
  return [isMonthKey(raw) ? raw : currentMonthKey(), write]
}

/**
 * Mes opcional: `undefined` significa **todos los meses**. Lo usa
 * `/transactions`, donde vaciar el selector de mes muestra el historial entero.
 *
 * La ausencia y el vacío no significan lo mismo, y la diferencia es deliberada:
 *
 * - `?month` ausente o inválido → mes actual, el estado de entrada normal.
 * - `?month=` presente y vacío → todos los meses, la elección explícita de
 *   quien vació el selector, que así sobrevive a recargar y a compartir.
 */
export function useOptionalMonthParam(): [string | undefined, (monthKey?: string) => void] {
  const [searchParams] = useSearchParams()
  const write = useWriteMonth()

  const raw = searchParams.get(PARAM)
  const monthKey = raw === '' ? undefined : isMonthKey(raw) ? raw : currentMonthKey()

  return [monthKey, (next?: string) => write(next ?? '')]
}
