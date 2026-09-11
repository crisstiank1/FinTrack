import { describe, expect, it } from 'vitest'

import { calculateRemaining } from './remaining'

describe('calculateRemaining', () => {
  it('calcula el restante real como ingreso menos gasto y aportes', () => {
    const result = calculateRemaining(3_000_000, 2_000_000, 200_000, 100_000, 500_000)

    expect(result.restanteActual).toBe(700_000)
  })

  it('el restante real puede ser negativo si se gastó más de lo que entró', () => {
    const result = calculateRemaining(1_000_000, 1_500_000, 0, 0, 0)

    expect(result.restanteActual).toBe(-500_000)
  })

  it('el restante planeado es exactamente el porAsignar recibido, sin recalcularlo', () => {
    const result = calculateRemaining(0, 0, 0, 0, 1_234_567)

    expect(result.restantePlaneado).toBe(1_234_567)
  })

  it('no resta la deuda por separado: ya está incluida en el gasto actual', () => {
    // gastoActual (2_000_000) ya incluye deudaActual (300_000) como cualquier
    // otro gasto; no hay un quinto parámetro para deuda que pudiera restarse
    // dos veces.
    const conDeuda = calculateRemaining(3_000_000, 2_000_000, 0, 0, 0)
    expect(conDeuda.restanteActual).toBe(1_000_000)
  })

  it('con montos grandes, ambas cifras siguen siendo enteros seguros', () => {
    // 1 billón de unidades monetarias en centavos: muy por debajo de 2^53 - 1.
    const result = calculateRemaining(
      100_000_000_000_000,
      60_000_000_000_000,
      10_000_000_000_000,
      5_000_000_000_000,
      25_000_000_000_000,
    )

    expect(Number.isSafeInteger(result.restanteActual)).toBe(true)
    expect(Number.isSafeInteger(result.restantePlaneado)).toBe(true)
    expect(result.restanteActual).toBe(25_000_000_000_000)
  })
})
