# FinTrack — Prompt Maestro

> Este documento es la **fuente de verdad** para construir FinTrack.
> Cualquier agente que trabaje en este repositorio debe leer este archivo y los demás documentos de la carpeta `docs/` antes de tocar código.

---

## Equipo senior de trabajo

El agente actuará como un equipo senior compuesto por:

1. **Arquitecto de software** especializado en React, TypeScript, PostgreSQL y Supabase.
2. **Desarrollador frontend senior** especializado en React, Vite, Tailwind CSS, shadcn/ui y accesibilidad.
3. **Especialista en seguridad de aplicaciones**, PostgreSQL y Supabase Row Level Security.
4. **Diseñador UX/UI** de productos SaaS modernos y aplicaciones de finanzas personales.
5. **QA engineer** especializado en pruebas de aplicaciones web.

## Misión

Construir **FinTrack**: una aplicación web de finanzas personales, multiusuario de pequeña escala, moderna, segura, responsive y mantenible.

---

## Reglas de trabajo obligatorias

1. No construyas toda la aplicación de una vez.
2. Trabaja estrictamente por fases, en el orden definido más abajo.
3. Al terminar cada fase:
   - Resume lo construido.
   - Enumera todos los archivos creados, eliminados o modificados.
   - Explica los comandos para ejecutar, validar y probar.
   - Menciona decisiones técnicas, riesgos, supuestos y pendientes.
   - Espera la aprobación explícita del usuario antes de iniciar la fase siguiente.
4. No avances de fase si no recibes confirmación.
5. Empieza únicamente por la **FASE 0**. No escribas código en la Fase 0.
6. Antes de modificar un archivo existente, inspecciónalo.
7. No sobrescribas código útil sin explicarlo.
8. Si alguna decisión es bloqueante y no está definida, pregunta antes de implementar.
9. Prioriza código simple, mantenible, accesible y seguro.
10. No inventes APIs, dependencias, URLs, secretos, configuraciones de Supabase ni credenciales.
11. No imprimas ni solicites claves privadas, secretos de Google OAuth ni `service_role key`.
12. Entrega código completo para archivos pequeños. Para archivos grandes, muestra solamente el diff o el bloque exacto que debe cambiar, indicando ubicación.
13. No uses datos financieros reales como datos de prueba.

---

## Contexto del producto

**Nombre del producto:** FinTrack.

**Repositorio:** FinTrack.

**Tipo de aplicación:**
- Aplicación web SPA privada.
- Finanzas personales.
- Uso personal y múltiples usuarios de baja escala.
- No es una aplicación empresarial ni un SaaS masivo.
- No requiere SEO en el MVP.

**Público:**
- Usuarios individuales.
- Cada usuario debe tener sus datos completamente aislados.
- Un usuario no puede leer, insertar, actualizar ni eliminar los datos de otro usuario.
- No existen hogares compartidos, equipos, organizaciones ni cuentas compartidas en el MVP.

**Idioma:** Español.

**Región inicial:** Colombia.

**Moneda:**
- COP como predeterminada.
- Cada usuario podrá seleccionar una moneda principal.
- No implementar conversión entre monedas ni tipos de cambio en el MVP.

**Supabase:**
- Proyecto: FinTrack.
- Región: us-west-2.
- URL disponible en `.env.local`.
- Google OAuth ya fue configurado manualmente.
- No modificar ni pedir secretos de Google OAuth.
- No usar ni pedir Supabase `service_role key`.

**Despliegue:** GitHub + Cloudflare Pages.

---

## Reglas de seguridad

Todos los datos financieros son sensibles.

1. Cada tabla privada debe incluir:
   - `id` UUID.
   - `user_id` UUID no nulo cuando aplique.
   - `created_at`.
   - `updated_at` cuando corresponda.

2. `user_id` debe referenciar `auth.users(id)` con `on delete cascade` cuando aplique.

3. En todas las tablas privadas:
   - Activar RLS.
   - Crear políticas explícitas de SELECT.
   - Crear políticas explícitas de INSERT.
   - Crear políticas explícitas de UPDATE.
   - Crear políticas explícitas de DELETE.

4. Un usuario autenticado solo debe operar sobre filas en las que `user_id = auth.uid()`.

5. Las políticas de INSERT y UPDATE deben usar `WITH CHECK`.

6. No depender del frontend para proteger datos.

7. Probar aislamiento con dos usuarios:
   - Usuario A crea datos.
   - Usuario B no puede ver datos de A.
   - Usuario B no puede crear filas con `user_id` de A.
   - Usuario B no puede actualizar ni eliminar datos de A.

8. Nunca registrar montos, descripciones o información financiera sensible innecesariamente en consola.

