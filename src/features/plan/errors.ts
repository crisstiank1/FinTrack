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
  | 'save_allocations'
  | 'save_plan_line'
  | 'save_contribution_line'
  | 'delete_plan_line'

export type PlanErrorCode =
  /** El mes ya existía: otra pestaña se adelantó. Se resuelve releyendo. */
  | 'month_conflict'
  /** Hubo conflicto y, al releer, el mes tampoco estaba. */
  | 'month_missing_after_conflict'
  /** Otra sesión escribió antes; lo que había en pantalla ya no vale. */
  | 'conflict'
  /** U9: esa categoría de ingreso ya alimenta otra fuente del mes. */
  | 'category_already_linked'
  /** U10: esa categoría de gasto ya tiene una línea en este mes. */
  | 'line_category_taken'
  /** T3: la categoría de una línea no es de tipo `expense`. */
  | 'category_not_expense'
  /** T2: la categoría no es de tipo `income`. */
  | 'category_not_income'
  /** T2: la categoría está archivada. */
  | 'category_archived'
  /** La categoría no existe, no es del usuario o dejó de estar visible. */
  | 'category_missing'
  /** U11: esa cuenta ya tiene una línea de aporte en este mes. */
  | 'line_account_taken'
  /** T3: la cuenta de un aporte está archivada. */
  | 'account_archived'
  /** T3: la cuenta no es del tipo del aporte (ahorro o inversión). */
  | 'account_wrong_type'
  /** La cuenta no existe, no es del usuario o dejó de estar visible. */
  | 'account_missing'
  /** La fila que se editaba o borraba ya no está. */
  | 'row_missing'
  /** CHECK del esquema: importe negativo o nombre fuera de rango. */
  | 'invalid_input'
  /** T4: los porcentajes del reparto no suman 100 %. */
  | 'allocation_sum'
  /** CHECK de `plan_lines`: nombre fuera de rango o fecha fuera del mes. */
  | 'invalid_line'
  /** RLS, permisos o sesión caducada. */
  | 'forbidden'
  /** No se pudo hablar con el servidor desde este navegador. */
  | 'network'
  /** El servicio respondió que no está disponible ahora mismo. */
  | 'service_unavailable'
  | 'unknown'

const MESSAGES: Record<PlanErrorCode, string> = {
  month_conflict: 'El plan de este mes ya existía. Lo abrimos en lugar de crear otro.',
  month_missing_after_conflict:
    'No pudimos abrir el plan de este mes. Vuelve a intentarlo en un momento.',
  conflict:
    'Esta pantalla cambió desde otra pestaña o dispositivo. Revisa lo que hay ahora y vuelve a guardar.',
  category_already_linked:
    'Esa categoría de ingreso ya alimenta otra fuente de este mes. Quítala de allí antes de usarla aquí.',
  line_category_taken:
    'Esa categoría ya tiene una línea en este mes. Edita la que existe o elige otra categoría.',
  category_not_expense: 'Una línea del plan solo puede apuntar a categorías de gasto.',
  category_not_income: 'Solo puedes vincular categorías de ingreso.',
  category_archived: 'No se puede vincular una categoría archivada.',
  category_missing: 'Esa categoría ya no está disponible.',
  line_account_taken:
    'Esa cuenta ya tiene un aporte planeado este mes. Edita el que existe o elige otra cuenta.',
  account_archived: 'No se puede planificar un aporte sobre una cuenta archivada.',
  account_wrong_type:
    'Un aporte a ahorro va a una cuenta de ahorro, y un aporte a inversión, a una cuenta de inversión.',
  account_missing: 'Esa cuenta ya no está disponible.',
  row_missing: 'Lo que intentas modificar ya no existe. Refresca la pantalla.',
  invalid_input: 'Revisa el nombre y el monto: el monto debe ser un entero de cero o más.',
  allocation_sum: 'Los porcentajes deben sumar exactamente 100 %.',
  invalid_line:
    'Revisa el nombre y la fecha: la fecha esperada tiene que caer dentro del mes del plan.',
  forbidden:
    'Tu sesión no tiene permiso para esta operación. Vuelve a iniciar sesión e inténtalo de nuevo.',
  network: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  service_unavailable:
    'El servidor no está disponible temporalmente. Inténtalo de nuevo en unos momentos.',
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
  /**
   * Estado HTTP, **si el cliente llega a exponerlo**. `postgrest-js` lo
   * devuelve como hermano del error —`{ data, error, status, statusText }`— y
   * `api.ts` solo desestructura `{ data, error }`, así que hoy no llega aquí.
   * Se leen las dos grafías porque son las que usan los clientes que sí lo
   * adjuntan, y porque es la vía estructural: cuando exista, manda sobre
   * cualquier otra pista.
   */
  status?: number | null
  statusCode?: number | null
}

