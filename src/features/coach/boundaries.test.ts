import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Pruebas de frontera del backend del Coach.
 *
 * No comprueban comportamiento sino **ausencias**: que no se haya colado el
 * cliente del navegador, una clave privilegiada o un proveedor de IA. Son las
 * únicas reglas de la Fase 2 que ningún caso de uso puede detectar, porque su
 * síntoma no es una respuesta equivocada sino una fuga.
 */

const COACH_DIR = join(process.cwd(), 'src', 'features', 'coach')
const FUNCTIONS_DIR = join(process.cwd(), 'supabase', 'functions')

function filesIn(dir: string, extensions: string[]): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)

    if (statSync(path).isDirectory()) {
      found.push(...filesIn(path, extensions))
      continue
    }
    if (extensions.some((extension) => entry.endsWith(extension))) found.push(path)
  }

  return found
}

const backendSources = [
  ...filesIn(COACH_DIR, ['.ts']).filter((path) => !path.endsWith('.test.ts')),
  ...filesIn(FUNCTIONS_DIR, ['.ts']),
]

/**
 * Código sin comentarios.
 *
 * Estas reglas son sobre lo que el programa hace, no sobre lo que explica. Un
 * comentario que diga "aquí nunca se usa `service_role`" documenta la regla;
 * hacerlo fallar obligaría a borrar justo la explicación que hace falta.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

describe('frontera del backend del Coach', () => {
  it('encuentra los archivos que debe vigilar', () => {
    expect(backendSources.length).toBeGreaterThanOrEqual(6)
  })

  it('no importa el cliente de Supabase del navegador', () => {
    // `src/lib/supabase.ts` lee variables VITE_ y lanza al cargarse: importarlo
    // rompería la Edge Function y, peor, invitaría a usar un cliente que no
    // lleva el JWT del usuario.
    for (const path of backendSources) {
      expect(code(path)).not.toMatch(/from '[^']*lib\/supabase'/)
    }
  })

  it('no menciona la clave de servicio en ninguna forma', () => {
    for (const path of backendSources) {
      expect(code(path).toLowerCase()).not.toContain('service_role')
    }
  })

  it('no contiene proveedores de IA ni sus claves', () => {
    const providers = ['GROQ', 'OPENAI', 'GEMINI', 'ANTHROPIC', 'NVIDIA', 'API_KEY', 'LLMProvider']

    for (const path of backendSources) {
      const source = code(path)
      for (const provider of providers) {
        expect(source).not.toContain(provider)
      }
    }
  })

  it('no llama a ningún servicio externo', () => {
    for (const path of backendSources) {
      // La única URL admisible es la del propio proyecto de Supabase, y llega
      // por variable de entorno, no escrita en el código.
      const external = code(path).match(/https:\/\/[a-z0-9.-]+/g) ?? []
      expect(external.filter((url) => !url.endsWith('fintrack.win'))).toEqual([])
    }
  })

  it('no hay copias de módulos compartidos dentro de supabase/functions', () => {
    // La Edge Function importa la lógica de `src/`. Un segundo archivo .ts aquí
    // sería el principio de una copia que acabaría divergiendo.
    const functionSources = filesIn(FUNCTIONS_DIR, ['.ts']).map((path) =>
      path.replace(FUNCTIONS_DIR, '').replace(/\\/g, '/'),
    )

    expect(functionSources).toEqual(['/finance-chat/index.ts'])
  })

  it('el mapa de imports de Deno no concede acceso al cliente del navegador', () => {
    const config = JSON.parse(readFileSync(join(FUNCTIONS_DIR, 'deno.json'), 'utf8')) as {
      imports: Record<string, string>
    }

    // El mapa es una lista cerrada: lo que no esté aquí no se puede importar
    // desde la Edge Function, ni siquiera por accidente.
    for (const target of Object.values(config.imports)) {
      expect(target).not.toContain('lib/supabase')
    }
  })
})
