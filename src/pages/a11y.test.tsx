import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { CoachConsentSection } from '@/features/coach-consent/coach-consent-section'
import { axeViolations } from '@/test/axe'
import type { Tables } from '@/types/database.types'

import Auth from './Auth'
import Cookies from './Cookies'
import CsvImport from './CsvImport'
import Privacy from './Privacy'
import Refunds from './Refunds'
import Terms from './Terms'

/**
 * Auditoría automática (axe-core) de las superficies prioritarias. Cubre
 * nombres accesibles, etiquetas, landmarks, headings, tablas y ARIA. El
 * contraste se verifica aparte con los tokens de color.
 */

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn(), signInWithOAuth: vi.fn(), signUp: vi.fn() },
    from: vi.fn(),
  },
}))
vi.mock('@/features/auth/auth-provider', () => ({ useAuth: () => ({ user: { id: 'u' } }) }))
vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => ({
    data: [
      { id: 'acc', name: 'Banco', currency_code: 'COP', is_archived: false },
    ] as Tables<'accounts'>[],
  }),
}))
vi.mock('@/features/categories/hooks', () => ({ useCategories: () => ({ data: [] }) }))
vi.mock('@/features/csv-import/api', () => ({
  createImportSheet: vi.fn(),
  fetchExistingMovements: vi.fn(async () => []),
}))
vi.mock('@/features/coach-consent/hooks', () => ({
  useCoachConsent: () => ({ data: { status: 'none' }, isPending: false, isError: false }),
  useSetCoachConsent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function wrap(children: ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('accesibilidad (axe)', () => {
  it.each([
    ['privacidad', Privacy],
    ['términos', Terms],
    ['cookies', Cookies],
    ['reembolsos', Refunds],
  ])('página legal: %s', async (_name, Page) => {
    const { container } = render(wrap(<Page />))
    expect(await axeViolations(container)).toEqual([])
  })

  it('acceso e inicio de registro', async () => {
    const user = userEvent.setup()
    const { container } = render(wrap(<Auth />))
    expect(await axeViolations(container)).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await axeViolations(container)).toEqual([])
  })

  it('importador CSV vacío y con un archivo cargado', async () => {
    const { container } = render(wrap(<CsvImport />))
    expect(await axeViolations(container)).toEqual([])

    const file = new File(['Fecha;Concepto;Valor\n25/09/2026;Mercado;-45.000\n'], 'x.csv', {
      type: 'text/csv',
    })
    fireEvent.change(screen.getByLabelText(/Extracto en CSV/), { target: { files: [file] } })
    await screen.findByText(/x\.csv: /)
    fireEvent.change(screen.getByLabelText('Cuenta de FinTrack'), { target: { value: 'acc' } })
    fireEvent.change(screen.getByLabelText(/Un monto negativo es/), {
      target: { value: 'negative_is_expense' },
    })
    fireEvent.change(screen.getByLabelText(/Separador decimal/), { target: { value: ',' } })
    await screen.findByRole('checkbox', { name: 'Importar línea 2' })

    expect(await axeViolations(container)).toEqual([])
  })

  it('consentimiento de FinTrack Coach', async () => {
    const { container } = render(wrap(<CoachConsentSection />))
    expect(await axeViolations(container)).toEqual([])
  })
})
