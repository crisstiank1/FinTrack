import { describe, expect, it } from 'vitest'

import { currentMonthKey, todayIsoDate } from './dates'

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
