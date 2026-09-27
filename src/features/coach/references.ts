import { formatAmount } from '@/lib/currency'

import type { CoachContextSnapshot } from './contracts'

/**
 * Referencias al snapshot: `{{categories.c1.amount}}`.
 *
 * Es el único canal por el que una cifra puede aparecer en una respuesta del
 * Coach. El modelo escribe la ruta; el backend comprueba que existe; la
 * interfaz la sustituye por el valor formateado. Este módulo es compartido por
 * los tres pasos para que "qué es una referencia válida" tenga una sola
 * definición.
 */

/** `{{ruta.con.puntos}}`, con espacios opcionales dentro de las llaves. */
export const REFERENCE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*)\s*\}\}/g

export type ReferenceValue = string | number | null

/**
 * Todas las hojas del snapshot como `ruta → valor`.
 *
 * Solo las hojas son citables: `{{categories.c1}}` no es una cifra, es un
 * objeto. `version` queda fuera porque no es un dato del usuario, y la lista de
 * monedas excluidas se aplana a texto para poder citarla entera.
 */
export function flattenSnapshot(snapshot: CoachContextSnapshot): Map<string, ReferenceValue> {
  const leaves = new Map<string, ReferenceValue>()

  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) {
      leaves.set(path, value.join(', '))
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        walk(child, path === '' ? key : `${path}.${key}`)
      }
      return
    }
    if (typeof value === 'string' || typeof value === 'number' || value === null) {
      leaves.set(path, value)
    }
  }

  for (const [key, value] of Object.entries(snapshot)) {
    if (key !== 'version') walk(value, key)
  }

  return leaves
}

/** Rutas citadas en una plantilla, en orden de aparición. */
export function extractReferences(template: string): string[] {
  return [...template.matchAll(REFERENCE_PATTERN)].map((match) => match[1])
}

/**
 * Cómo se muestra el valor de una ruta.
 *
 * - `amount`: unidades mínimas → `formatAmount(valor, snapshot.currency)`, que
 *   aplica el exponente de la moneda. Nunca a mano.
 * - `percent`: ya en porcentaje (`28.4`), se muestra con un decimal y `%`.
 * - `points`: diferencia en puntos porcentuales.
 * - `count`: un entero sin unidad.
 * - `text`: tal cual.
 *
 * Se decide por la ruta y no por el valor: `450000` puede ser un importe o un
 * conteo, y adivinarlo por el número sería justo el error que esto evita.
 */
export type ReferenceKind = 'amount' | 'percent' | 'points' | 'count' | 'text'

const AMOUNT_KEYS = new Set([
  'currentMinor',
  'previousMinor',
  'amount',
  'budget',
  'spent',
  'remaining',
  'current',
  'previous',
  'difference',
  'incomeMinor',
  'expenseMinor',
  'netSavingsMinor',
])

const PERCENT_KEYS = new Set(['deltaPercent', 'percentage', 'differencePercent'])

export function referenceKind(path: string): ReferenceKind {
  const key = path.slice(path.lastIndexOf('.') + 1)

  // `current` y `previous` son importes en todas partes menos aquí, donde son
  // la tasa de ahorro de cada mes.
  if (path.startsWith('summary.savingsRate.')) return key === 'deltaPoints' ? 'points' : 'percent'
  if (path === 'exclusions.count') return 'count'
  if (PERCENT_KEYS.has(key)) return 'percent'
  if (AMOUNT_KEYS.has(key)) return 'amount'
  return 'text'
}

const DECIMAL = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/** Texto de una hoja según su tipo. `null` se muestra como raya, no como cero. */
export function formatReference(path: string, value: ReferenceValue, currency: string): string {
  if (value === null) return '—'
  if (typeof value === 'string') return value

  switch (referenceKind(path)) {
    case 'amount':
      return formatAmount(value, currency)
    case 'percent':
      return `${DECIMAL.format(value)} %`
    case 'points':
      return `${DECIMAL.format(value)} puntos`
    default:
      return String(value)
  }
}

/**
 * Sustituye cada `{{ruta}}` por su valor formateado.
 *
 * Solo se llama sobre contenido ya validado, así que toda ruta existe. Aun así,
 * una ruta desconocida se deja visible en vez de borrarse: si algún día pasara,
 * es mejor que se note.
 */
export function resolveTemplate(template: string, snapshot: CoachContextSnapshot): string {
  const leaves = flattenSnapshot(snapshot)

  return template.replace(REFERENCE_PATTERN, (match, path: string) =>
    leaves.has(path) ? formatReference(path, leaves.get(path) ?? null, snapshot.currency) : match,
  )
}