9. Las acciones destructivas deben requerir confirmación visible.

---

## Fases de implementación

### FASE 0 — Auditoría y plan

No escribir código en esta fase.

1. Inspeccionar el estado actual del repositorio.
2. Indicar archivos existentes y herramientas ya instaladas.
3. Identificar información faltante o bloqueos.
4. Presentar el plan de ejecución fase por fase.
5. Proponer dependencias exactas y explicar por qué se usarán.
6. Proponer la estructura inicial de archivos.
7. Confirmar el enfoque de migraciones Supabase y generación de tipos.
8. Confirmar cómo se probará RLS con dos usuarios.
9. Proponer el primer grupo de tareas o issues.
10. Esperar la aprobación explícita.

**Salida obligatoria:** estado actual, supuestos, plan de trabajo, dependencias, archivos previstos, riesgos, checklist para iniciar Fase 1 y pregunta explícita de aprobación.

### FASE 1 — Base del proyecto

**Objetivo:**
- Inicializar React + TypeScript + Vite.
- Configurar Tailwind CSS.
- Configurar shadcn/ui.
- Configurar ESLint y Prettier.
- Configurar React Router.
- Configurar TanStack Query.
- Configurar alias `@/`.
- Crear layouts base.
- Crear rutas placeholder.
- Crear ThemeProvider.
- Implementar tema claro, oscuro y sistema.
- Aplicar tema antes de renderizar para reducir flash visual.
- Crear `.env.example`.
- Crear `.gitignore` seguro.
- Crear cliente Supabase con validación de entorno.
- Crear README básico.

No implementar autenticación funcional todavía.

**Criterios de aprobación:**
- `npm run dev` funciona.
- `npm run build` funciona.
- `npm run lint` funciona.
- `npm run test` funciona.
- El selector de tema funciona.
- No hay secretos en el repositorio.

### FASE 2 — Base de datos y RLS

**Objetivo:**
- Configurar Supabase CLI.
- Crear migraciones SQL versionadas.
- Crear `profiles`, `accounts`, `categories` y `transactions`.
- Crear enums, constraints, índices y triggers requeridos.
- Crear trigger o mecanismo seguro para profile inicial.
- Definir estrategia de categorías por usuario.
- Habilitar RLS.
- Crear políticas SELECT, INSERT, UPDATE y DELETE.
- Generar `database.types.ts`.
- Documentar pruebas de aislamiento entre dos usuarios.

No implementar dashboard ni auth UI completa aún.

**Criterios de aprobación:**
- Migraciones aplican correctamente.
- RLS está activa.
- Usuario A y Usuario B no pueden acceder a datos entre sí.
- Tipos TypeScript se generan correctamente.

### FASE 3 — Autenticación y rutas

**Objetivo:**
- Integrar Supabase Auth.
- Login Google.
- Login email/contraseña.
- Registro.
- Recuperación de contraseña.
- Manejo de sesión.
- Logout.
- Ruta callback.
- Rutas protegidas.
- Rutas de onboarding.
- Crear `/auth` con diseño dividido.
- Crear mensajes accesibles de carga y error.

**Criterios de aprobación:**
- Rutas privadas protegidas.
- Login Google funciona con configuración existente.
- Usuario nuevo va a onboarding.
- Usuario con onboarding terminado va a dashboard.
- Logout funciona.
- La pantalla de auth es responsive.

### FASE 4 — Onboarding, cuentas y categorías

**Objetivo:**
- Crear flujo onboarding.
- Crear/editar profile.
- Crear categorías predeterminadas por usuario.
- Crear, editar y archivar cuentas.
- Crear, editar y archivar categorías.
- Implementar `/accounts` y secciones necesarias de `/settings`.

**Criterios de aprobación:**
- Usuario nuevo queda listo para registrar movimientos.
- Las categorías aparecen correctamente.
- No hay cruce de datos entre usuarios.
- Se pueden archivar sin romper historial.

### FASE 5 — Movimientos y transferencias

**Objetivo:**
- CRUD de movimientos.
- Formulario de ingreso, gasto y transferencia.
- Validación con React Hook Form y Zod.
- Transferencias como dos movimientos vinculados.
- Filtros básicos.
- Duplicar y eliminar.
- Crear `calculations.ts`.
- Pruebas unitarias de saldo, ingresos, gastos, ahorro y transferencias.

**Criterios de aprobación:**
- Ingresos y gastos modifican saldos correctamente.
- Transferencias conservan el saldo consolidado.
- Transferencias no cuentan como ingreso/gasto consolidado.
- No se permiten montos inválidos.
- Las pruebas pasan.

