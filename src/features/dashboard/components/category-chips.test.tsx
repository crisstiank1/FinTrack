import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CategoryChips, type CategoryChip } from './category-chips'

function chips(count: number): CategoryChip[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `cat-${index + 1}`,
    name: `Categoría ${index + 1}`,
    icon: null,
  }))
}

function group() {
  return within(screen.getByRole('radiogroup', { name: 'Categoría' }))
}

describe('CategoryChips', () => {
  it('con ocho o menos las muestra todas y no ofrece «Más…»', () => {
    render(<CategoryChips categories={chips(8)} onChange={vi.fn()} />)

    expect(group().getAllByRole('radio')).toHaveLength(8)
    expect(screen.queryByRole('button', { name: 'Más…' })).not.toBeInTheDocument()
  })

  it('con más de ocho deja el resto tras «Más…»', async () => {
    const user = userEvent.setup()
    render(<CategoryChips categories={chips(12)} onChange={vi.fn()} />)

    expect(group().getAllByRole('radio')).toHaveLength(8)
    expect(group().queryByRole('radio', { name: 'Categoría 12' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Más…' }))

    expect(group().getAllByRole('radio')).toHaveLength(12)
    expect(screen.queryByRole('button', { name: 'Más…' })).not.toBeInTheDocument()
  })

  it('la categoría elegida se ve aunque esté fuera de las primeras', () => {
    render(<CategoryChips categories={chips(12)} value="cat-12" onChange={vi.fn()} />)

    const visibles = group().getAllByRole('radio')
    expect(visibles).toHaveLength(8)
    expect(group().getByRole('radio', { name: 'Categoría 12' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('marca solo la elegida', () => {
    render(<CategoryChips categories={chips(3)} value="cat-2" onChange={vi.fn()} />)

    expect(group().getByRole('radio', { name: 'Categoría 2' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(group().getByRole('radio', { name: 'Categoría 1' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('devuelve la categoría completa al elegirla', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CategoryChips categories={chips(3)} onChange={onChange} />)

    await user.click(group().getByRole('radio', { name: 'Categoría 2' }))

    expect(onChange).toHaveBeenCalledWith({ id: 'cat-2', name: 'Categoría 2', icon: null })
  })

  it('sin categorías dice qué falta en vez de dejar un hueco', () => {
    render(<CategoryChips categories={[]} onChange={vi.fn()} />)

    expect(screen.getByText(/No tienes categorías de este tipo/)).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })
})