/**
 * Se aceptan también `status` y `statusCode`: un fallo de transporte puede
 * llegar con el estado HTTP y sin cuerpo, y descartarlo aquí lo dejaría fuera
 * del mapeo antes de poder mirarlo.
 */
function isPostgrestLike(error: unknown): error is PostgrestLikeError {
  if (typeof error !== 'object' || error === null) return false

  return 'code' in error || 'message' in error || 'status' in error || 'statusCode' in error
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
  // Las cinco filas se envían juntas, así que un grupo repetido solo puede
  // venir de que otra sesión configurara el reparto entre medias.
  save_allocations: 'conflict',
  // `plan_lines` es el único caso donde la operación **no** basta: U10 y U12
  // comparten SQLSTATE, así que lo resuelve `mapLineUniqueViolation` mirando el
  // texto, y este valor es su respaldo.
  save_plan_line: 'conflict',
  // Igual que las líneas de gasto, U11 y U12 comparten SQLSTATE: lo resuelve
  // `mapContributionUniqueViolation`, y este valor es su respaldo.
  save_contribution_line: 'conflict',
  delete_plan_line: 'unknown',
}

/**
 * Cuál de los dos índices únicos de `plan_lines` acaba de saltar.
 *
 * Es el único punto del mapeo donde la operación no alcanza: U10
 * —`(plan_month_id, category_id)`, la categoría ya tiene línea este mes— y U12
 * —`(plan_month_id, position)`, otra pestaña insertó antes— llegan las dos como
 * `23505` durante la misma operación, y significan cosas distintas: la primera
 * la arregla el usuario eligiendo otra categoría, la segunda se resuelve
 * refrescando.
 *
 * Distinguirlas exige mirar el texto, que trae el nombre del índice. Es tan
 * frágil como `mapTriggerMessage` y por el mismo motivo —separarlas de verdad
 * pediría una migración—, así que cuando el texto no dice nada reconocible cae
 * a `conflict`, que es el mensaje seguro: pide releer y volver a intentarlo.
 */
function mapLineUniqueViolation(message: string): PlanErrorCode {
  const text = message.toLowerCase()

  if (text.includes('category')) return 'line_category_taken'
  if (text.includes('position')) return 'conflict'

  return 'conflict'
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
  // T3 sobre `plan_lines`: «solo puede apuntar a categorías de gasto».
  if (text.includes('de gasto')) return 'category_not_expense'
  if (text.includes('no existe')) return 'category_missing'

  return 'unknown'
}

/**
 * Cuál de los dos índices únicos salta al guardar un aporte: U11
 * —`(plan_month_id, account_id)`, la cuenta ya tiene aporte este mes— o U12
 * —`(plan_month_id, position)`, otra pestaña insertó antes—. Mismo criterio y
 * misma fragilidad que `mapLineUniqueViolation`: sin texto reconocible, cae a
 * `conflict`.
 */
function mapContributionUniqueViolation(message: string): PlanErrorCode {
  const text = message.toLowerCase()

  if (text.includes('account')) return 'line_account_taken'

  return 'conflict'
}

/**
 * Los tres mensajes de T3 sobre la cuenta de un aporte, que llegan con el mismo
 * `P0001`:
 *
 * - «No se puede planificar sobre una cuenta archivada.»
 * - «Una línea de ahorro requiere una cuenta de tipo savings; …» (y su
 *   equivalente de inversión).
 * - «La cuenta indicada no existe o no pertenece al usuario.»
 *
 * Van aparte de `mapTriggerMessage` porque los fragmentos se parecen —«archivada»
 * y «no existe» aparecen en los dos triggers— y la operación ya dice que se
 * guardaba una cuenta, no una categoría. Sin texto reconocible, `unknown`.
 */
function mapContributionTriggerMessage(message: string): PlanErrorCode {
  const text = message.toLowerCase()

  if (text.includes('archivada')) return 'account_archived'
  if (text.includes('requiere una cuenta de tipo')) return 'account_wrong_type'
  if (text.includes('no existe')) return 'account_missing'

  return 'unknown'
}

const SERVICE_UNAVAILABLE_STATUS = 503

