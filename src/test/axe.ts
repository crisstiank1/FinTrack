import axe from 'axe-core'

/**
 * Ejecuta axe-core sobre un contenedor y devuelve las infracciones en un
 * formato legible para `expect(...).toEqual([])`.
 *
 * `color-contrast` va desactivada: jsdom no calcula estilos, así que el
 * contraste se verifica aparte con los tokens de `src/index.css`
 * (`docs/accesibilidad.md`).
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const result = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  })
  return result.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  )
}
