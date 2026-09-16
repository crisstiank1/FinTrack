import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppNav, type NavMode } from './app-nav'

const ALL_LABELS = [
  'Dashboard',
  'Cuentas',
  'Movimientos',
  'Libro',
  'Hojas',
  'Presupuestos',
  'Plan mensual',
  'Ajustes',
]
const PRIMARY_LABELS = ['Dashboard', 'Movimientos', 'Presupuestos', 'Plan mensual']

let navigateFromOutside: NavigateFunction

function LocationProbe() {
  const location = useLocation()
  navigateFromOutside = useNavigate()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function Harness({ mode }: { mode: NavMode }) {
  return (
    <>
      <button type="button">Antes</button>
      <AppNav mode={mode} />
      <button type="button">Después</button>
      <LocationProbe />
    </>
  )
}

function renderNav(mode: NavMode, path = '/dashboard') {
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <Harness mode={mode} />
    </MemoryRouter>,
  )

  return {
    ...utils,
    // El router conserva su historial al volver a renderizar: solo cambia el modo.
    setMode(next: NavMode) {
      utils.rerender(
        <MemoryRouter initialEntries={[path]}>
          <Harness mode={next} />
        </MemoryRouter>,
      )
    },
  }
}

function navigation(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Principal' })
}

function linkNames(): string[] {
  return within(navigation())
    .queryAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '')
}

function disclosure(): HTMLElement {
  return within(navigation()).getByRole('button', { name: /^(Más|Menú)/ })
}

