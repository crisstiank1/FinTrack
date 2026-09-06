import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { LoginForm } from './login-form'
import { redirectAfterAuth } from '@/features/auth/redirect-after-auth'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  },
}))

vi.mock('@/features/auth/redirect-after-auth', () => ({
  redirectAfterAuth: vi.fn(),
}))

function renderLoginForm() {
  return render(
    <MemoryRouter>
      <LoginForm onSwitchToRegister={vi.fn()} />
    </MemoryRouter>,
  )
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra errores de validación cuando los campos están vacíos', async () => {
    const user = userEvent.setup()
    renderLoginForm()

    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    expect(await screen.findByText('Ingresa tu correo electrónico')).toBeInTheDocument()
    expect(await screen.findByText('Ingresa tu contraseña')).toBeInTheDocument()
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('muestra un error cuando el correo no tiene formato válido', async () => {
    const user = userEvent.setup()
    renderLoginForm()

    await user.type(screen.getByLabelText('Correo electrónico'), 'no-es-un-correo')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    expect(await screen.findByText('Correo electrónico inválido')).toBeInTheDocument()
  })

  it('inicia sesión y redirige según el perfil cuando las credenciales son válidas', async () => {
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { user: { id: 'user-1' }, session: {} },
      error: null,
    } as never)

    const user = userEvent.setup()
    renderLoginForm()

    await user.type(screen.getByLabelText('Correo electrónico'), 'test@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'password123')
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      })
    })
    await waitFor(() => {
      expect(redirectAfterAuth).toHaveBeenCalledWith(expect.anything(), 'user-1')
    })
  })

  it('llama a signInWithOAuth al continuar con Google', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({ data: {}, error: null } as never)

    const user = userEvent.setup()
    renderLoginForm()

    await user.click(screen.getByRole('button', { name: /continuar con google/i }))

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' }),
    )
  })
})
