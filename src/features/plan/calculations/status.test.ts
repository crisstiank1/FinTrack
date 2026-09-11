import { describe, expect, it } from 'vitest'

import { classifyProgressStatus, resolveBillPaymentStatus } from './status'

describe('classifyProgressStatus (reexport de @/features/budgets/progress)', () => {
  it('reutiliza exactamente los umbrales de /budgets', () => {
    expect(classifyProgressStatus(0, 0)).toBe('unbudgeted')
    expect(classifyProgressStatus(500, 1000)).toBe('ok')
    expect(classifyProgressStatus(700, 1000)).toBe('warning_70')
    expect(classifyProgressStatus(900, 1000)).toBe('warning_90')
    expect(classifyProgressStatus(1100, 1000)).toBe('over')
  })
})

describe('resolveBillPaymentStatus', () => {
  it('pagada: lo real cubre o supera lo planeado', () => {
    expect(resolveBillPaymentStatus(500_000, 500_000, '2026-09-10', '2026-09-05')).toBe('pagada')
    expect(resolveBillPaymentStatus(600_000, 500_000, '2026-09-10', '2026-09-05')).toBe('pagada')
  })

  it('parcial: hay algo de gasto real pero no cubre lo planeado', () => {
    expect(resolveBillPaymentStatus(200_000, 500_000, '2026-09-10', '2026-09-05')).toBe('parcial')
  })

  it('pendiente: sin gasto real y la fecha esperada es hoy o futura', () => {
    expect(resolveBillPaymentStatus(0, 500_000, '2026-09-10', '2026-09-05')).toBe('pendiente')
    expect(resolveBillPaymentStatus(0, 500_000, '2026-09-10', '2026-09-10')).toBe('pendiente')
  })

  it('vencida: sin gasto real y la fecha esperada ya pasó', () => {
    expect(resolveBillPaymentStatus(0, 500_000, '2026-09-01', '2026-09-05')).toBe('vencida')
  })

  it('no_aplica: sin presupuesto efectivo, sin importar el gasto real', () => {
    expect(resolveBillPaymentStatus(0, null, '2026-09-10', '2026-09-05')).toBe('no_aplica')
    expect(resolveBillPaymentStatus(300_000, null, '2026-09-01', '2026-09-05')).toBe('no_aplica')
  })
})
