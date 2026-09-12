/**
 * Errores de dominio de las **escrituras** del Plan mensual.
 *
 * Las lecturas siguen propagando el error crudo, como el resto del
 * repositorio: quien consulta solo necesita saber que falló. Escribir es otra
 * cosa: el usuario acaba de hacer algo y necesita saber qué hacer ahora, así
 * que aquí se traduce a un `code` estable y un mensaje accionable. Ningún
 * mensaje filtra SQLSTATE, nombres de restricciones, UUID ni texto de Postgres.
 *
 * La traducción **necesita saber qué se estaba haciendo**. Tres reglas
 * distintas del esquema comparten el mismo `23505` —un mes repetido, una
 * posición repetida y una categoría ya vinculada— y sus consecuencias no se
 * parecen en nada: la primera se resuelve sola, la segunda pide reintentar y la
 * tercera es un error del usuario. Deducirlo del texto del error sería
 * adivinar; el llamador ya lo sabe y lo dice.
 */

/** Qué se estaba escribiendo cuando falló. */
export type PlanOperation =
  | 'create_plan_month'
  | 'save_income_source'
  | 'save_income_source_categories'
  | 'delete_income_source'

export type PlanErrorCode =
  /** El mes ya existía: otra pestaña se adelantó. Se resuelve releyendo. */
  | 'month_conflict'
  /** Hubo conflicto y, al releer, el mes tampoco estaba. */
  | 'month_missing_after_conflict'
  /** Otra sesión escribió antes; lo que había en pantalla ya no vale. */
  | 'conflict'
  /** U9: esa categoría de ingreso ya alimenta otra fuente del mes. */
  | 'category_already_linked'
  /** T2: la categoría no es de tipo `income`. */
  | 'category_not_income'
  /** T2: la categoría está archivada. */
  | 'category_archived'
  /** La categoría no existe, no es del usuario o dejó de estar visible. */
  | 'category_missing'
  /** La fila que se editaba o borraba ya no está. */
  | 'row_missing'
  /** CHECK del esquema: importe negativo o nombre fuera de rango. */
  | 'invalid_input'
  /** RLS, permisos o sesión caducada. */
  | 'forbidden'
  /** No se pudo hablar con el servidor. */
  | 'network'
  | 'unknown'

const MESSAGES: Record<PlanErrorCode, string> = {
  month_conflict: 'El plan de este mes ya existía. Lo abrimos en lugar de crear otro.',
  month_missing_after_conflict:
    'No pudimos abrir el plan de este mes. Vuelve a intentarlo en un momento.',
  conflict:
    'Esta pantalla cambió desde otra pestaña o dispositivo. Revisa lo que hay ahora y vuelve a guardar.',
  category_already_linked:
    'Esa categoría de ingreso ya alimenta otra fuente de este mes. Quítala de allí antes de usarla aquí.',
  category_not_income: 'Solo puedes vincular categorías de ingreso.',
  category_archived: 'No se puede vincular una categoría archivada.',
  category_missing: 'Esa categoría ya no está disponible.',
  row_missing: 'Lo que intentas modificar ya no existe. Refresca la pantalla.',
  invalid_input: 'Revisa el nombre y el monto: el monto debe ser un entero de cero o más.',
  forbidden:
    'Tu sesión no tiene permiso para esta operación. Vuelve a iniciar sesión e inténtalo de nuevo.',
  network: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  unknown: 'Ocurrió un error inesperado al guardar el plan. Inténtalo de nuevo.',
}

export class PlanError extends Error {
  readonly code: PlanErrorCode

  constructor(code: PlanErrorCode) {
    super(MESSAGES[code])
    this.name = 'PlanError'
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
 * Qué significa un `23505` en cada operación. Es exactamente el dato que el
 * SQLSTATE no lleva consigo.
 */
const UNIQUE_VIOLATION: Record<PlanOperation, PlanErrorCode> = {
  create_plan_month: 'month_conflict',
  save_income_source: 'conflict',
  save_income_source_categories: 'category_already_linked',
  delete_income_source: 'unknown',
}

/**
 * Los tres mensajes de `validate_income_source_category` llegan con el mismo
 * `P0001`, así que distinguirlos exige mirar el texto. Se buscan fragmentos en
 * minúscula para no depender de la normalización Unicode de la respuesta.
 *
 * Es el punto más frágil del mapeo, igual que en `/budgets`, y por el mismo
 * motivo: darle a cada regla su propio SQLSTATE exigiría cambiar el trigger, y
 * esta entrega no añade migraciones. Si el texto cambia, cae a `unknown`, que
 * sigue siendo un mensaje correcto aunque menos preciso.
 */
function mapTriggerMessage(message: string): PlanErrorCode {
  const text = message.toLowerCase()

  if (text.includes('archivada')) return 'category_archived'
  if (text.includes('de ingreso')) return 'category_not_income'
  if (text.includes('no existe')) return 'category_missing'

  return 'unknown'
}

/** Traduce cualquier fallo de escritura a un error de dominio. */
export function toPlanError(error: unknown, operation: PlanOperation): PlanError {
  if (error instanceof PlanError) return error

  // Un fallo de `fetch` llega como TypeError, sin código SQL: es la forma en
  // que se manifiesta la falta de red desde el navegador.
  if (error instanceof TypeError) return new PlanError('network')

  if (!isPostgrestLike(error)) return new PlanError('unknown')

  switch (error.code ?? '') {
    // Excepción del trigger de reglas de negocio.
    case 'P0001':
      return new PlanError(mapTriggerMessage(error.message ?? ''))

    case '23505':
      return new PlanError(UNIQUE_VIOLATION[operation])

    // Clave foránea compuesta. Al ser diferida puede llegar en el commit y no
    // en la sentencia, pero el SQLSTATE es el mismo.
    case '23503':
      return new PlanError('category_missing')

    // CHECK del esquema: `planned_minor >= 0`, `position >= 0` o el largo del
    // nombre. Zod debería haberlos atajado antes.
    case '23514':
      return new PlanError('invalid_input')

    case '42501':
      return new PlanError('forbidden')

    // PostgREST: JWT ausente, caducado o inválido.
    case 'PGRST301':
      return new PlanError('forbidden')

    // PostgREST: la fila que iba a devolver `.single()` no estaba.
    case 'PGRST116':
      return new PlanError('row_missing')

    default:
      return new PlanError('unknown')
  }
}
