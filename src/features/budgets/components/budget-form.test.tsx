import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ZERO_BUDGET_WARNING } from '../schemas'
import { BudgetForm } from './budget-form'

const MES_ACTUAL = '2026-09'
const MES_PASADO = '2026-05'

describe('BudgetForm — alcance', () => {
  it('en el mes actual ofrece plantilla y excepción, con la plantilla por defecto', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<BudgetForm monthKey={MES_ACTUAL} allowTemplate onSubmit={onSubmit} />)

    expect(screen.getByRole('radio', { name: /Desde este mes en adelante/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Solo este mes/ })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Monto mensual'), '1.200.000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onSubmit).toHaveBeenCalledWith({ amountMinor: 1_200_000, scope: 'template' })
  })

  it('permite elegir la excepción', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<BudgetForm monthKey={MES_ACTUAL} allowTemplate onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Monto mensual'), '500000')
    await user.click(screen.getByRole('radio', { name: /Solo este mes/ }))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onSubmit).toHaveBeenCalledWith({ amountMinor: 500_000, scope: 'exception' })
  })

  it('en un mes cerrado no ofrece versionar hacia atrás', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<BudgetForm monthKey={MES_PASADO} allowTemplate={false} onSubmit={onSubmit} />)

    expect(
      screen.queryByRole('radio', { name: /Desde este mes en adelante/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Solo este mes/ })).toBeChecked()
    expect(screen.getByText(/ya pasó/)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Monto mensual'), '80000')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onSubmit).toHaveBeenCalledWith({ amountMinor: 80_000, scope: 'exception' })
  })

  it('en modo corrección no hay alcance que elegir', () => {
    render(
      <BudgetForm
        monthKey={MES_PASADO}
        mode="correction"
        allowTemplate={false}
        defaultAmountMinor={90_000}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Monto mensual')).toHaveValue('90000')
  })
})

describe('BudgetForm — monto', () => {
  it('el campo vacío es un error y no envía nada', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<BudgetForm monthKey={MES_ACTUAL} allowTemplate onSubmit={onSubmit} />)

    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Ingresa un monto')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rechaza decimales sin redondear en silencio', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<BudgetForm monthKey={MES_ACTUAL} allowTemplate onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Monto mensual'), '1,5')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(
      await screen.findByText('El monto debe ser un número entero, sin decimales'),
    ).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('advierte antes de guardar un presupuesto de 0, pero lo permite', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<BudgetForm monthKey={MES_ACTUAL} allowTemplate onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText('Monto mensual'), '0')

    expect(await screen.findByText(ZERO_BUDGET_WARNING)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(onSubmit).toHaveBeenCalledWith({ amountMinor: 0, scope: 'template' })
  })

  it('no muestra la advertencia de 0 con un monto normal', async () => {
    const user = userEvent.setup()
    render(<BudgetForm monthKey={MES_ACTUAL} allowTemplate onSubmit={vi.fn()} />)

    await user.type(screen.getByLabelText('Monto mensual'), '1000')

    expect(screen.queryByText(ZERO_BUDGET_WARNING)).not.toBeInTheDocument()
  })
})
