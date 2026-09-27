import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Tables } from '@/types/database.types'

import CsvImport from './CsvImport'

const createImportSheet = vi.fn()
const fetchExistingMovements = vi.fn()

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

vi.mock('@/features/csv-import/api', () => ({
  createImportSheet: (...args: unknown[]) => createImportSheet(...args),
  fetchExistingMovements: (...args: unknown[]) => fetchExistingMovements(...args),
}))

vi.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

const accounts = [
  { id: 'acc-cop', name: 'Banco', currency_code: 'COP', is_archived: false },
  { id: 'acc-old', name: 'Cuenta vieja', currency_code: 'COP', is_archived: true },
  { id: 'acc-usd', name: 'Cuenta USD', currency_code: 'USD', is_archived: false },
] as Tables<'accounts'>[]

const categories = [
  { id: 'cat-food', name: 'Mercado', type: 'expense', is_archived: false },
  { id: 'cat-old', name: 'Vieja', type: 'expense', is_archived: true },
] as Tables<'categories'>[]

vi.mock('@/features/accounts/hooks', () => ({ useAccounts: () => ({ data: accounts }) }))
vi.mock('@/features/categories/hooks', () => ({ useCategories: () => ({ data: categories }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/import']}>
        <Routes>
          <Route path="/import" element={<CsvImport />} />
          <Route path="/sheets" element={<p>Pantalla de hojas</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function upload(content: string, name = 'extracto.csv') {
  const file = new File([content], name, { type: 'text/csv' })
  fireEvent.change(screen.getByLabelText(/Extracto en CSV/), { target: { files: [file] } })
  await screen.findByText(new RegExp(`${name}: `))
}

function choose(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

const importButton = () => screen.getByRole('button', { name: /Importar \d+ filas/ })

beforeEach(() => {
  createImportSheet.mockReset().mockResolvedValue({ sheetId: 'sheet-9', created: 2 })
  fetchExistingMovements.mockReset().mockResolvedValue([])
})

describe('CsvImport', () => {
  it('avisa de que nada se publica automáticamente', () => {
    renderPage()
    expect(screen.getByText('No se publicarán movimientos automáticamente.')).toBeInTheDocument()
    expect(
      screen.getByText('Podrás revisar y categorizar los movimientos antes de publicarlos.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Las filas con errores no serán importadas hasta que las corrijas.'),
    ).toBeInTheDocument()
  })

  it('muestra el error de un archivo vacío', async () => {
    renderPage()
    const file = new File([''], 'vacio.csv', { type: 'text/csv' })
    fireEvent.change(screen.getByLabelText(/Extracto en CSV/), { target: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo está vacío.')
  })

  it('no ofrece cuentas archivadas', async () => {
    renderPage()
    await upload('Fecha;Concepto;Valor\n25/09/2026;Mercado;-45.000\n')
    const options = Array.from(
      (screen.getByLabelText('Cuenta de FinTrack') as HTMLSelectElement).options,
    ).map((option) => option.textContent)
    expect(options).toContain('Banco (COP)')
    expect(options).not.toContain('Cuenta vieja (COP)')
  })

  it('no ofrece categorías archivadas como categoría por defecto', async () => {
    renderPage()
    await upload('Fecha;Concepto;Valor\n25/09/2026;Mercado;-45.000\n')
    const options = Array.from(
      (screen.getByLabelText(/Categoría para gastos/) as HTMLSelectElement).options,
    ).map((option) => option.textContent)
    expect(options).toContain('Mercado')
    expect(options).not.toContain('Vieja')
  })

  it('una fecha ambigua bloquea la importación hasta confirmar el formato', async () => {
    renderPage()
    await upload('Fecha;Concepto;Valor\n03/04/2026;Mercado;-45.000\n05/06/2026;Nómina;100.000\n')

    choose(/Cuenta de FinTrack/, 'acc-cop')
    choose(/Un monto negativo es/, 'negative_is_expense')
    choose(/Separador decimal/, ',')

    expect(screen.getByText(/encajan en más de un formato/)).toBeInTheDocument()
    expect((screen.getByLabelText('Formato de fecha') as HTMLSelectElement).value).toBe('')
    expect(screen.getByText('Confirma el formato de fecha.')).toBeInTheDocument()
    expect(importButton()).toBeDisabled()

    choose(/Formato de fecha/, 'DMY')
    await waitFor(() => expect(importButton()).toBeEnabled())
    expect(screen.getByText('2026-04-03')).toBeInTheDocument()
  })

  it('importa solo filas válidas como borradores y abre la hoja creada', async () => {
    renderPage()
    await upload(
      'Fecha;Concepto;Valor\n25/09/2026;Mercado;-45.000\n26/09/2026;Nómina;3.500.000\nxx;Café;-8.000\n27/09/2026;Transferencia a ahorros;-100.000\n',
    )

    choose(/Cuenta de FinTrack/, 'acc-cop')
    choose(/Un monto negativo es/, 'negative_is_expense')
    choose(/Separador decimal/, ',')

    await waitFor(() => expect(importButton()).toHaveTextContent('Importar 2 filas'))
    expect(screen.getByText(/2 listas · 1 requieren revisión · 1 con errores/)).toBeInTheDocument()

    fireEvent.click(importButton())
    await screen.findByText('Pantalla de hojas')

    expect(createImportSheet).toHaveBeenCalledTimes(1)
    const [, userId, name, cells] = createImportSheet.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(name).toMatch(/^CSV extracto \(/)
    expect(cells).toEqual([
      expect.objectContaining({
        transaction_date: '2026-09-25',
        type: 'expense',
        amount_minor: '45000',
        account_id: 'acc-cop',
      }),
      expect.objectContaining({ type: 'income', amount_minor: '3500000' }),
    ])
  })

  it('la moneda de la cuenta decide la escala: 45,99 en USD son 4599 centavos', async () => {
    renderPage()
    await upload('Fecha;Concepto;Valor\n25/09/2026;Café;-45,99\n')

    choose(/Cuenta de FinTrack/, 'acc-usd')
    choose(/Un monto negativo es/, 'negative_is_expense')
    choose(/Separador decimal/, ',')

    await waitFor(() => expect(importButton()).toBeEnabled())
    fireEvent.click(importButton())
    await screen.findByText('Pantalla de hojas')

    expect(createImportSheet.mock.calls[0][3]).toEqual([
      expect.objectContaining({ amount_minor: '4599', account_id: 'acc-usd' }),
    ])
  })

  it('cambiar la columna de fecha a una ambigua anula el formato elegido y bloquea', async () => {
    renderPage()
    // «Fecha» es inequívoca (día 25) y se preselecciona DMY; «Valor fecha» es ambigua.
    await upload(
      'Fecha;Valor fecha;Concepto;Valor\n25/09/2026;03/04/2026;Mercado;-45.000\n26/09/2026;05/06/2026;Pan;-2.000\n',
    )
    choose(/Cuenta de FinTrack/, 'acc-cop')
    choose(/Un monto negativo es/, 'negative_is_expense')
    choose(/Separador decimal/, ',')
    expect((screen.getByLabelText('Formato de fecha') as HTMLSelectElement).value).toBe('DMY')

    choose(/^Fecha$/, '1')

    expect((screen.getByLabelText('Formato de fecha') as HTMLSelectElement).value).toBe('')
    expect(screen.getByText(/encajan en más de un formato/)).toBeInTheDocument()
    expect(importButton()).toBeDisabled()
  })
})