function panel(): HTMLElement {
  const panelElement = document.getElementById(disclosure().getAttribute('aria-controls') ?? '')
  if (!panelElement) throw new Error('aria-controls no apunta a ningún elemento')
  return panelElement
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AppNav — estructura por modo', () => {
  it('wide muestra los ocho enlaces en orden y sin disclosure', () => {
    renderNav('wide')

    expect(linkNames()).toEqual(ALL_LABELS)
    expect(within(navigation()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('compact cerrado muestra las cuatro principales y «Más»', () => {
    renderNav('compact')

    expect(linkNames()).toEqual(PRIMARY_LABELS)
    expect(disclosure()).toHaveAccessibleName('Más')
  })

  it('compact abierto muestra las ocho rutas, cada una una sola vez', async () => {
    const user = userEvent.setup()
    renderNav('compact')

    await user.click(disclosure())

    expect([...linkNames()].sort()).toEqual([...ALL_LABELS].sort())
    expect(
      within(panel())
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Cuentas', 'Libro', 'Hojas', 'Ajustes'])
  })

  it('narrow cerrado no monta ningún enlace', () => {
    renderNav('narrow')

    expect(linkNames()).toEqual([])
    expect(disclosure()).toHaveAccessibleName('Menú, sección actual: Dashboard')
  })

  it('narrow abierto lista las ocho rutas en orden, una sola vez', async () => {
    const user = userEvent.setup()
    renderNav('narrow')

    await user.click(disclosure())

    expect(linkNames()).toEqual(ALL_LABELS)
  })

  it.each(['wide', 'compact', 'narrow'] as const)(
    'en %s no hay role menu ni menuitem, ni nombres de ruta repetidos',
    async (mode) => {
      const user = userEvent.setup()
      renderNav(mode)

      if (mode !== 'wide') await user.click(disclosure())

      expect(screen.queryAllByRole('menu')).toHaveLength(0)
      expect(screen.queryAllByRole('menuitem')).toHaveLength(0)
      const names = linkNames()
      expect(new Set(names).size).toBe(names.length)
    },
  )
})

describe('AppNav — disclosure', () => {
  it('empieza cerrado, con aria-controls apuntando a un panel que existe', () => {
    renderNav('compact')

    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(panel()).not.toBeVisible()
    expect(within(panel()).queryAllByRole('link')).toHaveLength(0)
  })

  it('el clic alterna abierto y cerrado', async () => {
    const user = userEvent.setup()
    renderNav('compact')

    await user.click(disclosure())
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    expect(panel()).toBeVisible()

    await user.click(disclosure())
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
  })

  it('Enter abre', async () => {
    const user = userEvent.setup()
    renderNav('narrow')

    disclosure().focus()
    await user.keyboard('{Enter}')

    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
  })

  it('Space abre y cierra', async () => {
    const user = userEvent.setup()
    renderNav('narrow')

    disclosure().focus()
    await user.keyboard(' ')
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')

    await user.keyboard(' ')
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
  })

  it('Escape cierra y devuelve el foco al botón', async () => {
    const user = userEvent.setup()
    renderNav('compact')

    await user.click(disclosure())
    await user.tab()
    expect(within(panel()).getByRole('link', { name: 'Cuentas' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure()).toHaveFocus()
  })

  it('Escape ya atendido por otro componente no cierra el panel', async () => {
    const user = userEvent.setup()
    renderNav('compact')
    await user.click(disclosure())

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    event.preventDefault()
    act(() => {
      document.dispatchEvent(event)
    })

    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
  })

  it('un clic fuera cierra sin llevarse el foco al botón', async () => {
    const user = userEvent.setup()
    renderNav('compact')

    await user.click(disclosure())
    await user.click(screen.getByRole('button', { name: 'Después' }))

    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Después' })).toHaveFocus()
  })

  it('un clic dentro del panel, fuera de un enlace, no lo cierra', async () => {
    const user = userEvent.setup()
    renderNav('narrow')

    await user.click(disclosure())
    await user.click(panel())

    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
  })

  it('elegir un enlace navega, cierra y devuelve el foco al botón', async () => {
    const user = userEvent.setup()
    renderNav('compact')

    await user.click(disclosure())
    await user.click(within(panel()).getByRole('link', { name: 'Ajustes' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/settings')
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure()).toHaveFocus()
    expect(disclosure()).toHaveAccessibleName('Más, sección actual: Ajustes')
  })

  it('un cambio de ruta que no viene del panel lo cierra, y volver no lo reabre', async () => {
    const user = userEvent.setup()
    renderNav('narrow')

    await user.click(disclosure())
    act(() => {
      void navigateFromOutside('/plan')
    })
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')

    act(() => {
      void navigateFromOutside('/dashboard')
    })
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
  })

  it('Tab desde el último enlace del panel sale y lo cierra', async () => {
    const user = userEvent.setup()
    renderNav('compact')

    await user.click(disclosure())
    await user.tab() // Cuentas
    await user.tab() // Libro
    await user.tab() // Hojas
    await user.tab() // Ajustes
    await user.tab() // fuera

    expect(screen.getByRole('button', { name: 'Después' })).toHaveFocus()
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
  })

  it('Shift+Tab desde el botón sale hacia atrás y lo cierra sin mover el foco', async () => {
    const user = userEvent.setup()
    renderNav('compact')

    await user.click(disclosure())
    await user.tab({ shift: true })

    expect(within(navigation()).getByRole('link', { name: 'Plan mensual' })).toHaveFocus()
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
  })

  describe('en narrow, con «Menú» como primer elemento enfocable', () => {
    function renderAlone() {
      return render(
        <MemoryRouter initialEntries={['/plan']}>
          <AppNav mode="narrow" />
        </MemoryRouter>,
      )
    }

    /** La página pierde el foco: lo que hace el navegador tras Shift+Tab desde «Menú». */
    function blurWindow() {
      act(() => {
        window.dispatchEvent(new FocusEvent('blur'))
      })
    }

    it('si la página pierde el foco, cierra el panel sin forzar el foco a ningún sitio', async () => {
      const user = userEvent.setup()
      renderAlone()

      // Nada antes de «Menú»: es lo primero que alcanza Tab.
      await user.tab()
      const menu = disclosure()
      expect(menu).toHaveFocus()

      await user.click(menu)
      expect(menu).toHaveAttribute('aria-expanded', 'true')

      const focus = vi.spyOn(HTMLElement.prototype, 'focus')
      blurWindow()

      expect(menu).toHaveAttribute('aria-expanded', 'false')
      expect(within(panel()).queryAllByRole('link')).toHaveLength(0)
      expect(focus).not.toHaveBeenCalled()
    })

    it('con el panel cerrado, un blur de la ventana no hace nada', () => {
      renderAlone()
      const focus = vi.spyOn(HTMLElement.prototype, 'focus')

      blurWindow()

      expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
      expect(focus).not.toHaveBeenCalled()
    })

    it('abrir y cerrar varias veces no acumula listeners de blur en la ventana', async () => {
      const user = userEvent.setup()
      const add = vi.spyOn(window, 'addEventListener')
      const remove = vi.spyOn(window, 'removeEventListener')
      renderAlone()

      const active = () =>
        add.mock.calls.filter(([type]) => type === 'blur').length -
        remove.mock.calls.filter(([type]) => type === 'blur').length
      const base = active()

      for (let round = 0; round < 3; round++) {
        await user.click(disclosure())
        expect(active() - base).toBe(1)

        await user.click(disclosure())
        expect(active() - base).toBe(0)
      }

      // Cerrado tras varias vueltas: el blur ya no llega a ningún listener propio.
      blurWindow()
      expect(disclosure()).toHaveAttribute('aria-expanded', 'false')

      // Y el que se registra al volver a abrir sigue funcionando.
      await user.click(disclosure())
      blurWindow()
      expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    })
  })

  it('cambiar de modo lo cierra y devuelve el foco al botón si seguía dentro', async () => {
    const user = userEvent.setup()
    const { setMode } = renderNav('compact')

    await user.click(disclosure())
    await user.tab()
    expect(within(panel()).getByRole('link', { name: 'Cuentas' })).toHaveFocus()

    setMode('narrow')

    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    expect(disclosure()).toHaveAccessibleName(/^Menú/)
    expect(disclosure()).toHaveFocus()

    // Volver al ancho de antes no reabre el panel.
    setMode('compact')
    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
  })

  it('los listeners globales solo existen mientras el panel está abierto', async () => {
    const user = userEvent.setup()
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    renderNav('compact')

    const registered = () =>
      add.mock.calls.filter(([type]) => type === 'keydown' || type === 'pointerdown').length
    const removed = () =>
      remove.mock.calls.filter(([type]) => type === 'keydown' || type === 'pointerdown').length

    // user-event registra los suyos al montar; se mide la diferencia.
    const baseAdded = registered()
    const baseRemoved = removed()

    await user.click(disclosure())
    expect(registered() - baseAdded).toBe(2)

    await user.keyboard('{Escape}')
    expect(removed() - baseRemoved).toBe(2)
  })
})

describe('AppNav — estado activo', () => {
  it.each([
    ['/dashboard', 'Dashboard'],
    ['/accounts', 'Cuentas'],
    ['/transactions', 'Movimientos'],
    ['/ledger', 'Libro'],
    ['/budgets', 'Presupuestos'],
    ['/plan', 'Plan mensual'],
    ['/settings', 'Ajustes'],
  ])('en wide, %s marca solo «%s», con una señal además del color', (path, label) => {
    renderNav('wide', path)

    const links = within(navigation()).getAllByRole('link')
    const current = links.filter((link) => link.getAttribute('aria-current') === 'page')

    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent(label)
    expect(current[0].className).toContain('font-semibold')
    expect(current[0].className).toContain('shadow-[inset_0_-2px_0_currentColor]')
  })

  it('una consulta en la URL no impide marcar Presupuestos', () => {
    renderNav('wide', '/budgets?month=2026-09')

    expect(within(navigation()).getByRole('link', { name: 'Presupuestos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it.each([
    ['/dashboard', 'Dashboard'],
    ['/transactions', 'Movimientos'],
    ['/budgets', 'Presupuestos'],
    ['/plan', 'Plan mensual'],
  ])('en compact, %s marca su enlace y «Más» queda neutro', (path, label) => {
    renderNav('compact', path)

    expect(within(navigation()).getByRole('link', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(disclosure()).toHaveAccessibleName('Más')
    expect(disclosure().className).not.toContain('font-semibold')
  })

  it.each([
    ['/accounts', 'Cuentas'],
    ['/ledger', 'Libro'],
    ['/sheets', 'Hojas'],
    ['/settings', 'Ajustes'],
  ])('en compact, %s marca «Más» y nombra la sección', async (path, label) => {
    const user = userEvent.setup()
    renderNav('compact', path)

    const button = disclosure()
    expect(button).toHaveAccessibleName(`Más, sección actual: ${label}`)
    expect(button).not.toHaveAttribute('aria-current')
    expect(button.className).toContain('font-semibold')
    expect(button.className).toContain('shadow-[inset_0_-2px_0_currentColor]')
    expect(within(navigation()).queryAllByRole('link', { current: 'page' })).toHaveLength(0)

    await user.click(button)
    expect(within(panel()).getByRole('link', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('en narrow, «Menú» nombra la sección actual y el panel la marca', async () => {
    const user = userEvent.setup()
    renderNav('narrow', '/plan')

    expect(disclosure()).toHaveAccessibleName('Menú, sección actual: Plan mensual')
    expect(disclosure()).not.toHaveAttribute('aria-current')

    await user.click(disclosure())
    expect(within(panel()).getByRole('link', { name: 'Plan mensual' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