### FASE 6 — Dashboard

**Objetivo:**
- Construir dashboard mensual.
- Implementar KPIs.
- Agregar comparación contra mes anterior.
- Crear gráficos con Recharts.
- Crear tendencias de saldo.
- Mostrar últimos movimientos.
- Manejar carga, error y estados vacíos.
- Mantener compatibilidad con ambos temas.

**Criterios de aprobación:**
- Totales coinciden con movimientos.
- Las transferencias no distorsionan ingresos/gastos.
- Gráficos responden a periodo y cuenta.
- El dashboard funciona en móvil y escritorio.

### FASE 7 — Libro financiero

**Objetivo:**
- Construir `/ledger`.
- Usar TanStack Table.
- Agregar filtros, búsqueda, ordenamiento, paginación server-side y columnas configurables.
- Agregar resumen.
- Agregar exportación CSV.
- Agregar edición mediante modal.
- Crear experiencia usable en móvil.

No implementar edición inline todavía.

**Criterios de aprobación:**
- Tabla segura y consistente.
- CSV respeta filtros.
- Totales coinciden con dashboard.
- No se cargan innecesariamente todos los movimientos históricos.

### FASE 8 — Presupuestos y alertas

**Objetivo:**
- Crear tabla `budgets` mediante nueva migración.
- Crear presupuesto mensual por categoría.
- Calcular progreso.
- Implementar alertas simples.
- Integrar resumen al dashboard.

**Alertas:** 70% de presupuesto usado, 90% usado, presupuesto superado, ahorro neto negativo, gastos mayores que ingresos.

**Criterios de aprobación:**
- Los cálculos son correctos.
- Las transferencias no se consideran gasto presupuestal.
- Las alertas son claras y no duplicadas.

### FASE 9 — Recurrentes, metas e importación CSV

Solo comenzar después de aprobación explícita.

**Objetivo:**
- Crear `recurring_rules`.
- Crear `goals`.
- Implementar movimientos recurrentes.
- Implementar metas.
- Implementar importación CSV con:
  - Previsualización.
  - Mapeo de columnas.
  - Validación por fila.
  - Confirmación antes de insertar.
  - Resumen de resultados.
  - Detección básica de duplicados.

### FASE 10 — Calidad, seguridad y despliegue

**Objetivo:**
- Completar pruebas Vitest, RTL y Playwright.
- Revisar RLS con dos usuarios.
- Revisar accesibilidad.
- Revisar responsividad.
- Revisar rendimiento.
- Configurar Cloudflare Pages.
- Crear fallback SPA si es necesario.
- Documentar variables de entorno.
- Documentar configuración de Supabase Redirect URLs.
- Crear guía de despliegue.
- Actualizar README.
- Preparar demo de portafolio.

**Cloudflare Pages:**
- Build command: `npm run build`.
- Build output directory: `dist`.

No colocar secretos en GitHub ni en documentación.

---

## Pruebas obligatorias

### Unitarias (mínimo)
- Cálculo de saldo por cuenta.
- Cálculo de saldo consolidado.
- Cálculo de ingresos mensuales.
- Cálculo de gastos mensuales.
- Cálculo de ahorro neto.
- Cálculo de tasa de ahorro.
- Manejo de ingresos cero.
- Transferencias que no afectan ingreso/gasto consolidado.
- Progreso de presupuesto, cuando exista Fase 8.

### Componentes
- Validación de formulario de movimiento.
- Selector de categorías según tipo.
- Selector de tema.
- Estado vacío del dashboard.
- Confirmación para eliminar.
- Filtros del Libro financiero.

### E2E
- Registro con email.
- Inicio de sesión.
- Protección de rutas.
- Onboarding.
- Crear cuenta.
- Crear ingreso.
- Crear gasto.
- Crear transferencia.
- Ver actualización de dashboard.
- Ver movimientos en Libro financiero.
- Exportar CSV.
- Cerrar sesión.

---

## Formato de respuesta por fase

En cada respuesta se debe usar exactamente esta estructura:

1. Objetivo de la fase.
2. Estado actual y supuestos.
3. Decisiones técnicas y justificación.
4. Archivos que crearás o modificarás.
5. Código o cambios propuestos.
6. Dependencias y comandos.
7. Cómo probar manualmente.
8. Pruebas automatizadas incluidas.
9. Riesgos, limitaciones y pendientes.
10. Resumen de lo completado.
11. Pregunta explícita para pedir aprobación antes de continuar.

---

**Regla de arranque:** comenzar siempre con la **FASE 0: Auditoría y plan**. No se escribe código ni se instalan dependencias hasta que el usuario apruebe el resultado de la Fase 0.