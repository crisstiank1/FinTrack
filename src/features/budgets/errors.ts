/**
 * Errores de dominio de los presupuestos.
 *
 * La capa de datos nunca deja escapar un error crudo de PostgreSQL: todo lo
 * que sale de `api.ts` y de `planBudgetWrite` es un `BudgetError` con un
 * `code` estable y un mensaje listo para mostrar. Así la interfaz decide qué
 * hacer mirando el código, no parseando texto, y ningún mensaje filtra
 * códigos SQL, nombres de índices ni restricciones al usuario final.
 */

export type BudgetErrorCode =
  /** La categoría no es de tipo `expense`. Regla del trigger `validate_budget`. */
  | 'category_not_expense'
  /** La categoría está archivada. Regla del trigger `validate_budget`. */
  | 'category_archived'
  /** La categoría no existe, no es del usuario, o se borró entre lectura y escritura. */
  | 'category_missing'
  /** Ya existe otra fila para esa categoría y mes: alguien escribió antes que nosotros. */
  | 'conflict'
  /** La fila que se intenta corregir ya no está. */
  | 'row_missing'
  /** Versionar hacia atrás cambiaría un mes ya cerrado. Regla propia de esta capa. */
  | 'past_month_template'
  /** Importe no entero o negativo. */
  | 'invalid_amount'
  /** RLS, sesión caducada o permisos. */
  | 'forbidden'
  /** No se pudo hablar con el servidor. */
  | 'network'
  | 'unknown'

const MESSAGES: Record<BudgetErrorCode, string> = {
  category_not_expense: 'Solo se puede presupuestar una categoría de gastos.',
  category_archived: 'No se puede presupuestar una categoría archivada.',
  category_missing: 'La categoría de este presupuesto ya no está disponible.',
  conflict:
    'Este presupuesto cambió desde otra pestaña o dispositivo. Revisa el valor actualizado y vuelve a guardarlo.',
  row_missing: 'El presupuesto que intentas corregir ya no existe.',
  past_month_template:
    'No se puede cambiar el presupuesto de un mes ya cerrado. Para ajustar solo ese mes, crea una excepción.',
  invalid_amount: 'El importe del presupuesto debe ser un número entero de cero o más.',
  forbidden:
    'Tu sesión no tiene permiso para esta operación. Vuelve a iniciar sesión e inténtalo de nuevo.',
  network: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  unknown: 'Ocurrió un error inesperado con los presupuestos. Inténtalo de nuevo.',
}

export class BudgetError extends Error {
  readonly code: BudgetErrorCode

  constructor(code: BudgetErrorCode) {
    super(MESSAGES[code])
    this.name = 'BudgetError'
    this.code = code
  }
}

/**
 * Forma mínima de un error de PostgREST. Se declara aquí en vez de importar el
 * tipo de `@supabase/supabase-js` para que este mapeo se pueda probar sin
 * depender del cliente, igual que hace el resto de la lógica del feature.
 */
interface PostgrestLikeError {
  code?: string | null
  message?: string | null
}

function isPostgrestLike(error: unknown): error is PostgrestLikeError {
  return typeof error === 'object' && error !== null && ('code' in error || 'message' in error)
}

/**
 * Los tres mensajes que lanza el trigger `validate_budget` llegan todos con el
 * mismo SQLSTATE genérico P0001, así que distinguirlos exige mirar el texto.
 * Se buscan fragmentos sin tildes y en minúsculas para que la comparación no
 * dependa de la normalización Unicode de la respuesta.
 *
 * Es el punto más frágil del mapeo y es deliberado: darle a cada regla su
 * propio SQLSTATE requeriría cambiar el trigger, y este paso no añade
 * migraciones. Si el texto del trigger cambia, cae a `unknown`, que sigue
 * siendo un mensaje correcto aunque menos específico.
 */
function mapTriggerMessage(message: string): BudgetErrorCode {
  const text = message.toLowerCase()

  if (text.includes('archivada')) return 'category_archived'
  if (text.includes('de gasto')) return 'category_not_expense'
  if (text.includes('no existe')) return 'category_missing'

  return 'unknown'
}

/**
 * Traduce cualquier fallo de la capa de datos a un error de dominio.
 *
 * Un `BudgetError` se devuelve tal cual: `planBudgetWrite` ya produce errores
 * de dominio y no deben re-envolverse.
 */
export function toBudgetError(error: unknown): BudgetError {
  if (error instanceof BudgetError) return error

  // Un fallo de `fetch` llega como TypeError sin código SQL. Es la forma en
  // que se manifiesta la falta de red desde el navegador.
  if (error instanceof TypeError) return new BudgetError('network')

  if (!isPostgrestLike(error)) return new BudgetError('unknown')

  const code = error.code ?? ''

  switch (code) {
    // Excepción lanzada por el trigger de reglas de negocio.
    case 'P0001':
      return new BudgetError(mapTriggerMessage(error.message ?? ''))

    // Violación de índice único: ya hay una plantilla con ese effective_from o
    // una excepción para ese mes. Con la caché al día no debería ocurrir, así
    // que significa que otra pestaña o dispositivo escribió primero.
    case '23505':
      return new BudgetError('conflict')

    // Clave foránea compuesta. Al ser `deferrable initially deferred` puede
    // llegar al hacer commit y no en la sentencia, pero el SQLSTATE es el mismo.
    case '23503':
      return new BudgetError('category_missing')

    // CHECK del esquema; el único alcanzable desde esta capa es amount_minor >= 0.
    case '23514':
      return new BudgetError('invalid_amount')

    // RLS o permisos insuficientes.
    case '42501':
      return new BudgetError('forbidden')

    // PostgREST: JWT ausente, caducado o inválido.
    case 'PGRST301':
      return new BudgetError('forbidden')

    // PostgREST: `.single()` no encontró la fila que iba a devolver.
    case 'PGRST116':
      return new BudgetError('row_missing')

    default:
      return new BudgetError('unknown')
  }
}
