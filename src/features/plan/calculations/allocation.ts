/** Los cinco grupos del reparto, en el orden fijo de desempate. */
export const ALLOCATION_GROUPS = ['needs', 'wants', 'savings', 'investment', 'debt'] as const

export type AllocationGroup = (typeof ALLOCATION_GROUPS)[number]

/** Puntos base (0-10000) por grupo. Un grupo ausente cuenta como 0. */
export type AllocationPercentages = Partial<Record<AllocationGroup, number>>

/** Importe planeado por grupo, en unidades mínimas. */
export type AllocationAmounts = Record<AllocationGroup, number>

function emptyAllocation(): AllocationAmounts {
  const result = {} as AllocationAmounts
  for (const group of ALLOCATION_GROUPS) result[group] = 0
  return result
}

/**
 * Reparto del ingreso planeado entre los cinco grupos del 50/30/20, por mayor
 * resto (docs/09-plan-mensual.md, "Reparto 50/30/20"). Determinista y sin
 * coma flotante: la cuota base de cada grupo es división entera, y las
 * unidades sobrantes se asignan a los grupos con mayor resto; los empates se
 * rompen con el orden fijo `needs, wants, savings, investment, debt`.
 *
 * Precondiciones (para que el resultado tenga el significado del reparto):
 * - `incomePlannedMinor` es un entero seguro no negativo.
 * - Los porcentajes activos en `percentages` suman exactamente 10 000 puntos
 *   base (garantizado en la base de datos por
 *   `check_plan_allocations_sum_trigger`).
 * - Todos los porcentajes son enteros no negativos.
 *
 * Esta función no valida esas precondiciones — igual que el resto de
 * `calculations/`, asume datos ya normalizados. Fuera de ellas (ingreso
 * negativo, porcentajes que no suman 10 000) el resultado sigue siendo
 * determinista pero deja de tener el significado del reparto.
 *
 * Con `incomePlannedMinor <= 0` la función devuelve los cinco grupos en cero
 * mediante una salida temprana: no es una validación de negocio (esa vive en
 * `schemas`/`mutations`, que deben rechazar un ingreso planeado negativo
 * antes de llegar aquí), es solo la definición total y determinista de la
 * función para una entrada fuera de dominio.
 *
 * El cálculo evita multiplicar `incomePlannedMinor` directamente por un
 * `basisPoints` de hasta 10 000: para ingresos grandes ese producto puede
 * superar `Number.MAX_SAFE_INTEGER` (2^53 - 1) aunque el ingreso y el
 * resultado final sean enteros seguros, lo que corrompería el resto y
 * cambiaría el ganador del desempate en silencio. En su lugar, separa el
 * ingreso en una parte entera de "decenas de millar" y una fracción menor a
 * 10 000:
 *
 * ```
 * income = whole * 10_000 + fractional          (0 <= fractional < 10_000)
 * income * bp = whole * bp * 10_000 + fractional * bp
 * ```
 *
 * `whole * bp` está acotado por `income` (ocurre en el peor caso cuando
 * `bp = 10_000`), así que nunca excede el propio ingreso. `fractional * bp`
 * está acotado por `9_999 * 10_000` (~1×10⁸), muy por debajo del límite
 * seguro. Ninguno de los dos términos pierde precisión, así que la suma
 * tampoco.
 */
export function resolveAllocation(
  incomePlannedMinor: number,
  percentages: AllocationPercentages,
): AllocationAmounts {
  if (incomePlannedMinor <= 0) return emptyAllocation()

  const whole = Math.trunc(incomePlannedMinor / 10_000)
  const fractional = incomePlannedMinor % 10_000

  const base = {} as Record<AllocationGroup, number>
  const remainder = {} as Record<AllocationGroup, number>
  let baseSum = 0

  for (const group of ALLOCATION_GROUPS) {
    const basisPoints = percentages[group] ?? 0
    const groupBase = whole * basisPoints + Math.trunc((fractional * basisPoints) / 10_000)
    base[group] = groupBase
    remainder[group] = (fractional * basisPoints) % 10_000
    baseSum += groupBase
  }

  const leftoverUnits = Math.max(0, incomePlannedMinor - baseSum)

  const winners = [...ALLOCATION_GROUPS]
    .sort((a, b) => {
      if (remainder[b] !== remainder[a]) return remainder[b] - remainder[a]
      return ALLOCATION_GROUPS.indexOf(a) - ALLOCATION_GROUPS.indexOf(b)
    })
    .slice(0, leftoverUnits)

  const result = { ...base }
  for (const group of winners) {
    result[group] += 1
  }

  return result
}
