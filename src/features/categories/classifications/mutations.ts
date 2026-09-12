import { isClassificationGroup, type ClassificationGroup } from './schemas'

/**
 * Decisiones de la clasificación, sin ejecutar ninguna.
 *
 * Mismo papel que `plan/mutations.ts`: qué se puede ofrecer y cómo se agrupa se
 * decide aquí, en funciones puras y comprobables sin red; ejecutarlo es trabajo
 * de `api.ts`.
 *
 * Lo que vive en este archivo es una sola regla del esquema traducida a lo que
 * la interfaz puede mostrar: **no se puede estrenar una clasificación
 * inválida, pero sí corregir una que ya existe**. De ahí salen los tres bloques
 * del panel.
 */

/** Categoría vista desde el panel de clasificación. */
export interface ClassifiableCategory {
  id: string
  name: string
  type: string
  is_archived: boolean
}

/** Clasificación guardada, tal como llega de la tabla. */
export interface ClassificationRow {
  id: string
  category_id: string
  budget_group: string
}

/** Una categoría junto a la clasificación que tenga, si tiene alguna. */
export interface ClassifiedCategory<T extends ClassifiableCategory> {
  category: T
  /** `null` mientras la categoría no pertenezca a ningún grupo. */
  classificationId: string | null
  group: ClassificationGroup | null
}

export interface ClassificationPartition<T extends ClassifiableCategory> {
  /** Gasto activo sin grupo. Son las únicas que admiten estrenar clasificación. */
  unclassified: ClassifiedCategory<T>[]
  /** Gasto activo ya clasificado. El grupo se puede cambiar. */
  classified: ClassifiedCategory<T>[]
  /**
   * Clasificaciones que ya no se podrían estrenar: su categoría se archivó o
   * dejó de ser de gasto después. Siguen visibles y su grupo sigue siendo
   * editable, porque es lo que mantiene corregibles los meses cerrados.
   */
  historical: ClassifiedCategory<T>[]
}

/**
 * Mapa de categoría a su clasificación.
 *
 * U1 —`unique (user_id, category_id)`— garantiza una sola fila por categoría,
 * así que la primera gana y las demás se descartan sin ruido: en datos válidos
 * esa rama no se alcanza. Un `budget_group` fuera de los tres valores también
 * se descarta, por el mismo motivo por el que `buildAllocationPercentages`
 * descarta grupos desconocidos: la interfaz no puede pintar un grupo que no
 * existe.
 */
function indexByCategory(rows: readonly ClassificationRow[]): Map<string, ClassificationRow> {
  const byCategory = new Map<string, ClassificationRow>()

  for (const row of rows) {
    if (byCategory.has(row.category_id)) continue
    if (!isClassificationGroup(row.budget_group)) continue
    byCategory.set(row.category_id, row)
  }

  return byCategory
}

/**
 * Reparte las categorías en los tres bloques del panel.
 *
 * Las categorías de ingreso **sin clasificar** no aparecen en ninguno: el
 * reparto distribuye el ingreso, no lo clasifica. Una de ingreso que sí
 * conserve clasificación —porque se creó cuando era de gasto— cae en
 * `historical`, que es justo el caso que el trigger permite seguir editando.
 *
 * Una clasificación cuya categoría no esté en la lista no aparece: no habría
 * nombre que mostrar. La clave foránea `on delete no action` hace que ese caso
 * no pueda darse con datos válidos.
 *
 * El orden de entrada se conserva; `fetchCategories` ya ordena por nombre.
 */
export function partitionCategoriesForClassification<T extends ClassifiableCategory>(
  categories: readonly T[],
  classifications: readonly ClassificationRow[],
): ClassificationPartition<T> {
  const byCategory = indexByCategory(classifications)

  const partition: ClassificationPartition<T> = {
    unclassified: [],
    classified: [],
    historical: [],
  }

  for (const category of categories) {
    const row = byCategory.get(category.id)
    const isClassifiable = category.type === 'expense' && !category.is_archived

    if (!row) {
      // Sin clasificación, solo se ofrece lo que el servidor aceptaría.
      if (isClassifiable) {
        partition.unclassified.push({ category, classificationId: null, group: null })
      }
      continue
    }

    const entry: ClassifiedCategory<T> = {
      category,
      classificationId: row.id,
      // `indexByCategory` ya descartó los grupos desconocidos.
      group: row.budget_group as ClassificationGroup,
    }

    if (isClassifiable) partition.classified.push(entry)
    else partition.historical.push(entry)
  }

  return partition
}

/**
 * Por qué una clasificación quedó en el bloque histórico. Se dice por fila
 * porque las dos causas llevan a la misma consecuencia pero no significan lo
 * mismo, y el usuario tiene derecho a saber cuál le aplica.
 */
export function historicalReason(category: ClassifiableCategory): string {
  if (category.is_archived) return 'Archivada'
  return 'Ya no es de gasto'
}
