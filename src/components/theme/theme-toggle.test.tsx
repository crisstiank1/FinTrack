import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ThemeProvider } from '@/components/theme/theme-provider'
import { ThemeToggle } from '@/components/theme/theme-toggle'

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

  it('cicla entre claro, oscuro y sistema al hacer click', async () => {
    const user = userEvent.setup()
    renderToggle()

    const button = await screen.findByRole('button', { name: /tema claro/i })

    await user.click(button)
    expect(await screen.findByRole('button', { name: /tema oscuro/i })).toBeInTheDocument()

    await user.click(button)
    expect(await screen.findByRole('button', { name: /tema del sistema/i })).toBeInTheDocument()

    await user.click(button)
    expect(await screen.findByRole('button', { name: /tema claro/i })).toBeInTheDocument()
  })
})
