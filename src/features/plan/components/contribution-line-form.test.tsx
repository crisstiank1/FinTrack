import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ContributionLineForm } from './contribution-line-form'

const onSubmit = vi.fn()

const accounts = [
  { id: 'acc-fondo', name: 'Fondo' },
  { id: 'acc-reserva', name: 'Reserva' },
]

function renderForm(props: Partial<Parameters<typeof ContributionLineForm>[0]> = {}) {
  return render(
    <ContributionLineForm kind="savings" accounts={accounts} onSubmit={onSubmit} {...props} />,
  )
}

beforeEach(() => {
  onSubmit.mockReset()
})

describe('ContributionLineForm — alta', () => {
  it('pide nombre, cuenta del tipo e importe planeado', () => {
    renderForm()

    expect(screen.getByLabelText('Nombre')).toHaveAttribute(
      'placeholder',
      'Ej. Fondo de emergencia',
    )
    expect(screen.getByLabelText('Cuenta de ahorro')).toBeInTheDocument()
    expect(screen.getByLabelText('Importe planeado')).toBeInTheDocument()
  })

  it('el nombre nace vacío: no se rellena con el de la cuenta', () => {
    renderForm()

    expect(screen.getByLabelText('Nombre')).toHaveValue('')
  })

  it('el selector ofrece solo las cuentas que recibe', () => {
    renderForm()

    const selector = screen.getByLabelText('Cuenta de ahorro')
    const options = within(selector)
      .getAllByRole('option')
      .map((option) => option.textContent)

    expect(options).toEqual(['Selecciona una cuenta', 'Fondo', 'Reserva'])
  })

  it('en un aporte a inversión el selector dice «Cuenta de inversión»', () => {
    renderForm({ kind: 'investment', accounts: [{ id: 'acc-broker', name: 'Broker' }] })

    expect(screen.getByLabelText('Cuenta de inversión')).toBeInTheDocument()
  })

  it('envía nombre, cuenta e importe como entero', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Nombre'), 'Fondo de emergencia')
    await user.selectOptions(screen.getByLabelText('Cuenta de ahorro'), 'acc-reserva')
    await user.type(screen.getByLabelText('Importe planeado'), '500.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Fondo de emergencia',
      accountId: 'acc-reserva',
      plannedMinor: 500_000,
    })
  })

  it('acepta un importe de 0', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Nombre'), 'Fondo')
    await user.selectOptions(screen.getByLabelText('Cuenta de ahorro'), 'acc-fondo')
    await user.type(screen.getByLabelText('Importe planeado'), '0')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ plannedMinor: 0 }))
  })

  it('no guarda sin cuenta ni con el importe vacío', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Nombre'), 'Fondo')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Elige una cuenta')).toBeInTheDocument()
    expect(screen.getByText('Ingresa un monto')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('no tiene campos de categoría ni de fecha', () => {
    renderForm()

    expect(screen.queryByLabelText(/categoría/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/fecha/i)).not.toBeInTheDocument()
  })
})

describe('ContributionLineForm — edición', () => {
  function renderEdit() {
    return renderForm({
      accounts: [],
      defaultValues: { name: 'Fondo de emergencia', accountId: 'acc-fondo', plannedMinor: 400_000 },
      lockedAccountName: 'Fondo',
      submitLabel: 'Guardar cambios',
    })
  }

  it('la cuenta es fija: se enuncia y no se ofrece selector', () => {
    renderEdit()

    expect(screen.queryByLabelText('Cuenta de ahorro')).not.toBeInTheDocument()
    expect(
      screen.getByText('Cuenta: Fondo. Para cambiarla, elimina el aporte y crea otro.'),
    ).toBeInTheDocument()
  })

  it('carga el nombre y el importe actuales', () => {
    renderEdit()

    expect(screen.getByLabelText('Nombre')).toHaveValue('Fondo de emergencia')
    expect(screen.getByLabelText('Importe planeado')).toHaveValue('400000')
  })

  it('envía el nombre y el importe corregidos, con la misma cuenta', async () => {
    const user = userEvent.setup()
    renderEdit()

    await user.clear(screen.getByLabelText('Importe planeado'))
    await user.type(screen.getByLabelText('Importe planeado'), '0')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Fondo de emergencia',
      accountId: 'acc-fondo',
      plannedMinor: 0,
    })
  })
})
