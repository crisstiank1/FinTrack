import { describe, expect, it } from 'vitest'

import { ALLOCATION_GROUPS, resolveAllocation, type AllocationPercentages } from './allocation'

function sumAmounts(amounts: Record<string, number>): number {
  return ALLOCATION_GROUPS.reduce((sum, group) => sum + amounts[group], 0)
}

function expectSafeIntegers(amounts: Record<string, number>): void {
  for (const group of ALLOCATION_GROUPS) {
    expect(Number.isInteger(amounts[group])).toBe(true)
    expect(Number.isSafeInteger(amounts[group])).toBe(true)
  }
}

describe('resolveAllocation', () => {
  it('divide exactamente cuando el ingreso es múltiplo de 10000', () => {
    const result = resolveAllocation(100_000, { needs: 5000, wants: 3000, savings: 2000 })

    expect(result).toEqual({ needs: 50_000, wants: 30_000, savings: 20_000, investment: 0, debt: 0 })
    expect(sumAmounts(result)).toBe(100_000)
  })

  it('con ingresos cero, todos los grupos quedan en cero sin importar el porcentaje', () => {
    const result = resolveAllocation(0, { needs: 5000, wants: 3000, savings: 2000 })

    expect(result).toEqual({ needs: 0, wants: 0, savings: 0, investment: 0, debt: 0 })
  })

  it('con un solo punto restante, gana el grupo con mayor resto (sin empate)', () => {
    // 1 * 3334 = 3334 (resto 3334), 1 * 3333 = 3333 (resto 3333) x2 → needs es el único máximo.
    const result = resolveAllocation(1, { needs: 3334, wants: 3333, savings: 3333 })

    expect(result).toEqual({ needs: 1, wants: 0, savings: 0, investment: 0, debt: 0 })
    expect(sumAmounts(result)).toBe(1)
  })

  it('con restos iguales, el desempate favorece el orden fijo needs > wants', () => {
    // 1 * 5000 = 5000 para needs y wants: empate exacto en el resto.
    const result = resolveAllocation(1, { needs: 5000, wants: 5000 })

    expect(result).toEqual({ needs: 1, wants: 0, savings: 0, investment: 0, debt: 0 })
  })

  it('con varios puntos restantes y empate a cinco bandas, reparte por el orden fijo', () => {
    // 7 * 2000 = 14000 en los cinco grupos: mismo resto (4000) para todos.
    const result = resolveAllocation(7, {
      needs: 2000,
      wants: 2000,
      savings: 2000,
      investment: 2000,
      debt: 2000,
    })

    expect(result).toEqual({ needs: 2, wants: 2, savings: 1, investment: 1, debt: 1 })
    expect(sumAmounts(result)).toBe(7)
  })

  it('confirma la cadena completa del orden fijo needs → wants → savings → investment → debt', () => {
    // Los cinco grupos con el mismo porcentaje siempre empatan en el resto,
    // así que quién gana cada unidad sobrante depende únicamente del orden
    // fijo. Subiendo el ingreso de a una unidad, cada ganador nuevo revela la
    // siguiente posición de la cadena.
    const percentages: AllocationPercentages = {
      needs: 2000,
      wants: 2000,
      savings: 2000,
      investment: 2000,
      debt: 2000,
    }

    expect(resolveAllocation(6, percentages)).toEqual({
      needs: 2,
      wants: 1,
      savings: 1,
      investment: 1,
      debt: 1,
    })
    expect(resolveAllocation(7, percentages)).toEqual({
      needs: 2,
      wants: 2,
      savings: 1,
      investment: 1,
      debt: 1,
    })
    expect(resolveAllocation(8, percentages)).toEqual({
      needs: 2,
      wants: 2,
      savings: 2,
      investment: 1,
      debt: 1,
    })
    expect(resolveAllocation(9, percentages)).toEqual({
      needs: 2,
      wants: 2,
      savings: 2,
      investment: 2,
      debt: 1,
    })
  })

  it('un grupo ausente en las percentages cuenta como 0 puntos base', () => {
    const result = resolveAllocation(100, { needs: 10000 })

    expect(result).toEqual({ needs: 100, wants: 0, savings: 0, investment: 0, debt: 0 })
  })

  it('con varios grupos ausentes pero sin puntos porcentuales faltantes, los ausentes quedan en 0', () => {
    // needs + wants ya suman 10000: savings, investment y debt no están
    // "incompletos", simplemente no participan del reparto.
    const result = resolveAllocation(101, { needs: 5_000, wants: 5_000 })

    expect(result).toEqual({ needs: 51, wants: 50, savings: 0, investment: 0, debt: 0 })
    expect(sumAmounts(result)).toBe(101)
  })

  it('con ingreso cero o negativo (fuera de dominio), sale temprano con los cinco grupos en 0', () => {
    // No es una validación de negocio (esa vive en schemas/mutations, que
    // deben rechazar un ingreso planeado negativo antes de llegar aquí): es
    // la definición total y determinista de la función para esta entrada.
    expect(resolveAllocation(-1, { needs: 5000, wants: 5000 })).toEqual({
      needs: 0,
      wants: 0,
      savings: 0,
      investment: 0,
      debt: 0,
    })
    expect(resolveAllocation(-1_000_000, { needs: 10000 })).toEqual({
      needs: 0,
      wants: 0,
      savings: 0,
      investment: 0,
      debt: 0,
    })
  })

  it('la suma del resultado es siempre exactamente el ingreso planeado cuando los porcentajes suman 10000', () => {
    for (const income of [3, 7, 11, 999, 1_234_567]) {
      const result = resolveAllocation(income, {
        needs: 5000,
        wants: 3000,
        savings: 1000,
        investment: 700,
        debt: 300,
      })
      expect(sumAmounts(result)).toBe(income)
    }
  })

  it('no depende de que haya exactamente tres grupos: funciona igual con uno, dos o los cinco activos', () => {
    expect(sumAmounts(resolveAllocation(100, { needs: 10000 }))).toBe(100)
    expect(sumAmounts(resolveAllocation(100, { needs: 6000, wants: 4000 }))).toBe(100)
    expect(
      sumAmounts(
        resolveAllocation(100, { needs: 2000, wants: 2000, savings: 2000, investment: 2000, debt: 2000 }),
      ),
    ).toBe(100)
  })

  it('todo importe resultante es un entero seguro, nunca fraccionario, incluso con ingresos grandes', () => {
    const scenarios: Array<[number, AllocationPercentages]> = [
      [100_000, { needs: 5000, wants: 3000, savings: 1000, investment: 700, debt: 300 }],
      [7, { needs: 2000, wants: 2000, savings: 2000, investment: 2000, debt: 2000 }],
      [1, { needs: 5000, wants: 5000 }],
      [0, { needs: 10000 }],
      [100_000_000_000_000, { needs: 3334, wants: 3333, savings: 3333 }],
    ]

    for (const [income, percentages] of scenarios) {
      expectSafeIntegers(resolveAllocation(income, percentages))
    }
  })

  describe('con ingresos grandes, el producto intermedio ya no arriesga precisión', () => {
    it('un solo grupo al 100%: el caso que desbordaría income * basisPoints (1e12 * 10000 = 1e16 > 2^53 - 1)', () => {
      const result = resolveAllocation(1_000_000_000_000, { needs: 10000 })

      expect(result).toEqual({
        needs: 1_000_000_000_000,
        wants: 0,
        savings: 0,
        investment: 0,
        debt: 0,
      })
      expect(sumAmounts(result)).toBe(1_000_000_000_000)
      expectSafeIntegers(result)
    })

    it('reparto desigual (33.33 / 33.33 / 33.34) sobre un ingreso grande, sin empate en el resto', () => {
      // income = 3_000_000_000_001 → whole = 300_000_000, fractional = 1.
      // needs y wants empatan en resto (3333); savings queda estrictamente
      // por encima (3334) y se queda con la única unidad sobrante.
      const result = resolveAllocation(3_000_000_000_001, {
        needs: 3333,
        wants: 3333,
        savings: 3334,
      })

      expect(result).toEqual({
        needs: 999_900_000_000,
        wants: 999_900_000_000,
        savings: 1_000_200_000_001,
        investment: 0,
        debt: 0,
      })
      expect(sumAmounts(result)).toBe(3_000_000_000_001)
      expectSafeIntegers(result)
    })

    it('reparto de varias unidades sobrantes con empate a cinco bandas sobre un ingreso grande', () => {
      // income = 3_000_000_000_009 → whole = 300_000_000, fractional = 9.
      // Los cinco grupos comparten porcentaje: empatan siempre en el resto.
      // leftoverUnits = 4, así que ganan los cuatro primeros del orden fijo
      // (needs, wants, savings, investment) y debt es el único que no gana.
      const result = resolveAllocation(3_000_000_000_009, {
        needs: 2000,
        wants: 2000,
        savings: 2000,
        investment: 2000,
        debt: 2000,
      })

      expect(result).toEqual({
        needs: 600_000_000_002,
        wants: 600_000_000_002,
        savings: 600_000_000_002,
        investment: 600_000_000_002,
        debt: 600_000_000_001,
      })
      expect(sumAmounts(result)).toBe(3_000_000_000_009)
      expectSafeIntegers(result)
    })
  })
})
