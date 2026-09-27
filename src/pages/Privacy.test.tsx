import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { CURRENT_AI_CONSENT_VERSION } from '@/features/coach/consent'

import Privacy from './Privacy'

function renderPrivacy() {
  return render(
    <MemoryRouter>
      <Privacy />
    </MemoryRouter>,
  )
}

describe('Privacy', () => {
  it('muestra la versión vigente del consentimiento', () => {
    renderPrivacy()
    expect(
      screen.getByText(new RegExp(`Versión ${CURRENT_AI_CONSENT_VERSION}`)),
    ).toBeInTheDocument()
  })

  it('nombra al proveedor y aclara que no es asesoramiento profesional', () => {
    const { container } = renderPrivacy()
    const text = container.textContent ?? ''

    expect(text).toContain('Gemini')
    expect(text).toMatch(/no es asesoramiento profesional financiero, legal, tributario/i)
    expect(text).toMatch(/consentimiento explícito/)
    expect(text).toMatch(/descripciones ni las notas de tus movimientos/)
    expect(text).toMatch(/90 días/)
    expect(text).toMatch(/7 días/)
  })

  it('no expone datos internos del proyecto', () => {
    const { container } = renderPrivacy()
    const text = container.textContent ?? ''

    expect(text).not.toMatch(/supabase\.co|service_role|COACH_LLM|api[_ ]?key/i)
  })
})