/**
 * SQLSTATE con los que PostgreSQL dice que **no puede atender ahora**, y que
 * PostgREST devuelve como 503.
 *
 * - Clase `08` — fallo de conexión con la base.
 * - Clase `53` — recursos insuficientes: sin conexiones libres, sin memoria,
 *   disco lleno.
 * - `57P03` — el servidor está arrancando y todavía no acepta conexiones.
 *
 * Los tres significan lo mismo para quien acaba de pulsar «Guardar»: no es
 * culpa de lo que escribió, y volver a intentarlo en un momento puede
 * funcionar. Se comparan por prefijo de clase porque los códigos concretos de
 * cada familia se añaden con el tiempo y todos comparten esa semántica.
 */
function isServiceUnavailableSqlState(code: string): boolean {
  return code.startsWith('08') || code.startsWith('53') || code === '57P03'
}

/**
 * Si el fallo es «el servicio no está disponible ahora mismo».
 *
 * Se mira **solo lo estructural**: el estado HTTP cuando el cliente lo expone,
 * y el SQLSTATE cuando el cuerpo del 503 viene de PostgREST. No se adivina por
 * el texto del mensaje, que en un 503 suele ser HTML de un proxy y cambiaría
 * sin aviso.
 *
 * **Límite conocido y aceptado:** `postgrest-js` devuelve el estado HTTP como
 * hermano del error y `api.ts` no lo propaga, así que un 503 emitido por la
 * pasarela —sin cuerpo de PostgREST y por tanto sin SQLSTATE— llega aquí sin
 * ninguna de las dos señales y termina en `unknown`. Es el fallback seguro: el
 * mensaje sigue sin filtrar nada y sigue invitando a reintentar. Cubrir ese
 * caso exige propagar el `status` desde la capa de datos.
 */
function isServiceUnavailable(error: PostgrestLikeError): boolean {
  const status = error.status ?? error.statusCode
  if (status === SERVICE_UNAVAILABLE_STATUS) return true

  const code = error.code ?? ''
  return code !== '' && isServiceUnavailableSqlState(code)
}

/** Traduce cualquier fallo de escritura a un error de dominio. */
export function toPlanError(error: unknown, operation: PlanOperation): PlanError {
  if (error instanceof PlanError) return error

  // Un fallo de `fetch` llega como TypeError, sin código SQL: es la forma en
  // que se manifiesta la falta de red desde el navegador.
  if (error instanceof TypeError) return new PlanError('network')

  if (!isPostgrestLike(error)) return new PlanError('unknown')

  // Antes del switch: un servicio caído no depende de qué se estaba guardando,
  // y su señal puede venir por estado HTTP o por SQLSTATE.
  if (isServiceUnavailable(error)) return new PlanError('service_unavailable')

  switch (error.code ?? '') {
    // Excepción del trigger de reglas de negocio.
    case 'P0001':
      // Sobre `plan_allocations` el único trigger que puede saltar es
      // `check_plan_allocations_sum`, así que aquí la operación ya identifica
      // la regla y no hace falta mirar el texto —que es el punto frágil del
      // mapeo—. Zod debería haberlo atajado antes; esto cubre una petición
      // antigua, dos pestañas o una regresión del cliente.
      if (operation === 'save_allocations') return new PlanError('allocation_sum')
      if (operation === 'save_contribution_line') {
        return new PlanError(mapContributionTriggerMessage(error.message ?? ''))
      }
      return new PlanError(mapTriggerMessage(error.message ?? ''))

    case '23505':
      if (operation === 'save_plan_line') {
        return new PlanError(mapLineUniqueViolation(error.message ?? ''))
      }
      if (operation === 'save_contribution_line') {
        return new PlanError(mapContributionUniqueViolation(error.message ?? ''))
      }
      return new PlanError(UNIQUE_VIOLATION[operation])

    // Clave foránea compuesta. Al ser diferida puede llegar en el commit y no
    // en la sentencia, pero el SQLSTATE es el mismo. Un aporte apunta a una
    // cuenta, no a una categoría.
    case '23503':
      if (operation === 'save_contribution_line') return new PlanError('account_missing')
      return new PlanError('category_missing')

    // CHECK del esquema. Zod debería haberlos atajado antes; lo que cambia es
    // qué campos nombra el mensaje, y eso sí depende de qué se estaba
    // guardando: una línea de gasto no tiene monto, y una fuente no tiene
    // fecha. Un aporte sí tiene nombre e importe, como una fuente.
    case '23514':
      if (operation === 'save_plan_line') return new PlanError('invalid_line')
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
