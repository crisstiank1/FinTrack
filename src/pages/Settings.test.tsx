import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ClassificationError } from '@/features/categories/classifications/errors'
import { PAGE_HELP } from '@/components/shared/page-help'
import type { Tables } from '@/types/database.types'

import Settings from './Settings'

const useCategories = vi.fn()
const useCategoryClassifications = vi.fn()
const createClassification = vi.fn()
const updateClassification = vi.fn()
const deleteClassification = vi.fn()
const usePrimaryCurrency = vi.fn()
const updatePrimaryCurrency = vi.fn()
const useDisplayName = vi.fn()
const updateDisplayName = vi.fn()
const useAccounts = vi.fn()
const toastError = vi.fn()
const toastSuccess = vi.fn()

vi.mock('@/features/categories/hooks', () => ({
  useCategories: () => useCategories(),
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

vi.mock('@/features/categories/classifications/hooks', () => ({
  useCategoryClassifications: () => useCategoryClassifications(),
  useCreateCategoryClassification: () => ({ mutateAsync: createClassification, isPending: false }),
  useUpdateCategoryClassification: () => ({ mutateAsync: updateClassification, isPending: false }),
  useDeleteCategoryClassification: () => ({ mutateAsync: deleteClassification, isPending: false }),
}))

vi.mock('@/features/profile/hooks', () => ({
  usePrimaryCurrency: () => usePrimaryCurrency(),
  useUpdatePrimaryCurrency: () => ({ mutateAsync: updatePrimaryCurrency, isPending: false }),
  useDisplayName: () => useDisplayName(),
  useUpdateDisplayName: () => ({ mutateAsync: updateDisplayName, isPending: false }),
}))

vi.mock('@/features/accounts/hooks', () => ({
  useAccounts: () => useAccounts(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}))

const CAT_VIVIENDA = 'cat-vivienda'
const CAT_RESTAURANTES = 'cat-restaurantes'
const CAT_GIMNASIO = 'cat-gimnasio'
const CAT_SALARIO = 'cat-salario'

const categories = [
  { id: CAT_VIVIENDA, name: 'Vivienda', type: 'expense', is_archived: false },
  { id: CAT_RESTAURANTES, name: 'Restaurantes', type: 'expense', is_archived: false },
  { id: CAT_GIMNASIO, name: 'Gimnasio', type: 'expense', is_archived: true },
  { id: CAT_SALARIO, name: 'Salario', type: 'income', is_archived: false },
] as Tables<'categories'>[]

const classifications = [
  { id: 'cls-1', category_id: CAT_VIVIENDA, budget_group: 'needs' },
] as Tables<'category_classifications'>[]

function renderSettings() {
  return render(<Settings />)
}

/** El panel de clasificación, para no confundirlo con la lista de categorías. */
function panel(): HTMLElement {
  return screen.getByRole('region', { name: 'Clasificación de gastos' })
}

/** El bloque del panel cuyo encabezado coincide con `title`. */
function block(title: string | RegExp): HTMLElement {
  const heading = screen.getByRole('heading', { name: title, level: 3 })
  const list = screen.queryByRole('list', { name: title })
  if (list) return list

  const container = heading.parentElement
  if (!container) throw new Error(`Sin contenedor para el bloque ${String(title)}`)
  return container
}

/** La fila de una categoría dentro de un bloque. */
function row(title: string | RegExp, categoryName: string): HTMLElement {
  const item = within(block(title)).getByText(categoryName).closest('li')
  if (!item) throw new Error(`Sin fila para ${categoryName}`)
  return item
}

beforeEach(() => {
  useCategories.mockReturnValue({ data: categories, isLoading: false })
  useCategoryClassifications.mockReturnValue({ data: classifications })
  createClassification.mockReset()
  createClassification.mockResolvedValue(undefined)
  updateClassification.mockReset()
  updateClassification.mockResolvedValue(undefined)
  deleteClassification.mockReset()
  deleteClassification.mockResolvedValue(undefined)
  usePrimaryCurrency.mockReset()
  usePrimaryCurrency.mockReturnValue({ data: 'COP', isPending: false })
  updatePrimaryCurrency.mockReset()
  updatePrimaryCurrency.mockResolvedValue(undefined)
  useDisplayName.mockReset()
  useDisplayName.mockReturnValue({ data: 'Cristian', isPending: false })
  updateDisplayName.mockReset()
  updateDisplayName.mockResolvedValue(undefined)
  useAccounts.mockReset()
  useAccounts.mockReturnValue({ data: [] })
  toastError.mockClear()
  toastSuccess.mockClear()
})

describe('Settings — clasificación de gastos', () => {
  it('muestra el panel con su propio título', () => {
    renderSettings()

    expect(
      screen.getByRole('heading', { name: 'Clasificación de gastos', level: 2 }),
    ).toBeInTheDocument()
  })

  it('no preselecciona ningún grupo en una categoría sin clasificar', () => {
    renderSettings()

    const restaurantes = row('Sin clasificar', 'Restaurantes')

    for (const grupo of ['Necesidades', 'Deseos', 'Deuda']) {
      expect(within(restaurantes).getByRole('button', { name: grupo })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    }
  })

  it('marca el grupo actual de una categoría ya clasificada', () => {
    renderSettings()

    const vivienda = row('Clasificadas', 'Vivienda')

    expect(within(vivienda).getByRole('button', { name: 'Necesidades' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(vivienda).getByRole('button', { name: 'Deseos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('clasificar envía la categoría y el grupo elegidos', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(
      within(row('Sin clasificar', 'Restaurantes')).getByRole('button', {
        name: 'Deseos',
      }),
    )

    await waitFor(() => expect(createClassification).toHaveBeenCalled())
    expect(createClassification).toHaveBeenCalledWith({
      categoryId: CAT_RESTAURANTES,
      group: 'wants',
    })
    expect(toastSuccess).toHaveBeenCalled()
  })

  it('cambiar de grupo no pide confirmación y envía la clasificación, no la categoría', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(within(row('Clasificadas', 'Vivienda')).getByRole('button', { name: 'Deuda' }))

    await waitFor(() => expect(updateClassification).toHaveBeenCalled())
    expect(updateClassification).toHaveBeenCalledWith({
      classificationId: 'cls-1',
      group: 'debt',
    })
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('volver a pulsar el grupo actual no escribe nada', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(
      within(row('Clasificadas', 'Vivienda')).getByRole('button', { name: 'Necesidades' }),
    )

    expect(updateClassification).not.toHaveBeenCalled()
    expect(createClassification).not.toHaveBeenCalled()
  })

  it('quitar la clasificación pide confirmación antes de tocar nada', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(
      within(row('Clasificadas', 'Vivienda')).getByRole('button', {
        name: 'Quitar la clasificación de Vivienda',
      }),
    )

    expect(deleteClassification).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Quitar' }))

    await waitFor(() => expect(deleteClassification).toHaveBeenCalledWith('cls-1'))
  })

  it('una categoría archivada sin clasificación no se puede clasificar', () => {
    renderSettings()

    // Sigue existiendo como categoría —aparece en la lista de arriba—, pero el
    // panel no la ofrece: el trigger rechazaría estrenar su clasificación.
    expect(screen.getByText('Gimnasio')).toBeInTheDocument()
    expect(within(panel()).queryByText('Gimnasio')).not.toBeInTheDocument()
  })

  it('una categoría archivada con clasificación sigue visible y editable', async () => {
    const user = userEvent.setup()
    useCategoryClassifications.mockReturnValue({
      data: [
        ...classifications,
        { id: 'cls-9', category_id: CAT_GIMNASIO, budget_group: 'wants' },
      ] as Tables<'category_classifications'>[],
    })
    renderSettings()

    const gimnasio = row(/Archivadas con clasificación/, 'Gimnasio')

    expect(within(gimnasio).getByText('Archivada')).toBeInTheDocument()
    expect(within(gimnasio).getByRole('button', { name: 'Deseos' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(within(gimnasio).getByRole('button', { name: 'Necesidades' }))

    await waitFor(() => expect(updateClassification).toHaveBeenCalled())
    expect(updateClassification).toHaveBeenCalledWith({
      classificationId: 'cls-9',
      group: 'needs',
    })
  })

  it('una categoría de ingreso sin clasificar no aparece en el panel', () => {
    renderSettings()

    // «Salario» sigue en la lista de categorías de arriba, pero no en el panel.
    expect(screen.queryByRole('button', { name: /Quitar la clasificación de Salario/ })).toBeNull()
    expect(within(panel()).queryByText('Salario')).not.toBeInTheDocument()
  })

  it('sin categorías de gasto lo dice, en vez de mostrar bloques vacíos', () => {
    useCategories.mockReturnValue({
      data: [categories[3]] as Tables<'categories'>[],
      isLoading: false,
    })
    useCategoryClassifications.mockReturnValue({ data: [] })
    renderSettings()

    expect(screen.getByText(/Todavía no tienes categorías de gasto/)).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Clasificadas', level: 3 }),
    ).not.toBeInTheDocument()
  })

  it('un conflicto se muestra y no se cuenta como éxito', async () => {
    const user = userEvent.setup()
    createClassification.mockRejectedValue(new ClassificationError('already_classified'))
    renderSettings()

    await user.click(
      within(row('Sin clasificar', 'Restaurantes')).getByRole('button', { name: 'Deseos' }),
    )

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastSuccess).not.toHaveBeenCalled()

    const [fallback, options] = toastError.mock.calls[0] as [string, { description?: string }]
    expect(`${fallback} ${options.description ?? ''}`).not.toMatch(
      /23505|P0001|PGRST|constraint|_key|_fkey|uuid/i,
    )
  })

  it('no ofrece ninguna acción de clasificación masiva o automática', () => {
    renderSettings()

    for (const prohibido of [/sugerencia/i, /autom/i, /clasificar todo/i, /aplicar a todas/i]) {
      expect(screen.queryByText(prohibido)).not.toBeInTheDocument()
    }
  })
})

describe('Settings — moneda principal (M12)', () => {
  it('muestra seleccionada la moneda actual del perfil', () => {
    renderSettings()

    expect(screen.getByLabelText('Moneda principal')).toHaveValue('COP')
  })

  it('elegir otra moneda abre la confirmación y no aplica todavía', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.selectOptions(screen.getByLabelText('Moneda principal'), 'USD')

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(updatePrimaryCurrency).not.toHaveBeenCalled()
  })

  it('confirmar aplica el cambio y avisa', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.selectOptions(screen.getByLabelText('Moneda principal'), 'USD')
    await user.click(screen.getByRole('button', { name: 'Cambiar moneda' }))

    await waitFor(() => expect(updatePrimaryCurrency).toHaveBeenCalledWith('USD'))
    expect(toastSuccess).toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cancelar deja la moneda en su sitio', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.selectOptions(screen.getByLabelText('Moneda principal'), 'USD')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(updatePrimaryCurrency).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Moneda principal')).toHaveValue('COP')
  })

  it('avisa de las cuentas que conservarán la moneda actual', async () => {
    const user = userEvent.setup()
    useAccounts.mockReturnValue({ data: [{ id: 'acc-1', currency_code: 'COP' }] })
    renderSettings()

    await user.selectOptions(screen.getByLabelText('Moneda principal'), 'USD')

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/Tienes 1 cuenta en COP/)).toBeInTheDocument()
    expect(within(dialog).getByText(/conservarán su moneda/)).toBeInTheDocument()
  })

  it('sin cuentas en la moneda actual no hay advertencia', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.selectOptions(screen.getByLabelText('Moneda principal'), 'USD')

    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByText(/Ninguna cuenta cambia de moneda/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/conservarán su moneda/)).not.toBeInTheDocument()
  })

  it('un fallo al guardar se muestra y no se cuenta como éxito', async () => {
    const user = userEvent.setup()
    updatePrimaryCurrency.mockRejectedValue(new Error('boom'))
    renderSettings()

    await user.selectOptions(screen.getByLabelText('Moneda principal'), 'USD')
    await user.click(screen.getByRole('button', { name: 'Cambiar moneda' }))

    await waitFor(() => expect(toastError).toHaveBeenCalled())
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})

describe('Settings — perfil (M16)', () => {
  it('muestra la sección Perfil antes de Moneda principal, con el nombre actual', () => {
    renderSettings()

    const perfil = screen.getByRole('heading', { name: 'Perfil', level: 2 })
    const moneda = screen.getByRole('heading', { name: 'Moneda principal', level: 2 })
    expect(perfil.compareDocumentPosition(moneda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Cristian')
  })

  it('sin nombre guardado el campo empieza vacío', () => {
    useDisplayName.mockReturnValue({ data: null, isPending: false })
    renderSettings()

    expect(screen.getByLabelText('Nombre')).toHaveValue('')
  })

  it('guardar envía el nombre nuevo y avisa', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'Cris')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(updateDisplayName).toHaveBeenCalledWith('Cris'))
    expect(toastSuccess).toHaveBeenCalledWith('Nombre actualizado')
  })

  it('un nombre vacío no se guarda y dice por qué', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.clear(screen.getByLabelText('Nombre'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Ingresa tu nombre')).toBeInTheDocument()
    expect(updateDisplayName).not.toHaveBeenCalled()
  })

  it('más de 60 caracteres no se guarda', async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.clear(screen.getByLabelText('Nombre'))
    await user.type(screen.getByLabelText('Nombre'), 'a'.repeat(61))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Máximo 60 caracteres')).toBeInTheDocument()
    expect(updateDisplayName).not.toHaveBeenCalled()
  })

  it('un fallo al guardar se muestra y no se cuenta como éxito', async () => {
    const user = userEvent.setup()
    updateDisplayName.mockRejectedValue(new Error('sin conexión'))
    renderSettings()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('No se pudo guardar el nombre', {
        description: 'sin conexión',
      }),
    )
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('mientras carga el perfil no muestra un campo vacío que invite a sobrescribir', () => {
    useDisplayName.mockReturnValue({ data: undefined, isPending: true })
    renderSettings()

    expect(screen.getByText('Cargando perfil...')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nombre')).not.toBeInTheDocument()
  })
})

describe('Settings — ayuda de la pantalla (M18)', () => {
  it('el «?» junto al título explica la pantalla', async () => {
    renderSettings()

    fireEvent.click(await screen.findByRole('button', { name: 'Ayuda: Ajustes' }))

    expect(screen.getByRole('region', { name: 'Ajustes' })).toHaveTextContent(PAGE_HELP.settings)
  })
})
