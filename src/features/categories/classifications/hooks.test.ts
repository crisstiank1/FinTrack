import { describe, expect, it } from 'vitest'

import { categoryClassificationsQueryKey } from './hooks'

/**
 * Solo la factory de claves. Los hooks en sí se ejercitan desde las pruebas de
 * las pantallas que los montan, que es donde su comportamiento se puede
 * observar; lo que se comprueba aquí es el contrato del que depende cualquiera
 * que invalide este recurso.
 */
describe('categoryClassificationsQueryKey', () => {
  it('la raíz identifica el recurso sin mencionar al usuario', () => {
    expect(categoryClassificationsQueryKey.all).toEqual(['category-classifications'])
  })

  it('la clave por usuario cuelga de esa misma raíz', () => {
    expect(categoryClassificationsQueryKey.byUser('user-1')).toEqual([
      'category-classifications',
      'user-1',
    ])
  })

  it('la raíz es prefijo de la clave por usuario', () => {
    // Es lo que hace que invalidar por la raíz —el botón de reintento de
    // `/plan`— alcance también a la consulta de un usuario concreto.
    const byUser = categoryClassificationsQueryKey.byUser('user-1')

    expect(byUser.slice(0, categoryClassificationsQueryKey.all.length)).toEqual([
      ...categoryClassificationsQueryKey.all,
    ])
  })

  it('sin usuario la clave sigue siendo distinta de la raíz', () => {
    // Con la sesión aún sin resolver, la consulta está deshabilitada pero su
    // clave no debe colisionar con la del recurso entero.
    expect(categoryClassificationsQueryKey.byUser(undefined)).toEqual([
      'category-classifications',
      undefined,
    ])
    expect(categoryClassificationsQueryKey.byUser(undefined)).not.toEqual(
      categoryClassificationsQueryKey.all,
    )
  })

  it('dos llamadas con el mismo usuario producen la misma clave', () => {
    expect(categoryClassificationsQueryKey.byUser('user-1')).toEqual(
      categoryClassificationsQueryKey.byUser('user-1'),
    )
  })
})
