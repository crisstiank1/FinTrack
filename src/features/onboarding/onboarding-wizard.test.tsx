import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import { OnboardingWizard } from './onboarding-wizard'

const { inserts } = vi.hoisted(() => ({
  inserts: [] as { table: string; rows: unknown }[],
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      insert: vi.fn((rows: unknown) => {
        inserts.push({ table, rows })
        return Promise.resolve({ error: null })
      }),
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
  beforeEach(() => {
    inserts.length = 0
  })

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

  it('permite elegir «Cuenta de inversión» y la inserta con el ícono trending-up', async () => {
    const user = userEvent.setup()
    renderWizard()

    await user.type(screen.getByLabelText('¿Cómo te llamas?'), 'Ana')
    await user.click(screen.getByRole('button', { name: /continuar/i }))
    await screen.findByText('Paso 2 de 4')

    await user.type(screen.getByLabelText('Nombre'), 'Inversiones')
    await user.selectOptions(screen.getByLabelText('Tipo'), 'investment')
    await user.click(screen.getByRole('button', { name: /continuar/i }))
    await screen.findByText('Paso 3 de 4')

    await user.click(screen.getByRole('button', { name: /crear categorías y continuar/i }))
    await screen.findByText('Paso 4 de 4')
    expect(screen.getByText(/Inversiones \(Cuenta de inversión/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ir a mi dashboard/i }))

    await waitFor(() => {
      expect(inserts.find((insert) => insert.table === 'accounts')?.rows).toEqual([
        expect.objectContaining({
          user_id: 'user-1',
          name: 'Inversiones',
          type: 'investment',
          icon: 'trending-up',
        }),
      ])
    })
  })
})
