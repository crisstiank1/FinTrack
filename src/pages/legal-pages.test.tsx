import { render, screen, within } from '@testing-library/react'
import type { ComponentType } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { CURRENT_AI_CONSENT_VERSION } from '@/features/coach/consent'
import { CONTACT_PLACEHOLDER, LEGAL_DOCUMENTS } from '@/features/legal/documents'

import Cookies from './Cookies'
import Privacy from './Privacy'
import Refunds from './Refunds'
import Terms from './Terms'

const PAGES: [keyof typeof LEGAL_DOCUMENTS, ComponentType][] = [
  ['privacy', Privacy],
  ['terms', Terms],
  ['cookies', Cookies],
  ['refunds', Refunds],
]

function renderPage(Page: ComponentType) {
  return render(
    <MemoryRouter>
      <Page />
    </MemoryRouter>,
  )
}

describe.each(PAGES)('página legal %s', (key, Page) => {
  const document_ = LEGAL_DOCUMENTS[key]

  it('tiene un único h1, versión, vigencia y título de pestaña', () => {
    renderPage(Page)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(document_.title)
    expect(screen.getByText(new RegExp(`Versión ${document_.version}`))).toBeInTheDocument()
    expect(document.title).toBe(`${document_.title} · FinTrack`)
  })

  it('usa landmarks y enlaza los cuatro documentos desde el pie', () => {
    renderPage(Page)
    expect(screen.getByRole('main')).toBeInTheDocument()
    const footer = screen.getByRole('contentinfo')
    const links = within(within(footer).getByRole('navigation', { name: 'Información legal' }))
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
    expect(links).toEqual(['/privacy', '/terms', '/cookies', '/refunds'])
  })

  it('no contiene afirmaciones absolutas ni datos internos', () => {
    const { container } = renderPage(Page)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/100\s?%|sin riesgo|la mejor app|garantizamos|totalmente seguro/i)
    expect(text).not.toMatch(/supabase\.co|service_role|COACH_LLM|api[_ ]?key/i)
    expect(text).not.toMatch(/Bancolombia|Nequi|\bNu\b/)
  })
})

describe('Privacy', () => {
  it('muestra la versión vigente del consentimiento', () => {
    expect(LEGAL_DOCUMENTS.privacy.version).toBe(CURRENT_AI_CONSENT_VERSION)
  })

  it('menciona Gemini de forma condicional y deja claro que hoy no se envía nada', () => {
    const { container } = renderPage(Privacy)
    const text = container.textContent ?? ''
    expect(text).toContain(
      'FinTrack puede utilizar Google Gemini API cuando FinTrack Coach esté habilitado y el usuario otorgue consentimiento explícito.',
    )
    expect(text).toContain('no se envía nada a Gemini')
    expect(text).not.toMatch(/todos los usuarios envían/i)
  })

  it('nombra los proveedores reales, derechos, no asesoramiento y contacto pendiente', () => {
    const { container } = renderPage(Privacy)
    const text = container.textContent ?? ''
    for (const provider of ['Supabase', 'Google', 'Cloudflare']) expect(text).toContain(provider)
    expect(text).toMatch(/no es asesoramiento profesional financiero, legal, tributario/i)
    expect(text).toMatch(/descripciones ni las notas de tus movimientos/)
    for (const right of ['Acceso', 'Corrección', 'Eliminación', 'Revocación']) {
      expect(text).toContain(right)
    }
    expect(text).toContain(CONTACT_PLACEHOLDER)
  })
})

describe('Terms', () => {
  it('aclara que no es entidad financiera ni asesora, y deja la ley aplicable pendiente', () => {
    const { container } = renderPage(Terms)
    const text = container.textContent ?? ''
    expect(text).toMatch(/No es una entidad financiera/)
    expect(text).toMatch(/No procesa pagos ni transferencias reales/)
    expect(text).toMatch(/No ofrece asesoramiento profesional/)
    expect(text).toMatch(/Ley aplicable.*Pendiente de definir/s)
  })
})

describe('Cookies', () => {
  it('solo declara almacenamiento necesario y ningún rastreador', () => {
    renderPage(Cookies)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
      'fintrack-theme',
      'sb-…-auth-token',
    ])
    expect(
      screen.getByText(/no mostramos un aviso de consentimiento de cookies/),
    ).toBeInTheDocument()
  })
})

describe('Refunds', () => {
  it('dice que no hay pagos y por tanto no hay reembolsos, sin inventar una política', () => {
    const { container } = renderPage(Refunds)
    expect(container.textContent).toContain(
      'Actualmente FinTrack no procesa pagos ni ofrece suscripciones pagas dentro de la aplicación. Por esta razón, no existe un proceso de reembolsos aplicable.',
    )
  })
})
