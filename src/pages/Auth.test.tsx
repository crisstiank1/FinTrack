import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import Auth from './Auth'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
      signUp: vi.fn(),
    },
  },
}))

describe('Auth page', () => {
  it('inicia en modo login y alterna a registro y de vuelta a login', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Auth />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(screen.getByRole('heading', { name: 'Crea tu cuenta' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }))
    expect(screen.getByRole('heading', { name: 'Bienvenido de nuevo' })).toBeInTheDocument()
  })
})
