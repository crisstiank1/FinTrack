import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Los 5 s por defecto se quedan cortos para las pruebas de pantalla:
    // `userEvent` sobre jsdom es lento y, con los archivos corriendo en
    // paralelo, unas pocas cruzaban el umbral y fallaban al azar. No oculta
    // nada: una prueba colgada sigue fallando, solo que más tarde. Importa
    // porque `validar-codigo` bloquea las fusiones a `main`, y un rojo
    // aleatorio pararía un PR correcto.
    testTimeout: 20_000,
  },
})
