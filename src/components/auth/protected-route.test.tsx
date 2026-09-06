import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Session, User } from '@supabase/supabase-js'

import { ProtectedRoute } from './protected-route'
import { useAuth } from '@/features/auth/auth-provider'

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: vi.fn(),
}))

function renderWithRoute(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/auth" element={<div>Pantalla de login</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Contenido protegido</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('muestra un estado de carga mientras se resuelve la sesión', () => {
    vi.mocked(useAuth).mockReturnValue({ session: null, user: null, loading: true })

    renderWithRoute('/dashboard')

    expect(screen.getByText('Cargando...')).toBeInTheDocument()
  })

  it('redirige a /auth cuando no hay sesión', () => {
    vi.mocked(useAuth).mockReturnValue({ session: null, user: null, loading: false })

    renderWithRoute('/dashboard')

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument()
  })

  it('renderiza el contenido protegido cuando hay sesión activa', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: { user: { id: 'user-1' } } as Session,
      user: { id: 'user-1' } as User,
      loading: false,
    })

    renderWithRoute('/dashboard')

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
  })
})
