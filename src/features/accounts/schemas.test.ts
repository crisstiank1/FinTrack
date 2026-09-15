import { describe, expect, it } from 'vitest'

import { draftAccountSchema } from '@/features/onboarding/schemas'

import { ACCOUNT_TYPES, accountSchema, accountTypeOptions } from './schemas'

const validAccount = {
  name: 'Cuenta de prueba',
  initialBalance: 0,
  currencyCode: 'COP',
  icon: 'wallet',
  color: '#E83E8C',
}

const validDraft = { name: 'Cuenta de prueba', initialBalance: 0 }

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
