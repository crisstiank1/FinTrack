import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types'

import { toClassificationError } from './errors'

/**
 * Capa de datos de la clasificación de categorías.
 *
 * Adaptador fino sobre Supabase, como el resto del repositorio: aquí no hay
 * reglas de negocio ni fórmulas. Las filas salen tal como llegan.
 *
 * Sobre `userId`: llega siempre desde la sesión autenticada, nunca de la URL ni
 * de props. Es un filtro de alcance, no un control de seguridad; la frontera
 * son las políticas RLS de la tabla.
 *
 * **La lectura propaga el error crudo y las escrituras lo traducen**, por el
 * mismo motivo que en `/plan`: quien consulta solo necesita saber que falló,
 * mientras que quien acaba de escribir necesita saber qué hacer ahora.
 */

/**
 * Todas las clasificaciones del usuario.
 *
 * **Sin filtro de mes**, y es la característica que define esta tabla: una
 * clasificación no pertenece a un mes, vale para todos. Tampoco se filtran las
 * categorías archivadas, que conservan su clasificación y siguen haciendo falta
 * para consultar meses cerrados.
 *
 * Sin paginar: como mucho hay una fila por categoría de gasto del usuario, muy
 * por debajo del corte de 1000 filas que PostgREST aplica por defecto.
 */
export async function fetchCategoryClassifications(
  userId: string,
): Promise<Tables<'category_classifications'>[]> {
  const { data, error } = await supabase
    .from('category_classifications')
    .select('*')
    .eq('user_id', userId)
    .order('category_id', { ascending: true })

  if (error) throw error
  return data
}

/**
 * Clasifica una categoría por primera vez.
 *
 * Tres columnas y ninguna más: `id`, `created_at` y `updated_at` tienen valor
 * por defecto en el esquema.
 *
 * No usa `upsert`. Si la categoría ya estaba clasificada, el 23505 sale de aquí
 * como `already_classified` y quien llama refresca; resolverlo con `DO UPDATE`
 * pisaría en silencio el grupo que eligió la otra sesión.
 */
export async function createCategoryClassification(
  row: TablesInsert<'category_classifications'>,
): Promise<Tables<'category_classifications'>> {
  const { data, error } = await supabase
    .from('category_classifications')
    .insert(row)
    .select()
    .single()

  if (error) throw toClassificationError(error)
  return data
}

/**
 * Cambia el grupo de una clasificación existente.
 *
 * **Solo `budget_group`**, y el tipo del parámetro lo impone. No es una
 * comodidad: `validate_category_classification` consulta la categoría
 * únicamente cuando la fila la *estrena* —un INSERT, o un UPDATE que cambia
 * `category_id`—. Mientras el UPDATE no toque esa columna, una clasificación se
 * puede corregir aunque su categoría se haya archivado o haya pasado a ser de
 * ingreso después, que es lo que mantiene corregibles los meses cerrados.
 *
 * Reenviar la fila entera funcionaría hoy —el valor sería idéntico, no
 * distinto—, pero dejaría la puerta abierta a que un cambio futuro mandase otro
 * `category_id` y estrenase una referencia inválida sin que nadie lo note.
 *
 * `user_id` tampoco viaja: el trigger prohíbe cambiar el propietario de una
 * fila, y no hay ningún motivo para que el cliente lo intente.
 */
export async function updateCategoryClassification(
  id: string,
  patch: Pick<TablesUpdate<'category_classifications'>, 'budget_group'>,
): Promise<Tables<'category_classifications'>> {
  const { data, error } = await supabase
    .from('category_classifications')
    .update(patch)
    .eq('id', id)
    .select()
    .single()

  if (error) throw toClassificationError(error)
  return data
}

/** Devuelve la categoría a «Sin clasificar». No toca la categoría en sí. */
export async function deleteCategoryClassification(id: string): Promise<void> {
  const { error } = await supabase.from('category_classifications').delete().eq('id', id)
  if (error) throw toClassificationError(error)
}
