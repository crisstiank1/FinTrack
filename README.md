# FinTrack

Aplicación web de finanzas personales.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Supabase
- Cloudflare Pages

## Inicio Rápido

```bash
bun install
bun run dev
```

## Scripts

```bash
bun run dev       # Desarrollo local
bun run build     # Build de producción
bun run preview   # Preview del build
bun run lint      # Linting
bun run test      # Pruebas (Vitest)
bun run test:ui   # Pruebas con interfaz de Vitest
```

## Variables de Entorno

Copia `.env.example` a `.env.local` y completa los valores:

```
VITE_SUPABASE_URL=tu_url
VITE_SUPABASE_PUBLISHABLE_KEY=tu_key
```

## Despliegue

Deploy automático en Cloudflare Pages desde la rama `main`.

## Licencia

MIT
