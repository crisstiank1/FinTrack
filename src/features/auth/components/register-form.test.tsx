import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { RegisterForm } from './register-form'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  },
}))

vi.mock('@/features/auth/redirect-after-auth', () => ({
  redirectAfterAuth: vi.fn(),
}))

function renderRegisterForm() {
  return render(
    <MemoryRouter>
      <RegisterForm onSwitchToLogin={vi.fn()} />
    </MemoryRouter>,
  )
}

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra la pista de longitud mínima antes de enviar el formulario', () => {
    renderRegisterForm()
    expect(screen.getByText('Mínimo 8 caracteres')).toBeInTheDocument()
  })

  it('valida que las contraseñas coincidan', async () => {
    const user = userEvent.setup()
    renderRegisterForm()

    await user.type(screen.getByLabelText('Correo electrónico'), 'nuevo@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'password123')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'otra-password')
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))

    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(supabase.auth.signUp).not.toHaveBeenCalled()
  })

  it('muestra el mensaje de confirmación cuando el registro no entrega sesión inmediata', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: 'user-1' }, session: null },
      error: null,
    } as never)

    const user = userEvent.setup()
    renderRegisterForm()

    await user.type(screen.getByLabelText('Correo electrónico'), 'nuevo@example.com')
    await user.type(screen.getByLabelText('Contraseña'), 'password123')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'password123')
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }))

    expect(await screen.findByText(/confirma tu correo/i)).toBeInTheDocument()
  })
})
