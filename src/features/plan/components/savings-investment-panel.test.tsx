import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { ContributionBalances } from '../hooks'

import { SavingsInvestmentPanel } from './savings-investment-panel'

const balances: ContributionBalances = {
  savings: { balanceMinor: 700_000, accountCount: 2, archivedCount: 0 },
  investment: { balanceMinor: 0, accountCount: 0, archivedCount: 0 },
  asOfDate: '2026-09-30',
}

function renderPanel(props: Partial<Parameters<typeof SavingsInvestmentPanel>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SavingsInvestmentPanel
        currencyCode="COP"
        savings={{ contributionsMinor: 500_000, plannedMinor: null }}
        investment={{ contributionsMinor: 0, plannedMinor: null }}
        balances={balances}
        isBalanceError={false}
        {...props}
      />
    </MemoryRouter>,
  )
}

function block(): HTMLElement {
  return screen.getByRole('region', { name: 'Ahorro e inversión' })
}

function card(name: 'Ahorro' | 'Inversión'): HTMLElement {
  return within(block()).getByRole('region', { name })
}

/** Texto de la cifra que sigue a un rótulo `<dt>`, y de su pie. */
function figure(container: HTMLElement, label: string): string[] {
  const term = within(container).getByText(label, { selector: 'dt' })
  const details: string[] = []
  let next = term.nextElementSibling
  while (next && next.tagName === 'DD') {
    details.push(next.textContent?.trim() ?? '')
    next = next.nextElementSibling
  }
  return details
}

describe('SavingsInvestmentPanel', () => {
  it('muestra el título, la nota fija y las dos tarjetas', () => {
    renderPanel()

    expect(within(block()).getByRole('heading', { name: 'Ahorro e inversión', level: 2 }))
    expect(
      within(block()).getByText(
        'Los aportes son transferencias registradas en el mes hacia tus cuentas de ahorro o inversión. El saldo es lo acumulado en esas cuentas y no se suma a las cifras del mes.',
      ),
    ).toBeInTheDocument()
    expect(card('Ahorro')).toBeInTheDocument()
    expect(card('Inversión')).toBeInTheDocument()
  })

  it('separa aportes del mes y saldo en cuentas en cada tarjeta', () => {
    renderPanel()

    expect(figure(card('Ahorro'), 'Aportes a ahorro del mes')).toEqual([
      'COP 500.000',
      'Planeado: Sin aportes planeados',
    ])
    expect(figure(card('Ahorro'), 'Saldo en cuentas de ahorro')).toEqual([
      'COP 700.000',
      'Al 30 de septiembre de 2026 · 2 cuentas',
    ])
    expect(figure(card('Inversión'), 'Aportes a inversión del mes')).toEqual([
      'COP 0',
      'Planeado: Sin aportes planeados',
    ])
  })

  it('un mes sin aportes dice COP 0, nunca «Sin aportes»', () => {
    renderPanel()

    const [contributions] = figure(card('Inversión'), 'Aportes a inversión del mes')
    expect(contributions).toBe('COP 0')
    expect(within(card('Inversión')).queryByText('Sin aportes')).not.toBeInTheDocument()
  })

  it('conserva un aporte planeado de 0 como COP 0', () => {
    renderPanel({ savings: { contributionsMinor: 0, plannedMinor: 0 } })

    expect(figure(card('Ahorro'), 'Aportes a ahorro del mes')).toEqual(['COP 0', 'Planeado: COP 0'])
  })

  it('sin cuentas del tipo lo dice con palabras y enlaza a Cuentas, sin escribir COP 0', () => {
    renderPanel()

    const [balance] = figure(card('Inversión'), 'Saldo en cuentas de inversión')
    expect(balance).toBe('Sin cuentas de inversión')

    const link = within(card('Inversión')).getByRole('link', {
      name: 'Crear una cuenta de inversión',
    })
    expect(link).toHaveAttribute('href', '/accounts')
  })

  it('también enlaza a Cuentas cuando no hay cuentas de ahorro', () => {
    renderPanel({
      balances: { ...balances, savings: { balanceMinor: 0, accountCount: 0, archivedCount: 0 } },
    })

    expect(figure(card('Ahorro'), 'Saldo en cuentas de ahorro')[0]).toBe('Sin cuentas de ahorro')
    expect(
      within(card('Ahorro')).getByRole('link', { name: 'Crear una cuenta de ahorro' }),
    ).toHaveAttribute('href', '/accounts')
  })

  it('con cuentas y saldo 0 escribe COP 0 con su pie', () => {
    renderPanel({
      balances: { ...balances, investment: { balanceMinor: 0, accountCount: 1, archivedCount: 0 } },
    })

    expect(figure(card('Inversión'), 'Saldo en cuentas de inversión')).toEqual([
      'COP 0',
      'Al 30 de septiembre de 2026 · 1 cuenta',
    ])
  })

  it('nombra las cuentas archivadas incluidas en el saldo', () => {
    renderPanel({
      balances: {
        ...balances,
        savings: { balanceMinor: 700_000, accountCount: 2, archivedCount: 1 },
      },
    })

    expect(figure(card('Ahorro'), 'Saldo en cuentas de ahorro')[1]).toBe(
      'Al 30 de septiembre de 2026 · 2 cuentas · 1 archivada',
    )
  })

  it('destaca un saldo negativo sin quitarle el signo al texto', () => {
    renderPanel({
      balances: {
        ...balances,
        savings: { balanceMinor: -50_000, accountCount: 1, archivedCount: 0 },
      },
    })

    const value = within(card('Ahorro')).getByText('COP -50.000')
    expect(value.className).toContain('text-danger')
  })

  it('un saldo positivo no se marca como problema', () => {
    renderPanel()

    expect(within(card('Ahorro')).getByText('COP 700.000').className).not.toContain('text-danger')
  })

  it('mientras el saldo carga no afirma ninguna cifra, y los aportes se ven igual', () => {
    renderPanel({ balances: undefined })

    for (const [name, label] of [
      ['Ahorro', 'Saldo en cuentas de ahorro'],
      ['Inversión', 'Saldo en cuentas de inversión'],
    ] as const) {
      expect(figure(card(name), label)).toEqual(['Calculando saldo…'])
    }
    expect(figure(card('Ahorro'), 'Aportes a ahorro del mes')[0]).toBe('COP 500.000')
  })

  it('si el saldo falla lo dice solo en la cifra de saldo', () => {
    renderPanel({ balances: undefined, isBalanceError: true })

    expect(figure(card('Ahorro'), 'Saldo en cuentas de ahorro')).toEqual([
      'No pudimos calcular el saldo.',
    ])
    expect(figure(card('Ahorro'), 'Aportes a ahorro del mes')[0]).toBe('COP 500.000')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('los iconos solo acompañan: están ocultos a tecnologías de apoyo', () => {
    renderPanel()

    const icons = block().querySelectorAll('svg')
    expect(icons).toHaveLength(2)
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('nunca dice «Total ahorrado», «Ahorrado» ni «Dinero disponible»', () => {
    renderPanel()

    const text = block().textContent ?? ''
    for (const forbidden of ['Total ahorrado', 'Ahorrado', 'ahorrado', 'Dinero disponible']) {
      expect(text).not.toContain(forbidden)
    }
  })
})
