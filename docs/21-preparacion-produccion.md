# Preparación para producción

> Estado del 2026-09-27. Rama de integración: `dev`. Nada de esto se ha
> desplegado ni aplicado en el proyecto remoto.

## CI

`.github/workflows/ci.yml` corre en cada push a `dev` y `main` y en PR hacia
`main`:

| Job                     | Qué comprueba                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `validar-codigo`        | ESLint, `tsc -b`, Vitest (incluye axe), build de Vite, `deno check` de `finance-chat` |
| `validar-base-de-datos` | Todas las migraciones en PostgreSQL 16 limpio + pruebas SQL y de concurrencia         |

## Migraciones sin aplicar en el proyecto

| Migración                                         | Propósito                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| `20260927120000_crear_plantillas_recurrentes.sql` | Plantillas recurrentes, registro de proyecciones, RPC                     |
| `20260927130000_restringir_funciones_coach.sql`   | **Seguridad:** cierra EXECUTE de `purge_ai_data` a `anon`/`authenticated` |

La segunda corrige un defecto de una migración ya aplicada; conviene aplicarla
en cuanto sea posible, aunque el Coach no esté activo.

## Orden de pasos manuales

Procedimiento detallado (backup, aplicación, verificación de permisos, tipos,
smoke tests y rollback): `docs/23-procedimiento-aplicacion-remota.md`.
Auditoría de funciones: `docs/22-auditoria-security-definer.md`.

1. **Urgente:** aplicar las dos migraciones siguiendo el procedimiento
   (primero staging si existe). `…130000` corrige un fallo crítico de permisos.
2. Regenerar `src/types/database.types.ts` desde el proyecto y comparar con los
   tipos escritos a mano para `recurring_templates`,
   `recurring_template_projections` y las columnas nuevas de `sheet_drafts`.
3. Probar con Supabase real: Dashboard (aviso de proyección), Ajustes
   (plantillas y consentimiento), formularios con «Repetir cada mes», Hojas con
   borradores proyectados, `/import` de principio a fin.
4. Abrir el PR `dev → main`, esperar CI en verde y revisarlo.
5. Completar los datos legales: responsable, canal de contacto, ley aplicable,
   edad mínima; revisión legal de `/privacy` y `/terms`.
6. Confirmar la licencia del logo y la conformidad del botón de Google.
7. Verificar en Cloudflare que no hay analítica ni scripts inyectados.

## Antes de activar FinTrack Coach

- Plan de pago de Gemini confirmado por el propietario.
- Secretos `COACH_LLM_*` configurados manualmente en Supabase.
- Modelo estable (no preview) confirmado en la consola del proveedor.
- Purga programada con `pg_cron` (`docs/16-coach-fase-4.md` §5).
- Smoke tests autenticados de `finance-chat` con consentimiento concedido.
- Quitar el aviso «todavía no está disponible» de `/privacy` y Ajustes.

## Descripción propuesta para el PR `dev → main`

```markdown
## Resumen

- Coach: consentimiento real y versionado, cuota persistente y atómica, UI de
  consentimiento revocable en Ajustes, política de modelos del proveedor.
- Importador CSV de extractos a borradores de Hojas (sin publicar nada).
- Movimientos recurrentes: plantillas, proyección idempotente a borradores,
  «Repetir cada mes» en los formularios, aviso en el Dashboard.
- Páginas públicas `/privacy`, `/terms`, `/cookies`, `/refunds` y pie legal.
- Accesibilidad: contraste AA en tokens, auditoría axe, títulos de página.
- Seguridad: revoca EXECUTE de `purge_ai_data` a `anon`/`authenticated`.
- CI: migraciones y pruebas SQL contra PostgreSQL 16.

## Migraciones

- `20260927120000_crear_plantillas_recurrentes.sql`
- `20260927130000_restringir_funciones_coach.sql`

## Antes de fusionar

- [ ] CI en verde
- [ ] Migraciones aplicadas en entorno seguro y tipos regenerados
- [ ] Pruebas con Supabase real
- [ ] Revisión legal de privacidad y términos
```
