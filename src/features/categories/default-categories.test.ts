import { describe, expect, it } from 'vitest'

import { DEFAULT_CATEGORIES } from './default-categories'

describe('DEFAULT_CATEGORIES', () => {
  it('incluye las 7 categorías de ingresos de docs/03-ui-ux.md', () => {
    const income = DEFAULT_CATEGORIES.filter((c) => c.type === 'income')
    expect(income).toHaveLength(7)
    expect(income.every((c) => c.group === 'income')).toBe(true)
  })

  it('incluye las 9 categorías de gastos esenciales', () => {
    const essential = DEFAULT_CATEGORIES.filter((c) => c.group === 'essential')
    expect(essential).toHaveLength(9)
    expect(essential.every((c) => c.type === 'expense')).toBe(true)
  })

  it('incluye las 9 categorías de gastos flexibles', () => {
    const flexible = DEFAULT_CATEGORIES.filter((c) => c.group === 'flexible')
    expect(flexible).toHaveLength(9)
    expect(flexible.every((c) => c.type === 'expense')).toBe(true)
  })

  it('nunca incluye una categoría de Ahorro (se modela como transferencia)', () => {
    const names = DEFAULT_CATEGORIES.map((c) => c.name.toLowerCase())
    expect(names).not.toContain('ahorro')
  })

  it('cada categoría tiene un ícono válido y nombre no vacío', () => {
    for (const category of DEFAULT_CATEGORIES) {
      expect(category.icon.length).toBeGreaterThan(0)
      expect(category.name.trim().length).toBeGreaterThan(0)
    }
  })
})
