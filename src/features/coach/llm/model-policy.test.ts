import { describe, expect, it } from 'vitest'

import { isAllowedCoachModel } from './model-policy'

describe('isAllowedCoachModel', () => {
  it.each(['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'])(
    'admite %s',
    (model) => {
      expect(isAllowedCoachModel(model)).toBe(true)
    },
  )

  it.each([
    'gemini-3.1-flash-lite-preview',
    'gemini-2.5-flash-preview-05-20',
    'gemini-flash-latest',
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-experimental',
    'gemini-2.5-flash-image',
    'imagen-4.0-generate-001',
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-flash-native-audio-dialog',
    'gemini-live-2.5-flash',
    '',
    ' gemini-2.5-flash',
  ])('rechaza %s', (model) => {
    expect(isAllowedCoachModel(model)).toBe(false)
  })
})
