import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppLayout } from './app-layout'

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut } },
}))

type Listener = () => void

/**
 * `matchMedia` que responde a `min-width` en rem según un ancho simulado y
 * avisa a sus suscriptores al cambiarlo. El de `src/test/setup.ts` siempre
 * responde `false`, que equivaldría a probar solo el modo más estrecho.
 */
function installViewport(initialWidth: number) {
  let width = initialWidth
  const listeners = new Set<Listener>()
  const original = window.matchMedia

  const evaluate = (query: string) => {
    const match = /min-width:\s*([\d.]+)rem/.exec(query)
    return match ? width >= Number(match[1]) * 16 : false
  }

  window.matchMedia = ((query: string) => ({
    get matches() {
      return evaluate(query)
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia

  return {
    resize(next: number) {
      width = next
      act(() => listeners.forEach((listener) => listener()))
    },
    restore() {
      window.matchMedia = original
    },
  }
}

const WIDTHS = { narrow: 375, compact: 768, wide: 1280 } as const

let viewport: ReturnType<typeof installViewport>

function renderLayout(width: number, path = '/dashboard') {
  viewport = installViewport(width)

  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<p>Contenido del dashboard</p>} />
          <Route path="/settings" element={<p>Contenido de ajustes</p>} />
        </Route>
        <Route path="/auth" element={<p>Pantalla de login</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function header(): HTMLElement {
  return screen.getByRole('banner')
}

function themeToggle(): HTMLElement {
  return within(header()).getByRole('button', { name: /Cambiar tema/ })
}

function logout(): HTMLElement {
  return within(header()).getByRole('button', { name: 'Cerrar sesión' })
}

function disclosure(): HTMLElement {
  return within(header()).getByRole('button', { name: /^(Más|Menú)/ })
}

beforeEach(() => {
  signOut.mockReset()
  signOut.mockResolvedValue({ error: null })
})

afterEach(() => {
  viewport.restore()
})

describe('AppLayout', () => {
  it.each(Object.entries(WIDTHS))(
    'en %s muestra tema y cerrar sesión, y la página hija',
    (_mode, width) => {
      renderLayout(width)

      expect(themeToggle()).toBeInTheDocument()
      expect(logout()).toBeInTheDocument()
      expect(screen.getByText('Contenido del dashboard')).toBeInTheDocument()
    },
  )

  it('elige el modo por el ancho: ocho enlaces, cuatro y «Más», o «Menú»', () => {
    const { unmount } = renderLayout(WIDTHS.wide)
    const nav = () => screen.getByRole('navigation', { name: 'Principal' })

    expect(within(nav()).getAllByRole('link')).toHaveLength(8)
    expect(within(nav()).queryByRole('button')).not.toBeInTheDocument()
    unmount()
    viewport.restore()

    renderLayout(WIDTHS.compact)
    expect(within(nav()).getAllByRole('link')).toHaveLength(4)
    expect(disclosure()).toHaveAccessibleName('Más')
    viewport.resize(WIDTHS.narrow)
    expect(within(nav()).queryAllByRole('link')).toHaveLength(0)
    expect(disclosure()).toHaveAccessibleName(/^Menú/)
  })

  it.each(['compact', 'narrow'] as const)(
    'en %s, con el panel abierto, tema y cerrar sesión siguen fuera de él',
    async (mode) => {
      const user = userEvent.setup()
      renderLayout(WIDTHS[mode])

      await user.click(disclosure())
      const panel = document.getElementById(disclosure().getAttribute('aria-controls') ?? '')

      expect(panel).toBeVisible()
      expect(panel).not.toContainElement(themeToggle())
      expect(panel).not.toContainElement(logout())

      // Siguen siendo pulsables con el panel abierto: el clic lo cierra y llega.
      await user.click(logout())
      await waitFor(() => expect(signOut).toHaveBeenCalled())
    },
  )

  it('en compact, tema y sesión van antes que la navegación en el orden de foco', () => {
    renderLayout(WIDTHS.compact)

    const nav = screen.getByRole('navigation', { name: 'Principal' })

    expect(logout().compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('en narrow, «Menú» va antes que tema y sesión', () => {
    renderLayout(WIDTHS.narrow)

    expect(
      disclosure().compareDocumentPosition(themeToggle()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('cerrar sesión llama a signOut y lleva a /auth', async () => {
    const user = userEvent.setup()
    renderLayout(WIDTHS.wide)

    await user.click(logout())

    await waitFor(() => expect(screen.getByText('Pantalla de login')).toBeInTheDocument())
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('al pasar de compact a narrow con el foco en el panel, lo cierra y conserva el foco en el botón', async () => {
    const user = userEvent.setup()
    renderLayout(WIDTHS.compact)

    await user.click(disclosure())
    await user.tab()
    expect(screen.getByRole('link', { name: 'Cuentas' })).toHaveFocus()

    viewport.resize(WIDTHS.narrow)

    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure()).toHaveAccessibleName(/^Menú/)
    expect(disclosure()).toHaveFocus()
    expect(themeToggle()).toBeInTheDocument()
    expect(logout()).toBeInTheDocument()
  })

  it('navegar desde «Menú» cambia la página hija y cierra el panel', async () => {
    const user = userEvent.setup()
    renderLayout(WIDTHS.narrow)

    await user.click(disclosure())
    await user.click(screen.getByRole('link', { name: 'Ajustes' }))

    expect(screen.getByText('Contenido de ajustes')).toBeInTheDocument()
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure()).toHaveAccessibleName('Menú, sección actual: Ajustes')
  })
})
