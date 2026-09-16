import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Table } from '@tanstack/react-table'

import type { Tables } from '@/types/database.types'

import { ColumnVisibilityMenu } from './column-visibility-menu'

function fakeTable(toggle = vi.fn()) {
  const column = (id: string, label: string, canHide: boolean) => ({
    id,
    columnDef: { meta: { label } },
    getCanHide: () => canHide,
    getIsVisible: () => false,
    getToggleVisibilityHandler: () => toggle,
  })

  return {
    getAllLeafColumns: () => [
      column('runningBalance', 'Saldo acumulado', true),
      column('actions', 'Acciones', false),
    ],
  } as unknown as Table<Tables<'transactions'>>
}

function renderMenu(toggle = vi.fn()) {
  render(
    <div>
      <ColumnVisibilityMenu table={fakeTable(toggle)} />
      <button type="button">Exportar CSV</button>
    </div>,
  )

  const summary = screen.getByText('Columnas')
  return { summary, details: summary.closest('details') as HTMLDetailsElement }
}

describe('ColumnVisibilityMenu', () => {
  it('solo ofrece las columnas que se pueden ocultar', () => {
    renderMenu()

    expect(screen.getByLabelText('Saldo acumulado')).toBeInTheDocument()
    expect(screen.queryByLabelText('Acciones')).not.toBeInTheDocument()
  })

  it('se cierra con Escape y devuelve el foco al botón', async () => {
    const user = userEvent.setup()
    const { summary, details } = renderMenu()

    await user.click(summary)
    expect(details.open).toBe(true)

    await user.keyboard('{Escape}')

    expect(details.open).toBe(false)
    expect(summary).toHaveFocus()
  })

  it('se cierra al tocar fuera', async () => {
    const user = userEvent.setup()
    const { summary, details } = renderMenu()

    await user.click(summary)
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }))

    expect(details.open).toBe(false)
  })

  it('sigue abierto al marcar una columna', async () => {
    const user = userEvent.setup()
    const toggle = vi.fn()
    const { summary, details } = renderMenu(toggle)

    await user.click(summary)
    await user.click(screen.getByLabelText('Saldo acumulado'))

    expect(toggle).toHaveBeenCalled()
    expect(details.open).toBe(true)
  })

  it('en pantalla estrecha el panel se ancla a la izquierda del botón', () => {
    const { details } = renderMenu()
    const panel = details.querySelector('div')

    // Comprobación indirecta, que es la que jsdom permite: sin layout real no
    // se puede medir el recorte. `left-0` es lo que impide que los 16 rem del
    // panel se salgan por el borde izquierdo cuando el botón está a la
    // izquierda, y `sm:right-0` mantiene el anclaje de escritorio.
    expect(panel?.className).toContain('left-0')
    expect(panel?.className).toContain('sm:right-0')
    expect(panel?.className).toContain('max-w-[calc(100vw-2rem)]')
  })
})
