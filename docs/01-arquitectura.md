# FinTrack — Arquitectura

> Stack obligatorio, variables de entorno y estructura de carpetas.
> Gestor de paquetes y runtime: **Bun**.

---

## Stack obligatorio

### Frontend
- **React**
- **TypeScript** con configuración estricta
- **Vite**
- **React Router**
- **Tailwind CSS**
- **shadcn/ui**
- **Lucide React**
- **Recharts**
- **React Hook Form**
- **Zod**
- **TanStack Query**
- **TanStack Table**
- **date-fns**

### Librerías de dominio
- **dinero.js** — manejo de divisas y montos financieros.
- **sonner** — notificaciones de UI (integrado vía shadcn/ui).
- **papaparse** — parseo y exportación de CSV (importación y exportación del Libro financiero).

### Backend y datos
- **Supabase Auth**
- **Supabase PostgreSQL**
- **Supabase JavaScript client**
- **Supabase Row Level Security (RLS)**
- **Supabase CLI** — migraciones SQL versionadas y generación de tipos. Instalada como dependencia de desarrollo del proyecto.

### Calidad
- **ESLint**
- **Prettier**
- **Vitest**
- **React Testing Library**
- **Playwright** — flujos end-to-end importantes.

### No usar
- JavaScript sin TypeScript.
- `any`.
- Redux, salvo que se solicite explícitamente y se justifique.
- Backend propio con Spring Boot en el MVP.
- Claves privadas en frontend.
- `service_role key`.
- Secretos con prefijo `VITE_`.
- Integraciones bancarias.
- Servicios pagos obligatorios.
- Fórmulas libres estilo Excel en el MVP.
- Datos reales para pruebas.

---

## Variables de entorno

El proyecto espera estas variables locales:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Reglas:

- Crear `.env.example` **sin valores reales**.
- `.gitignore` debe excluir `.env`, `.env.local` y variantes locales.
- Validar que las variables existan al crear el cliente Supabase.
- Nunca incluir valores reales en código, documentación, commits o respuestas.
- Nunca usar `VITE_SUPABASE_SERVICE_ROLE_KEY` ni equivalentes.

---

## Comandos (Bun)

El gestor de paquetes oficial del proyecto es **Bun**. Reemplazar cualquier `npm ...` por:

```bash
bun install            # instalar dependencias
bun run dev            # desarrollo local
bun run build          # build de producción
bun run preview        # preview del build
bun run lint           # ESLint
bun run test           # Vitest
bunx tsc --noEmit      # verificación de tipos

# Agregar dependencias
bun add <paquete>                  # producción
bun add -d <paquete>               # desarrollo

# CLI de Supabase (migraciones, tipos, local)
bunx supabase <comando>
```

---

## Estructura de carpetas

Organización basada en funcionalidades:

```
src/
  app/
    App.tsx
    providers.tsx
    router.tsx
  components/
    ui/
    auth/
    charts/
    dashboard/
    layout/
    ledger/
    theme/
    transactions/
  features/
    auth/
    accounts/
    categories/
    transactions/
    dashboard/
    ledger/
    budgets/
    recurring/
    goals/
  hooks/
  lib/
    supabase.ts
    calculations.ts
    currency.ts
    dates.ts
    csv.ts
    utils.ts
  pages/
  routes/
  styles/
  types/
    database.types.ts
    finance.types.ts
  main.tsx
```

Para cada feature, organizar cuando aplique:

- Types.
- Schemas.
- Services.
- Query hooks.
- Mutation hooks.
- Componentes.
- Tests.

No crear carpetas vacías innecesarias. Crear cada feature cuando llegue su fase.

---

## Notas de despliegue

- Despliegue: GitHub + Cloudflare Pages.
- Disponible: fallback SPA para React Router (recarga de rutas directas).
- No colocar secretos en GitHub ni en documentación.