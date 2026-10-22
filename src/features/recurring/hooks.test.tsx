import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCreateTemplateAfterMovement } from './hooks'

const createRecurringTemplate = vi.fn()
const toastError = vi.fn()
const toastSuccess = vi.fn()

vi.mock('./api', () => ({
  createRecurringTemplate: (...args: unknown[]) => createRecurringTemplate(...args),
  fetchProfileTimeZone: vi.fn(),
  fetchProjections: vi.fn(),
  fetchRecurringTemplates: vi.fn(),
  projectRecurringTemplates: vi.fn(),
}))
vi.mock('@/features/auth/auth-provider', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}))

const movement = {
  type: 'expense' as const,
  accountId: 'acc',
  categoryId: 'cat',
  amount: 1500000,
  transactionDate: '2026-09-30',
  description: 'Arriendo',
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

beforeEach(() => {
  createRecurringTemplate.mockReset()
  toastError.mockReset()
  toastSuccess.mockReset()
})

describe('useCreateTemplateAfterMovement', () => {
  it('crea la plantilla con el usuario de la sesión', async () => {
    createRecurringTemplate.mockResolvedValue({ id: 't1' })
    const { result } = renderHook(() => useCreateTemplateAfterMovement(), { wrapper })

    expect(await result.current(movement)).toBe(true)
    expect(createRecurringTemplate).toHaveBeenCalledWith({
      user_id: 'user-1',
      type: 'expense',
      account_id: 'acc',
      category_id: 'cat',
      amount_minor: 1500000,
      description: 'Arriendo',
      day_of_month: 30,
    })
  })

  it('si falla, lo dice sin ocultarlo y el reintento solo crea la plantilla', async () => {
    createRecurringTemplate.mockRejectedValueOnce(new Error('red caída')).mockResolvedValue({})
    const { result } = renderHook(() => useCreateTemplateAfterMovement(), { wrapper })

    expect(await result.current(movement)).toBe(false)
    expect(toastError).toHaveBeenCalledTimes(1)
    const [title, options] = toastError.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ]
    expect(title).toMatch(/El movimiento se registró, pero no se pudo programar su repetición/)
    expect(options.action.label).toBe('Reintentar')

    options.action.onClick()
    await vi.waitFor(() => expect(createRecurringTemplate).toHaveBeenCalledTimes(2))
    expect(toastSuccess).toHaveBeenCalled()
  })
})
