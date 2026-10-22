import { render } from '@testing-library/react'
import { expect, it } from 'vitest'

import { axeViolations } from './axe'

it('axe detecta infracciones reales en jsdom (control negativo)', async () => {
  const { container } = render(
    <main>
      <img src="x.png" />
      <button type="button" />
      <input type="text" />
    </main>,
  )
  const ids = (await axeViolations(container)).map((line) => line.split(':')[0])
  expect(ids).toEqual(expect.arrayContaining(['image-alt', 'button-name', 'label']))
})
