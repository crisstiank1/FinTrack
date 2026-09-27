import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RecurringProjectionBanner } from './recurring-projection-banner'

const status = vi.fn()
const mutateAsync = vi.fn()

vi.mock('../hooks', () => ({
  useRecurringTemplates: () => ({
    data: [
      { id: 't3', description: 'Gimnasio' },
      { id: 't4', description: 'Streaming' },
    ],
  }),
  useRecurringProjectionStatus: () => status(),
  useProjectRecurring: () => ({ mutateAsync, isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderBanner() {
  return render(
    <MemoryRouter>
      <RecurringProjectionBanner />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  status.mockReset()
  mutateAsync.mockReset()
})

describe('RecurringProjectionBanner', () => {
  it('no aparece si no faltan proyecciones', () => {
    status.mockReturnValue({ monthKey: '2026-09', pending: [], ready: true })
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('no aparece mientras carga', () => {
    status.mockReturnValue({ monthKey: '2026-09', pending: [], ready: false })
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('ofrece proyectar las que faltan y aclara que no registra nada', () => {
    status.mockReturnValue({
      monthKey: '2026-09',
      pending: [{ id: 't1' }, { id: 't2' }],
      ready: true,
    })
    renderBanner()
    expect(
      screen.getByRole('button', { name: 'Proyectar 2 movimientos recurrentes de este mes' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/No se registra nada automáticamente/)).toBeInTheDocument()
  })

  it('proyecta el mes del usuario y muestra creados, existentes y omitidos con enlace a Hojas', async () => {
    status.mockReturnValue({ monthKey: '2026-09', pending: [{ id: 't1' }], ready: true })
    mutateAsync.mockResolvedValue({
      month: '2026-09',
      sheet_id: 'sheet-7',
      results: [
        { template_id: 't1', status: 'created', draft_id: 'd1', date: '2026-09-30' },
        { template_id: 't2', status: 'skipped_existing' },
        { template_id: 't3', status: 'skipped_archived_account' },
        { template_id: 't4', status: 'skipped_archived_category' },
      ],
    })
    renderBanner()

    fireEvent.click(screen.getByRole('button', { name: /Proyectar 1 movimiento/ }))

    expect(await screen.findByText(/1 borradores creados, 1 ya existían y 2/)).toBeInTheDocument()
    expect(mutateAsync).toHaveBeenCalledWith('2026-09')

    // Cada omisión dice qué plantilla, por qué y qué hacer.
    const gym = screen.getByText('«Gimnasio»').closest('li')!
    expect(gym).toHaveTextContent('su cuenta está archivada')
    expect(gym).toHaveTextContent(
      'Reactiva la cuenta en Cuentas o desactiva la plantilla en Ajustes.',
    )
    const streaming = screen.getByText('«Streaming»').closest('li')!
    expect(streaming).toHaveTextContent('su categoría está archivada')
    expect(streaming).toHaveTextContent(/Reactiva la categoría en Ajustes/)
    expect(screen.getByRole('link', { name: 'Revisar y registrar en Hojas' })).toHaveAttribute(
      'href',
      '/sheets?sheet=sheet-7',
    )
  })
})
