import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CategoryForm } from './category-form'

describe('CategoryForm', () => {
  it('exige un nombre antes de enviar', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<CategoryForm onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText('Ingresa un nombre')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('envía nombre, tipo, ícono y color seleccionados', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<CategoryForm onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Nombre'), 'Mercado')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'income')
    await user.click(screen.getByRole('radio', { name: 'gift' }))
    await user.click(screen.getByRole('radio', { name: '#A855F7' }))
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Mercado',
        type: 'income',
        icon: 'gift',
        color: '#A855F7',
      }),
      expect.anything(),
    )
  })
})

describe('CategoryForm — tipo fijo (M14)', () => {
  it('con fixedType no ofrece el selector de tipo', () => {
    render(<CategoryForm fixedType="expense" onSubmit={vi.fn()} />)

    expect(screen.queryByLabelText('Tipo')).not.toBeInTheDocument()
  })

  it('envía siempre el tipo fijado, aunque los valores iniciales dijeran otro', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <CategoryForm
        fixedType="expense"
        defaultValues={{ type: 'income' }}
        onSubmit={onSubmit}
        submitLabel="Crear categoría"
      />,
    )

    await user.type(screen.getByLabelText('Nombre'), 'Gimnasio')
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Gimnasio', type: 'expense' }),
    )
  })

  it('sin fixedType el selector de tipo sigue como siempre', () => {
    render(<CategoryForm onSubmit={vi.fn()} />)

    expect(screen.getByLabelText('Tipo')).toBeInTheDocument()
  })
})
