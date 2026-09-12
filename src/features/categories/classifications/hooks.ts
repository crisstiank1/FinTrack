import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'

import {
  createCategoryClassification,
  deleteCategoryClassification,
  fetchCategoryClassifications,
  updateCategoryClassification,
} from './api'
import type { ClassificationGroup } from './schemas'

/**
 * Consultas y mutaciones de la clasificación de categorías.
 *
 * Este módulo es el **dueño** del recurso: aquí se define la clave, aquí se
 * lee y aquí se escribe. `/plan` consume el hook de lectura y no define una
 * segunda clave, porque dos claves para la misma tabla significan dos cachés
 * que se desincronizan en cuanto una mutación invalida solo una de ellas.
 */

/**
 * Raíz del recurso. Se declara una sola vez y todo lo demás se deriva de ella,
 * para que el literal no se escriba en ningún otro archivo del proyecto.
 */
const ROOT = ['category-classifications'] as const

/**
 * Claves de las clasificaciones, en sus dos niveles.
 *
 * Raíz propia y no `['plan', ...]`: una clasificación no depende del mes, así
 * que una reclasificación debe alcanzar a todos los meses que haya en caché.
 *
 * `all` existe para quien necesita invalidar el recurso entero sin conocer al
 * usuario —el botón de reintento de `/plan`, por ejemplo—. Sin él, ese llamador
 * tendría que reescribir el literal y acabaría habiendo dos definiciones de la
 * misma clave que podrían divergir.
 */
export const categoryClassificationsQueryKey = {
  all: ROOT,
  byUser: (userId: string | undefined) => [...ROOT, userId] as const,
}

export function useCategoryClassifications() {
  const { user } = useAuth()

  return useQuery({
    queryKey: categoryClassificationsQueryKey.byUser(user?.id),
    queryFn: () => fetchCategoryClassifications(user!.id),
    enabled: !!user,
  })
}

/*
 * Las tres mutaciones invalidan **solo** la clave de clasificaciones, y no
 * `['plan', userId]`. El plan del mes no ha cambiado en la base: sus meses,
 * fuentes, vínculos, líneas y asignaciones siguen siendo los mismos. `/plan`
 * deriva el gasto por grupo de esta misma consulta, así que se refresca solo
 * cuando esta se invalida.
 *
 * `onSuccess` y no `onSettled`: cada una es una sentencia única, sin el riesgo
 * de estado parcial que obliga a refrescar tras un fallo en las escrituras del
 * Plan mensual.
 */

export interface CreateClassificationInput {
  categoryId: string
  group: ClassificationGroup
}

/** Clasifica una categoría que todavía no pertenecía a ningún grupo. */
export function useCreateCategoryClassification() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateClassificationInput) =>
      createCategoryClassification({
        user_id: user!.id,
        category_id: input.categoryId,
        budget_group: input.group,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryClassificationsQueryKey.byUser(user?.id) })
    },
  })
}

export interface UpdateClassificationInput {
  classificationId: string
  group: ClassificationGroup
}

/**
 * Cambia el grupo de una clasificación existente.
 *
 * El identificador de la categoría no entra en la entrada de esta mutación, y
 * eso es deliberado: no existe «cambiar la categoría de una clasificación»,
 * porque eso sería estrenarla. Para eso hay que quitar y volver a clasificar,
 * y entonces las reglas de archivada y de tipo vuelven a aplicarse.
 */
export function useUpdateCategoryClassification() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateClassificationInput) =>
      updateCategoryClassification(input.classificationId, { budget_group: input.group }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryClassificationsQueryKey.byUser(user?.id) })
    },
  })
}

/** Devuelve la categoría a «Sin clasificar». La categoría no se toca. */
export function useDeleteCategoryClassification() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (classificationId: string) => deleteCategoryClassification(classificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: categoryClassificationsQueryKey.byUser(user?.id) })
    },
  })
}
