import type { ClassificationGroup } from './schemas'

/**
 * Nombres visibles de los tres grupos que se clasifican por categoría.
 *
 * Esta es la **única** definición de estos tres textos. El reparto del Plan
 * mensual necesita cinco grupos —estos tres más ahorro e inversión— y compone
 * su mapa a partir de este, en vez de repetir las mismas tres cadenas: dos
 * copias acabarían divergiendo en cuanto alguien renombrase una.
 *
 * La dirección de la dependencia es deliberada. Plan importa de Categorías, no
 * al revés: las categorías existen y se clasifican aunque nadie llegue a crear
 * un plan mensual.
 */
export const classificationGroupLabel: Record<ClassificationGroup, string> = {
  needs: 'Necesidades',
  wants: 'Deseos',
  debt: 'Deuda',
}

/** Qué significa cada grupo, para que la decisión no dependa del nombre. */
export const classificationGroupHint: Record<ClassificationGroup, string> = {
  needs: 'Gasto que no puedes dejar de hacer este mes.',
  wants: 'Gasto que eliges hacer y podrías recortar.',
  debt: 'Pagos de deudas y créditos.',
}

/** Estado de una categoría de gasto que todavía no pertenece a ningún grupo. */
export const UNCLASSIFIED_CATEGORY_LABEL = 'Sin clasificar'
