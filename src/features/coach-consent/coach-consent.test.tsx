import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CURRENT_AI_CONSENT_VERSION, hasExplicitConsent } from '@/features/coach/consent'

const update = vi.fn()
const eq = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (values: unknown) => {
        update(values)
        return { eq: (...args: unknown[]) => (eq(...args), Promise.resolve({ error: null })) }
      },
    }),
  },
}))

const consent = vi.fn()
const mutateAsync = vi.fn()
vi.mock('./hooks', () => ({
  useCoachConsent: () => consent(),
  useSetCoachConsent: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const { consentState, grantCoachConsent, revokeCoachConsent } = await import('./api')
const { CoachConsentSection } = await import('./coach-consent-section')

beforeEach(() => {
  update.mockReset()
  eq.mockReset()
  mutateAsync.mockReset().mockResolvedValue(undefined)
})

describe('consentState', () => {
  it('usa la misma regla que el backend', () => {
    const current = {
      ai_consent_at: '2026-09-27T10:00:00Z',
      ai_consent_version: CURRENT_AI_CONSENT_VERSION,
    }
    expect(hasExplicitConsent(current)).toBe(true)
    expect(consentState(current)).toMatchObject({ status: 'granted' })
    expect(
      consentState({ ai_consent_at: '2026-01-01T00:00:00Z', ai_consent_version: '2026-01-01' }),
    ).toMatchObject({
      status: 'outdated',
      version: '2026-01-01',
    })
    expect(consentState(null)).toEqual({ status: 'none' })
    expect(consentState({ ai_consent_at: null, ai_consent_version: null })).toEqual({
      status: 'none',
    })
  })
})

describe('api', () => {
  it('conceder guarda fecha y versión vigente juntas, sobre el propio perfil', async () => {
    await grantCoachConsent('user-1', new Date('2026-09-27T12:00:00Z'))
    expect(update).toHaveBeenCalledWith({
      ai_consent_at: '2026-09-27T12:00:00.000Z',
      ai_consent_version: CURRENT_AI_CONSENT_VERSION,
    })
    expect(eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('revocar anula las dos columnas', async () => {
    await revokeCoachConsent('user-1')
    expect(update).toHaveBeenCalledWith({ ai_consent_at: null, ai_consent_version: null })
  })
})

describe('CoachConsentSection', () => {
  it('sin consentimiento: casilla desmarcada y botón bloqueado hasta marcarla', () => {
    consent.mockReturnValue({ data: { status: 'none' }, isPending: false, isError: false })
    render(<CoachConsentSection />)

    const checkbox = screen.getByRole('checkbox', { name: /autorizo que FinTrack Coach analice/ })
    const button = screen.getByRole('button', { name: 'Autorizar análisis de FinTrack Coach' })
    expect(checkbox).not.toBeChecked()
    expect(button).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Leer la política de privacidad' })).toHaveAttribute(
      'href',
      '/privacy',
    )

    fireEvent.click(checkbox)
    expect(button).toBeEnabled()
    fireEvent.click(button)
    expect(mutateAsync).toHaveBeenCalledWith(true)
  })

  it('con consentimiento vigente: muestra versión y permite retirarlo', () => {
    consent.mockReturnValue({
      data: { status: 'granted', at: '2026-09-27T12:00:00Z', version: CURRENT_AI_CONSENT_VERSION },
      isPending: false,
      isError: false,
    })
    render(<CoachConsentSection />)

    expect(
      screen.getByText(new RegExp(`política ${CURRENT_AI_CONSENT_VERSION}`)),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retirar autorización de FinTrack Coach' }))
    expect(mutateAsync).toHaveBeenCalledWith(false)
  })

  it('con una versión antigua lo explica y vuelve a pedirlo', () => {
    consent.mockReturnValue({
      data: { status: 'outdated', at: '2026-01-01T00:00:00Z', version: '2026-01-01' },
      isPending: false,
      isError: false,
    })
    render(<CoachConsentSection />)
    expect(screen.getByText(/Tu autorización anterior ya no es válida/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('si falla la lectura, lo dice y no ofrece autorizar a ciegas', () => {
    consent.mockReturnValue({ data: undefined, isPending: false, isError: true })
    render(<CoachConsentSection />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no usará tus datos/)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
