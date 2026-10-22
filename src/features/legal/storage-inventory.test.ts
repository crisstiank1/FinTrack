import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Guardia de la página /cookies: su tabla dice que FinTrack solo usa la sesión
 * de Supabase y el tema. Si alguien añade un rastreador, una cookie o una clave
 * de almacenamiento, esta prueba falla y obliga a actualizar la página y el
 * registro de riesgos en el mismo cambio.
 */

const ROOT = process.cwd()

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx|html|css)$/.test(entry) &&
      !/\.test\.tsx?$/.test(entry) &&
      !path.includes('/src/test/')
      ? [path]
      : []
  })
}

const files = [...sources(join(ROOT, 'src')), join(ROOT, 'index.html')]
const code = files.map((path) => ({ path, text: readFileSync(path, 'utf8') }))

describe('inventario de almacenamiento y terceros', () => {
  it('no carga analítica, publicidad ni seguimiento', () => {
    const trackers =
      /googletagmanager|google-analytics|gtag\(|fbq\(|connect\.facebook|hotjar|posthog|@sentry|mixpanel|segment\.com|clarity\.ms|plausible|cloudflareinsights/i
    expect(code.filter(({ text }) => trackers.test(text)).map(({ path }) => path)).toEqual([])
  })

  it('no escribe cookies propias', () => {
    expect(code.filter(({ text }) => /document\.cookie/.test(text))).toEqual([])
  })

  it('solo index.html usa localStorage directamente, y para el tema', () => {
    const users = code
      .filter(({ text }) => /\b(localStorage|sessionStorage)\b/.test(text))
      .map(({ path }) => path.replace(ROOT, ''))
    expect(users).toEqual(['/index.html'])
    const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
    expect(html.match(/localStorage\.\w+\('([^']+)'/g)).toEqual([
      "localStorage.getItem('fintrack-theme'",
      "localStorage.setItem('fintrack-theme'",
    ])
  })

  it('no carga scripts ni hojas de estilo de dominios externos', () => {
    const external = /<script[^>]+src="https?:|<link[^>]+href="https?:|@import\s+url\(["']?https?:/i
    expect(code.filter(({ text }) => external.test(text)).map(({ path }) => path)).toEqual([])
  })
})
