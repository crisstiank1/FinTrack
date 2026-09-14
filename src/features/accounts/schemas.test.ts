import { describe, expect, it } from 'vitest'

import { draftAccountSchema } from '@/features/onboarding/schemas'

import { ACCOUNT_TYPES, accountSchema, accountTypeOptions } from './schemas'

const validAccount = {
  name: 'Cuenta de prueba',
  type: 'cash',
  initialBalance: 0,
  currencyCode: 'COP',
  icon: 'wallet',
  color: '#E83E8C',
}

const validDraft = {
  name: 'Cuenta de prueba',
  type: 'cash',
  initialBalance: 0,
  currencyCode: 'COP',
}

describe('accountSchema — tipo', () => {
  it('acepta investment', () => {
    expect(accountSchema.safeParse({ ...validAccount, type: 'investment' })).toMatchObject({
      success: true,
      data: { type: 'investment' },
    })
  })

  it('sigue aceptando los tipos anteriores', () => {
    for (const type of ['cash', 'checking', 'savings', 'digital_wallet', 'credit_card']) {
      expect(accountSchema.safeParse({ ...validAccount, type }).success).toBe(true)
    }
  })

  it('rechaza un tipo inventado', () => {
    expect(accountSchema.safeParse({ ...validAccount, type: 'credit' }).success).toBe(false)
  })
})

describe('accountSchema — moneda', () => {
  it('acepta las monedas del catálogo seleccionable', () => {
    for (const currencyCode of ['COP', 'USD', 'ARS']) {
      expect(accountSchema.safeParse({ ...validAccount, currencyCode }).success).toBe(true)
    }
  })

  it('acepta EUR al editar una cuenta heredada', () => {
    expect(accountSchema.safeParse({ ...validAccount, currencyCode: 'EUR' })).toMatchObject({
      success: true,
      data: { currencyCode: 'EUR' },
    })
  })

  it('rechaza una moneda desconocida', () => {
    expect(accountSchema.safeParse({ ...validAccount, currencyCode: 'PEN' })).toMatchObject({
      success: false,
      error: expect.anything(),
    })
  })
})

describe('draftAccountSchema — tipo', () => {
  it('acepta investment', () => {
    expect(draftAccountSchema.safeParse({ ...validDraft, type: 'investment' })).toMatchObject({
      success: true,
      data: { type: 'investment' },
    })
  })

  it('rechaza un tipo inventado', () => {
    expect(draftAccountSchema.safeParse({ ...validDraft, type: 'credit' }).success).toBe(false)
  })

  it('admite exactamente los mismos tipos que accountSchema', () => {
    expect(draftAccountSchema.shape.type.options).toEqual(accountSchema.shape.type.options)
  })
})

describe('draftAccountSchema — moneda por cuenta', () => {
  it('acepta una moneda elegida por cuenta (COP, USD o ARS)', () => {
    for (const currencyCode of ['COP', 'USD', 'ARS']) {
      expect(draftAccountSchema.safeParse({ ...validDraft, currencyCode }).success).toBe(true)
    }
  })

  it('rechaza una moneda fuera del onboarding (EUR)', () => {
    expect(draftAccountSchema.safeParse({ ...validDraft, currencyCode: 'EUR' }).success).toBe(false)
  })

  it('rechaza una moneda desconocida', () => {
    expect(draftAccountSchema.safeParse({ ...validDraft, currencyCode: 'PEN' }).success).toBe(false)
  })

  it('las monedas del onboarding son exactamente las seleccionables', () => {
    expect(draftAccountSchema.shape.currencyCode.options).toEqual(['COP', 'USD', 'ARS'])
  })
})

describe('accountTypeOptions', () => {
  it('tiene una opción con etiqueta por cada tipo del enum, en el mismo orden', () => {
    expect(accountTypeOptions.map((option) => option.value)).toEqual([...ACCOUNT_TYPES])
    expect(accountSchema.shape.type.options).toEqual([...ACCOUNT_TYPES])
    for (const option of accountTypeOptions) {
      expect(option.label.trim()).not.toBe('')
    }
  })

  it('etiqueta investment como «Cuenta de inversión» y conserva las etiquetas anteriores', () => {
    expect(accountTypeOptions).toEqual([
      { value: 'cash', label: 'Efectivo' },
      { value: 'checking', label: 'Cuenta corriente' },
      { value: 'savings', label: 'Cuenta de ahorros' },
      { value: 'digital_wallet', label: 'Billetera digital' },
      { value: 'credit_card', label: 'Tarjeta de crédito' },
      { value: 'investment', label: 'Cuenta de inversión' },
    ])
  })
})
