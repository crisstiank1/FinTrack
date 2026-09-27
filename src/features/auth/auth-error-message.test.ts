import { describe, expect, it } from 'vitest'

import { authErrorMessage } from './auth-error-message'

describe('authErrorMessage', () => {
  it('traduce las credenciales inválidas', () => {
    expect(
      authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }),
    ).toBe('El correo o la contraseña no son correctos.')
  })

  it('nunca muestra el texto crudo en inglés de un error desconocido', () => {
    const message = authErrorMessage({ code: 'unexpected_failure', message: 'Database error' })
    expect(message).not.toContain('Database error')
    expect(message).toMatch(/Inténtalo de nuevo/)
  })

  it('tolera errores sin código', () => {
    expect(authErrorMessage(null)).toMatch(/Inténtalo de nuevo/)
    expect(authErrorMessage(new Error('boom'))).not.toContain('boom')
  })
})
