/**
 * Errores de dominio de la clasificación de categorías.
 *
 * Mismo criterio que `budgets/errors.ts` y `plan/errors.ts`: la lectura propaga
 * el error crudo —quien consulta solo necesita saber que falló— y **las
 * escrituras lo traducen**, porque ahí el usuario acaba de hacer algo y
 * necesita saber qué hacer ahora. Ningún mensaje filtra SQLSTATE, nombres de
 * restricciones, UUID ni texto de Postgres.
 *
 * A diferencia del Plan mensual, aquí no hace falta saber qué operación estaba
 * en curso: las tres escrituras tocan una sola tabla con una sola restricción
 * única, así que cada SQLSTATE significa lo mismo venga de donde venga.
 */

export type ClassificationErrorCode =
  /** U1: esa categoría ya tiene grupo. Otra pestaña se adelantó. */
  | 'already_classified'
  /** T1: la categoría no es de tipo `expense`. */
  | 'category_not_expense'
  /** T1: la categoría está archivada. */
  | 'category_archived'
  /** La categoría no existe, no es del usuario o dejó de estar visible. */
  | 'category_missing'
  /** La clasificación que se editaba o borraba ya no está. */
  | 'row_missing'
  /** RLS, permisos o sesión caducada. */
  | 'forbidden'
  /** No se pudo hablar con el servidor. */
  | 'network'
  | 'unknown'

const MESSAGES: Record<ClassificationErrorCode, string> = {
  already_classified:
    'Esa categoría ya tiene un grupo asignado. Refresca la pantalla para ver cuál.',
  category_not_expense: 'Solo se pueden clasificar categorías de gasto.',
  category_archived: 'No se puede clasificar una categoría archivada.',
  category_missing: 'Esa categoría ya no está disponible.',
  row_missing: 'Esa clasificación ya no existe. Refresca la pantalla.',
  forbidden:
    'Tu sesión no tiene permiso para esta operación. Vuelve a iniciar sesión e inténtalo de nuevo.',
  network: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  unknown: 'Ocurrió un error inesperado al clasificar la categoría. Inténtalo de nuevo.',
}

export class ClassificationError extends Error {
  readonly code: ClassificationErrorCode

  constructor(code: ClassificationErrorCode) {
    super(MESSAGES[code])
    this.name = 'ClassificationError'
    this.code = code
  }
}

/**
 * Forma mínima de un error de PostgREST. Se declara aquí, y no se importa de
 * `@supabase/supabase-js`, para que el mapeo se pueda probar sin el cliente.
 */
interface PostgrestLikeError {
  code?: string | null
  message?: string | null
}

function isPostgrestLike(error: unknown): error is PostgrestLikeError {
  return typeof error === 'object' && error !== null && ('code' in error || 'message' in error)
}

/**
 * Los tres mensajes de `validate_category_classification` llegan con el mismo
 * `P0001`, así que distinguirlos exige mirar el texto. Se buscan fragmentos en
 * minúscula para no depender de la normalización Unicode de la respuesta.
 *
 * Es el punto más frágil del mapeo, igual que en `/budgets` y `/plan`, y por el
 * mismo motivo: darle a cada regla su propio SQLSTATE exigiría cambiar el
 * trigger, y esta entrega no añade migraciones. Si el texto cambia, cae a
 * `unknown`, que sigue siendo un mensaje correcto aunque menos preciso.
 */
function mapTriggerMessage(message: string): ClassificationErrorCode {
  const text = message.toLowerCase()

  if (text.includes('archivada')) return 'category_archived'
  if (text.includes('de gasto')) return 'category_not_expense'
  if (text.includes('no existe')) return 'category_missing'

  return 'unknown'
}

/** Traduce cualquier fallo de escritura a un error de dominio. */
export function toClassificationError(error: unknown): ClassificationError {
  if (error instanceof ClassificationError) return error

  // Un fallo de `fetch` llega como TypeError, sin código SQL: es la forma en
  // que se manifiesta la falta de red desde el navegador.
  if (error instanceof TypeError) return new ClassificationError('network')

  if (!isPostgrestLike(error)) return new ClassificationError('unknown')

  switch (error.code ?? '') {
    // Excepción del trigger de reglas de negocio.
    case 'P0001':
      return new ClassificationError(mapTriggerMessage(error.message ?? ''))

    // U1 — `unique (user_id, category_id)`. Es el único índice único de la
    // tabla, así que no hace falta saber qué operación lo provocó.
    case '23505':
      return new ClassificationError('already_classified')

    // Clave foránea compuesta. Al ser diferida puede llegar en el commit y no
    // en la sentencia, pero el SQLSTATE es el mismo.
    case '23503':
      return new ClassificationError('category_missing')

    // CHECK del esquema: `budget_group` fuera de los tres valores. Zod debería
    // haberlo atajado antes; aquí solo llega desde un cliente desincronizado.
    case '23514':
      return new ClassificationError('unknown')

    case '42501':
      return new ClassificationError('forbidden')

    // PostgREST: JWT ausente, caducado o inválido.
    case 'PGRST301':
      return new ClassificationError('forbidden')

    // PostgREST: la fila que iba a devolver `.single()` no estaba.
    case 'PGRST116':
      return new ClassificationError('row_missing')

    default:
      return new ClassificationError('unknown')
  }
}
