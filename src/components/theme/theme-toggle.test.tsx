import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ThemeProvider } from '@/components/theme/theme-provider'
import { ThemeToggle } from '@/components/theme/theme-toggle'

afterEach(() => {
  localStorage.clear()
})

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  )
}

describe('ThemeToggle', () => {
  it('muestra el tema claro por defecto', async () => {
    renderToggle()

    expect(await screen.findByRole('button', { name: /tema claro/i })).toBeInTheDocument()
  })

  it('alterna solo entre claro y oscuro, sin modo sistema (M17)', async () => {
    const user = userEvent.setup()
    renderToggle()

    const button = await screen.findByRole('button', { name: /tema claro/i })

    await user.click(button)
    expect(await screen.findByRole('button', { name: /tema oscuro/i })).toBeInTheDocument()

    await user.click(button)
    expect(await screen.findByRole('button', { name: /tema claro/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /sistema/i })).not.toBeInTheDocument()
  })

  it('guarda la preferencia explícita elegida', async () => {
    const user = userEvent.setup()
    renderToggle()

    await user.click(await screen.findByRole('button', { name: /tema claro/i }))

    expect(localStorage.getItem('fintrack-theme')).toBe('dark')
  })

  it('un valor guardado que no es claro ni oscuro se trata como claro', async () => {
    localStorage.setItem('fintrack-theme', 'system')
    const user = userEvent.setup()
    renderToggle()

    const button = await screen.findByRole('button', { name: /tema claro/i })
    await user.click(button)

    expect(localStorage.getItem('fintrack-theme')).toBe('dark')
  })
})
