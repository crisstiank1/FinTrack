import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { HelpHint } from './help-hint'

function renderHint() {
  render(
    <div>
      <HelpHint title="Mes y cuenta">Los presupuestos no cambian con el filtro de cuenta.</HelpHint>
      <button type="button">Otro botón</button>
    </div>,
  )

  return screen.getByRole('button', { name: 'Ayuda: Mes y cuenta' })
}

function panel() {
  return screen.queryByRole('region', { name: 'Mes y cuenta' })
}

describe('HelpHint', () => {
  it('está cerrado al empezar y se anuncia como botón con su estado', () => {
    const button = renderHint()

    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(panel()).not.toBeInTheDocument()
  })

  it('se abre al pasar el ratón y se cierra al salir', async () => {
    const user = userEvent.setup()
    const button = renderHint()

    await user.hover(button)
    expect(panel()).toHaveTextContent('Los presupuestos no cambian con el filtro de cuenta.')
    expect(button).toHaveAttribute('aria-expanded', 'true')

    await user.unhover(button)
    expect(panel()).not.toBeInTheDocument()
  })

  it('se abre al llegar con el teclado y Escape lo cierra sin perder el foco', async () => {
    const user = userEvent.setup()
    const button = renderHint()

    await user.tab()
    expect(button).toHaveFocus()
    expect(panel()).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(panel()).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('un toque lo deja abierto aunque el puntero se vaya, y otro lo cierra', async () => {
    const user = userEvent.setup()
    const button = renderHint()

    await user.click(button)
    await user.unhover(button)
    expect(panel()).toBeInTheDocument()

    await user.click(button)
    expect(panel()).not.toBeInTheDocument()
  })

  it('tocar fuera lo cierra', async () => {
    const user = userEvent.setup()
    const button = renderHint()

    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Otro botón' }))

    expect(panel()).not.toBeInTheDocument()
  })
})
