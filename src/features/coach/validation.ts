import type { CoachContextSnapshot } from './contracts'
import { extractReferences, flattenSnapshot, REFERENCE_PATTERN } from './references'
import type { CoachAnswerContent } from './responses'

/**
 * Validación de lo que devuelve el modelo.
 *
 * El prompt pide referencias en vez de cifras, pero un prompt es una petición,
 * no una garantía. Esto es la garantía: una respuesta que no pase por aquí no
 * llega nunca a la interfaz. Las reglas son deliberadamente estrictas; es
 * preferible rechazar una respuesta correcta y reintentar que mostrar una
 * cifra que no salió de los datos.
 */

/** Lo que se le pide al modelo, antes de validar. */
export interface ModelContent {
  title: string
  summary: string
  facts: string[]
  recommendations: string[]
  assumptions: string[]
}

export type ViolationCode =
  | 'invalid_json'
  | 'invalid_shape'
  | 'too_long'
  | 'unknown_reference'
  | 'free_number'
  | 'malformed_template'

export interface Violation {
  code: ViolationCode
  /** Qué campo falló. Para registrar y reintentar, nunca para mostrar al usuario. */
  field: string
}

export type ValidationResult =
  { ok: true; content: CoachAnswerContent } | { ok: false; violations: Violation[] }

export const CONTENT_LIMITS = {
  title: 120,
  summary: 700,
  item: 300,
  facts: 4,
  recommendations: 2,
  assumptions: 3,
} as const

/**
 * Formas en que una cifra puede colarse escrita a mano.
 *
 * Todas se buscan **fuera** de las referencias. Quedan permitidos los enteros
 * pequeños sin unidad ("1 o 2 semanas"), que no son datos del usuario. Cualquier
 * importe, porcentaje o fecha completa tiene que venir del snapshot.
 */
const FREE_NUMBER_PATTERNS: readonly RegExp[] = [
  // Código de moneda o símbolo pegado a un número: "COP 845.000", "USD45", "$ 20".
  /\b(COP|USD|ARS|EUR|MXN)\s*\$?\s*\d/i,
  /\$\s*\d/,
  // Cuatro o más cifras seguidas: importes y años.
  /\d{4,}/,
  // Separadores de miles: "845.000", "1,200".
  /\d{1,3}(?:[.,]\d{3})+/,
  // Decimales: "45,99", "18.5".
  /\d+[.,]\d+/,
  // Porcentajes: "18%", "18 %".
  /\d\s*%/,
  // Cifras abreviadas: "845 mil", "2 millones", "3k".
  /\d+\s*(?:mil|millones?|mill|k)\b/i,
]

function stripReferences(template: string): string {
  return template.replace(REFERENCE_PATTERN, ' ')
}

/** Convierte el texto del modelo en contenido, o dice por qué no se puede. */
export function parseModelContent(raw: string): ModelContent | Violation {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { code: 'invalid_json', field: 'root' }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { code: 'invalid_shape', field: 'root' }
  }

  const record = value as Record<string, unknown>
  const isStringList = (item: unknown): item is string[] =>
    Array.isArray(item) && item.every((entry) => typeof entry === 'string')

  if (typeof record.title !== 'string') return { code: 'invalid_shape', field: 'title' }
  if (typeof record.summary !== 'string') return { code: 'invalid_shape', field: 'summary' }

  for (const field of ['facts', 'recommendations', 'assumptions'] as const) {
    if (record[field] !== undefined && !isStringList(record[field])) {
      return { code: 'invalid_shape', field }
    }
  }

  return {
    title: record.title,
    summary: record.summary,
    facts: (record.facts as string[] | undefined) ?? [],
    recommendations: (record.recommendations as string[] | undefined) ?? [],
    assumptions: (record.assumptions as string[] | undefined) ?? [],
  }
}

/**
 * Comprueba el contenido contra el snapshot concreto que se envió.
 *
 * Se validan todas las plantillas y se devuelven todas las infracciones, no
 * solo la primera: el reintento puede decirle al modelo qué corregir.
 */
export function validateModelContent(
  content: ModelContent,
  snapshot: CoachContextSnapshot,
): ValidationResult {
  const leaves = flattenSnapshot(snapshot)
  const violations: Violation[] = []

  const fields: [string, string, number][] = [
    ['title', content.title, CONTENT_LIMITS.title],
    ['summary', content.summary, CONTENT_LIMITS.summary],
    ...content.facts.map((text, i): [string, string, number] => [
      `facts.${i}`,
      text,
      CONTENT_LIMITS.item,
    ]),
    ...content.recommendations.map((text, i): [string, string, number] => [
      `recommendations.${i}`,
      text,
      CONTENT_LIMITS.item,
    ]),
    ...content.assumptions.map((text, i): [string, string, number] => [
      `assumptions.${i}`,
      text,
      CONTENT_LIMITS.item,
    ]),
  ]

  if (content.title.trim() === '') violations.push({ code: 'invalid_shape', field: 'title' })
  if (content.summary.trim() === '') violations.push({ code: 'invalid_shape', field: 'summary' })
  if (content.facts.length > CONTENT_LIMITS.facts)
    violations.push({ code: 'too_long', field: 'facts' })
  if (content.recommendations.length > CONTENT_LIMITS.recommendations) {
    violations.push({ code: 'too_long', field: 'recommendations' })
  }
  if (content.assumptions.length > CONTENT_LIMITS.assumptions) {
    violations.push({ code: 'too_long', field: 'assumptions' })
  }

  const references: string[] = []

  for (const [field, text, limit] of fields) {
    if (text.length > limit) violations.push({ code: 'too_long', field })

    for (const path of extractReferences(text)) {
      if (!leaves.has(path)) violations.push({ code: 'unknown_reference', field })
      else if (!references.includes(path)) references.push(path)
    }

    const outside = stripReferences(text)

    // Una llave suelta tras quitar las referencias válidas es una referencia
    // mal escrita: "{{categories.c1.amount}" o "{amount}". Se rechaza en vez de
    // mostrar llaves al usuario.
    if (/[{}]/.test(outside)) violations.push({ code: 'malformed_template', field })

    if (FREE_NUMBER_PATTERNS.some((pattern) => pattern.test(outside))) {
      violations.push({ code: 'free_number', field })
    }
  }

  if (violations.length > 0) return { ok: false, violations }

  return {
    ok: true,
    content: {
      titleTemplate: content.title,
      summaryTemplate: content.summary,
      // Las deriva el backend, no el modelo: son las rutas que de verdad se
      // citaron, sin repetir y en orden de aparición.
      factReferences: references,
      factTemplates: content.facts,
      recommendationTemplates: content.recommendations,
      assumptionTemplates: content.assumptions,
    },
  }
}
