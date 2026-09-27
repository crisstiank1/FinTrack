import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Tables } from '@/types/database.types'

import { RecurringTemplatesSection } from './recurring-templates-section'

const templates = vi.fn()
const setActive = vi.fn()

vi.mock('../hooks', () => ({
  useRecurringTemplates: () => templates(),
  useSetTemplateActive: () => ({ mutateAsync: setActive, isPending: false }),
  useDeleteTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const accounts = [
  { id: 'acc-cop', name: 'Banco', currency_code: 'COP', is_archived: false },
  { id: 'acc-usd', name: 'Dólares', currency_code: 'USD', is_archived: true },
] as Tables<'accounts'>[]
const categories = [
  { id: 'cat', name: 'Arriendo', type: 'expense', is_archived: false },
] as Tables<'categories'>[]

const base = {
  user_id: 'u',
  category_id: 'cat',
  type: 'expense',
  is_active: true,
  created_at: '',
  updated_at: '',
}

beforeEach(() => {
  setActive.mockReset()
})

describe('RecurringTemplatesSection', () => {
  it('muestra cada monto en la moneda de su cuenta y avisa de la cuenta archivada', () => {
    templates.mockReturnValue({
      data: [
        {
          ...base,
          id: 't1',
          account_id: 'acc-cop',
          amount_minor: 1500000,
          description: 'Arriendo',
          day_of_month: 31,
        },
        {
          ...base,
          id: 't2',
          account_id: 'acc-usd',
          amount_minor: 4599,
          description: 'Suscripción',
          day_of_month: 5,
        },
      ],
    })
    render(<RecurringTemplatesSection accounts={accounts} categories={categories} />)

    expect(screen.getByText(/COP 1\.500\.000/)).toBeInTheDocument()
    expect(screen.getByText(/USD 45,99/)).toBeInTheDocument()
    expect(screen.getByText('Cuenta archivada: no se proyecta')).toBeInTheDocument()
  })

  it('permite desactivar una plantilla', () => {
    templates.mockReturnValue({
      data: [
        {
          ...base,
          id: 't1',
          account_id: 'acc-cop',
          amount_minor: 1,
          description: 'A',
          day_of_month: 1,
        },
      ],
    })
    render(<RecurringTemplatesSection accounts={accounts} categories={categories} />)

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }))
    expect(setActive).toHaveBeenCalledWith({ id: 't1', isActive: false })
  })

  it('sin plantillas explica cómo crearlas', () => {
    templates.mockReturnValue({ data: [] })
    render(<RecurringTemplatesSection accounts={accounts} categories={categories} />)
    expect(screen.getByText(/Marca «Repetir cada mes»/)).toBeInTheDocument()
  })

  it('mientras carga no dice que no hay plantillas', () => {
    templates.mockReturnValue({ data: undefined, isPending: true, isError: false })
    render(<RecurringTemplatesSection accounts={accounts} categories={categories} />)
    expect(screen.getByText('Cargando movimientos recurrentes...')).toBeInTheDocument()
    expect(screen.queryByText(/Aún no tienes/)).not.toBeInTheDocument()
  })

  it('si la consulta falla lo dice en vez de mostrar el estado vacío', () => {
    templates.mockReturnValue({ data: undefined, isPending: false, isError: true })
    render(<RecurringTemplatesSection accounts={accounts} categories={categories} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/No se pudieron cargar/)
    expect(screen.queryByText(/Aún no tienes/)).not.toBeInTheDocument()
  })
})
