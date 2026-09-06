import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { OnboardingWizard } from './onboarding-wizard'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  },
}))

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, loading: false }),
}))

function renderWizard() {
  return render(
    <MemoryRouter>
      <OnboardingWizard />
    </MemoryRouter>,
  )
}

describe('OnboardingWizard', () => {
  it('avanza del paso de bienvenida al de cuentas', async () => {
    const user = userEvent.setup()
    renderWizard()

    expect(screen.getByText('Paso 1 de 4')).toBeInTheDocument()

    await user.type(screen.getByLabelText('¿Cómo te llamas?'), 'Ana')
    await user.click(screen.getByRole('button', { name: /continuar/i }))

    expect(await screen.findByText('Paso 2 de 4')).toBeInTheDocument()
    expect(screen.getByText('Tu primera cuenta')).toBeInTheDocument()
  })

  it('permite volver del paso de cuentas al de bienvenida conservando los datos', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.type(screen.getByLabelText('¿Cómo te llamas?'), 'Ana')
    await user.click(screen.getByRole('button', { name: /continuar/i }))
    await screen.findByText('Paso 2 de 4')

    await user.click(screen.getByRole('button', { name: /atrás/i }))

    expect(await screen.findByText('Paso 1 de 4')).toBeInTheDocument()
    expect(screen.getByLabelText('¿Cómo te llamas?')).toHaveValue('Ana')
  })

  it('exige al menos una cuenta con nombre antes de avanzar', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.type(screen.getByLabelText('¿Cómo te llamas?'), 'Ana')
    await user.click(screen.getByRole('button', { name: /continuar/i }))
    await screen.findByText('Paso 2 de 4')

    await user.click(screen.getByRole('button', { name: /continuar/i }))

    expect(await screen.findByText('Ingresa un nombre')).toBeInTheDocument()
  })

  it('permite agregar una segunda cuenta y avanzar hasta la confirmación', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.type(screen.getByLabelText('¿Cómo te llamas?'), 'Ana')
    await user.click(screen.getByRole('button', { name: /continuar/i }))
    await screen.findByText('Paso 2 de 4')

    await user.type(screen.getByLabelText('Nombre'), 'Cuenta principal')
    await user.click(screen.getByRole('button', { name: /agregar otra cuenta/i }))
    expect(screen.getAllByText(/^Cuenta \d$/)).toHaveLength(2)

    await user.type(screen.getAllByLabelText('Nombre')[1], 'Cuenta de ahorros')
    await user.click(screen.getByRole('button', { name: /continuar/i }))
    await screen.findByText('Paso 3 de 4')

    await user.click(screen.getByRole('button', { name: /crear categorías y continuar/i }))

    expect(await screen.findByText('Paso 4 de 4')).toBeInTheDocument()
    expect(screen.getByText('Todo listo, Ana')).toBeInTheDocument()
  })
})
