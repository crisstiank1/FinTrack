import { describe, expect, it } from 'vitest'

import { currentMonthKey, monthKeyInTimeZone, todayIsoDate } from './dates'

describe('todayIsoDate', () => {
  it('devuelve la fecha local en formato YYYY-MM-DD', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('coincide con los componentes de fecha locales, no con UTC', () => {
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`

    expect(todayIsoDate()).toBe(expected)
  })
})

describe('currentMonthKey', () => {
  it('devuelve el mes local en formato YYYY-MM', () => {
    expect(currentMonthKey()).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('monthKeyInTimeZone', () => {
  // 2026-10-01T01:00:00Z son las 20:00 del 30 de septiembre en Bogotá (UTC-5).
  const endOfSeptemberInBogota = new Date('2026-10-01T01:00:00Z')
  // 2026-10-01T05:30:00Z son las 00:30 del 1 de octubre en Bogotá.
  const startOfOctoberInBogota = new Date('2026-10-01T05:30:00Z')

  it('devuelve septiembre a las 20:00 del día 30 en Bogotá, aunque en UTC ya sea octubre', () => {
    expect(monthKeyInTimeZone('America/Bogota', endOfSeptemberInBogota)).toBe('2026-09')
  })

  it('devuelve octubre a las 00:30 del día 1 en Bogotá', () => {
    expect(monthKeyInTimeZone('America/Bogota', startOfOctoberInBogota)).toBe('2026-10')
  })

  it('el mismo instante da meses distintos según la zona horaria', () => {
    expect(monthKeyInTimeZone('UTC', endOfSeptemberInBogota)).toBe('2026-10')
    expect(monthKeyInTimeZone('America/Bogota', endOfSeptemberInBogota)).toBe('2026-09')
  })

  it('respeta una zona adelantada respecto a UTC', () => {
    // 20:00 UTC del 30 de septiembre son las 05:00 del 1 de octubre en Tokio (UTC+9).
    const instant = new Date('2026-09-30T20:00:00Z')

    expect(monthKeyInTimeZone('UTC', instant)).toBe('2026-09')
    expect(monthKeyInTimeZone('Asia/Tokyo', instant)).toBe('2026-10')
  })

  it('cambia de año correctamente en el límite de diciembre', () => {
    // 2027-01-01T02:00:00Z son las 21:00 del 31 de diciembre en Bogotá.
    const instant = new Date('2027-01-01T02:00:00Z')

    expect(monthKeyInTimeZone('America/Bogota', instant)).toBe('2026-12')
    expect(monthKeyInTimeZone('UTC', instant)).toBe('2027-01')
  })

  it('no depende de la hora local del proceso: el instante y la zona bastan', () => {
    const instant = new Date('2026-06-15T12:00:00Z')

    expect(monthKeyInTimeZone('America/Bogota', instant)).toBe('2026-06')
    expect(monthKeyInTimeZone('Europe/Madrid', instant)).toBe('2026-06')
    expect(monthKeyInTimeZone('UTC', instant)).toBe('2026-06')
  })

  it('sin fecha usa el instante actual y devuelve el formato YYYY-MM', () => {
    expect(monthKeyInTimeZone('America/Bogota')).toMatch(/^\d{4}-\d{2}$/)
  })

  it('lanza con una zona horaria que el entorno no reconoce, en vez de caer en UTC', () => {
    expect(() => monthKeyInTimeZone('No/Existe', endOfSeptemberInBogota)).toThrow(RangeError)
  })
})
