import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { PAGE_HELP } from './page-help'
import { PageTitle } from './page-title'

function renderTitle() {
  render(
    <div>
      <PageTitle helpTitle="Cuentas" help={PAGE_HELP.accounts}>
        Cuentas
      </PageTitle>
      <button type="button">Fuera</button>
    </div>,
  )

  return screen.getByRole('button', { name: 'Ayuda: Cuentas' })
}

describe('PageTitle', () => {
  it('el título sigue siendo el h1 y el «?» va a su lado, cerrado', () => {
    const button = renderTitle()

    const heading = screen.getByRole('heading', { level: 1, name: 'Cuentas' })
    expect(heading.parentElement).toContainElement(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls')
  })

  it('el panel es el que nombra aria-controls y lleva el texto de la pantalla', async () => {
    const user = userEvent.setup()
    const button = renderTitle()

    await user.hover(button)

    const panel = screen.getByRole('region', { name: 'Cuentas' })
    expect(panel).toHaveAttribute('id', button.getAttribute('aria-controls'))
    expect(panel).toHaveTextContent(PAGE_HELP.accounts)
  })

  it('el panel se ancla a la fila del título, no al botón', async () => {
    const user = userEvent.setup()
    const button = renderTitle()

    await user.click(button)

    const row = screen.getByRole('heading', { level: 1 }).parentElement as HTMLElement
    expect(row).toHaveClass('relative')
    expect(button.parentElement).toHaveClass('static')
    expect(button.parentElement).not.toHaveClass('relative')
    expect(screen.getByRole('region', { name: 'Cuentas' })).toHaveClass('left-0')
  })

  it('no atrapa el foco: con Tab se sale y se cierra', async () => {
    const user = userEvent.setup()
    const button = renderTitle()

    await user.tab()
    expect(button).toHaveFocus()
    expect(button).toHaveAttribute('aria-expanded', 'true')

    await user.tab()
    expect(screen.getByRole('button', { name: 'Fuera' })).toHaveFocus()
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('tocar fuera lo cierra', async () => {
    const user = userEvent.setup()
    const button = renderTitle()

    await user.click(button)
    await user.click(screen.getByRole('button', { name: 'Fuera' }))

    expect(button).toHaveAttribute('aria-expanded', 'false')
  })
})
