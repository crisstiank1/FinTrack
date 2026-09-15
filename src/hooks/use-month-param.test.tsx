import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMonthParam, useOptionalMonthParam } from './use-month-param'

/** Hoy es 12 de septiembre de 2026: el mes actual es 2026-09. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 12))
})

afterEach(() => {
  vi.useRealTimers()
})

function wrapperAt(url: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
  }
}

/** El hook junto a la URL y el tipo de la última navegación, para comprobar lo que escribe. */
function renderWithLocation<T>(useHook: () => T, url: string) {
  return renderHook(
    () => ({ value: useHook(), location: useLocation(), navigationType: useNavigationType() }),
    { wrapper: wrapperAt(url) },
  )
}

describe('useMonthParam', () => {
  it('lee un mes YYYY-MM válido', () => {
    const { result } = renderWithLocation(useMonthParam, '/budgets?month=2026-08')

    expect(result.current.value[0]).toBe('2026-08')
  })

  it.each([
    '/budgets',
    '/budgets?month=',
    '/budgets?month=2026-13',
    '/budgets?month=2026-9',
    '/budgets?month=abc',
  ])('%s cae al mes actual sin reescribir la URL', (url) => {
    const { result } = renderWithLocation(useMonthParam, url)

    expect(result.current.value[0]).toBe('2026-09')
    expect(`${result.current.location.pathname}${result.current.location.search}`).toBe(url)
  })

  it('al escribir reemplaza la entrada del historial y conserva otros parámetros', () => {
    const { result } = renderWithLocation(useMonthParam, '/budgets?month=2026-08&x=1')

    act(() => result.current.value[1]('2026-07'))

    const params = new URLSearchParams(result.current.location.search)
    expect(params.get('month')).toBe('2026-07')
    expect(params.get('x')).toBe('1')
    expect(result.current.navigationType).toBe('REPLACE')
    expect(result.current.value[0]).toBe('2026-07')
  })
})

describe('useOptionalMonthParam', () => {
  it('lee un mes YYYY-MM válido', () => {
    const { result } = renderWithLocation(useOptionalMonthParam, '/transactions?month=2026-08')

    expect(result.current.value[0]).toBe('2026-08')
  })

  it('sin parámetro abre el mes actual', () => {
    const { result } = renderWithLocation(useOptionalMonthParam, '/transactions')

    expect(result.current.value[0]).toBe('2026-09')
    expect(result.current.location.search).toBe('')
  })

  it('con un parámetro inválido abre el mes actual sin reescribir la URL', () => {
    const { result } = renderWithLocation(useOptionalMonthParam, '/transactions?month=2026-13')

    expect(result.current.value[0]).toBe('2026-09')
    expect(result.current.location.search).toBe('?month=2026-13')
  })

  it('?month= presente y vacío significa todos los meses, distinto de ausente', () => {
    const { result } = renderWithLocation(useOptionalMonthParam, '/transactions?month=')

    expect(result.current.value[0]).toBeUndefined()
  })

  it('vaciar el mes escribe ?month= vacío, que sobrevive como «todos»', () => {
    const { result } = renderWithLocation(useOptionalMonthParam, '/transactions?month=2026-08&x=1')

    act(() => result.current.value[1](undefined))

    const params = new URLSearchParams(result.current.location.search)
    expect(params.has('month')).toBe(true)
    expect(params.get('month')).toBe('')
    expect(params.get('x')).toBe('1')
    expect(result.current.value[0]).toBeUndefined()
    expect(result.current.navigationType).toBe('REPLACE')
  })

  it('elegir un mes después de vaciarlo vuelve a acotar', () => {
    const { result } = renderWithLocation(useOptionalMonthParam, '/transactions?month=')

    act(() => result.current.value[1]('2026-05'))

    expect(result.current.value[0]).toBe('2026-05')
    expect(result.current.location.search).toBe('?month=2026-05')
  })
})
