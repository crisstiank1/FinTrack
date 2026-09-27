# Estado de `dev` para revisión

> 2026-09-27. Rama aprobada para revisión `dev → main`. Sin cambios de producto
> pendientes en esta rama. Nada se ha desplegado ni aplicado en el proyecto
> remoto.

## Bugs corregidos en la auditoría final

Cada uno con una prueba de regresión que fallaba antes de la corrección.

| #   | Bug                                                                                                                            | Corrección                                                                                                                                | Prueba                                                 | Commit    |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------- |
| 1   | Un borrador podía citar la plantilla recurrente de **otro usuario** (FK simple, comprobada sin RLS)                            | FK compuesta `(source_template_id, user_id)` con `on delete set null (source_template_id)`; FK de borradores y de proyecciones inmediatas | `supabase/tests/db/10-recurring-templates.sql` §2 y §9 | `13d774e` |
| 2   | Al cambiar la columna de fecha en `/import`, el formato elegido para la anterior se aplicaba en silencio a una columna ambigua | Se vuelve a detectar el formato al cambiar la columna; si es ambiguo, queda vacío y bloquea                                               | `src/pages/CsvImport.test.tsx`                         | `4e2a3c0` |
| 3   | Con líneas en blanco, los errores y el origen del CSV señalaban una línea equivocada                                           | Números de línea reales (también con saltos en campos entre comillas); separador detectado en una primera pasada                          | `src/features/csv-import/csv-import.test.ts`           | `ee180d2` |
| 4   | Ajustes → Movimientos recurrentes mostraba «Aún no tienes…» mientras cargaba o si la consulta fallaba                          | Estados de carga y de error                                                                                                               | `recurring-templates-section.test.tsx`                 | `dac8159` |
| 5   | Botones de acción repetidos sin nombre distintivo para lectores de pantalla en las plantillas recurrentes                      | `aria-label` con el nombre de la plantilla                                                                                                | `recurring-templates-section.test.tsx`                 | `6931be6` |

Corrección adicional autorizada: el mismo problema del bug 5 en la pantalla de
**Movimientos** («Editar/Duplicar/Eliminar movimiento» idénticos en cada fila).
Ahora cada botón nombra su movimiento («Eliminar movimiento «Mercado»»).
Prueba: `src/pages/Transactions.test.tsx`, «nombres accesibles de las acciones
de fila». Commit `6e64ebd`.

## Garantía de propiedad entre borrador y plantilla recurrente

- `sheet_drafts (source_template_id, user_id)` → `recurring_templates (id, user_id)`:
  un borrador solo puede citar una plantilla de su mismo usuario, aunque la
  conexión no pase por RLS.
- `recurring_template_projections (template_id, user_id)` → `recurring_templates (id, user_id)`.
- `recurring_templates (account_id, user_id)` y `(category_id, user_id)` →
  cuentas y categorías del mismo usuario.
- Borrar una plantilla conserva sus borradores como borradores normales: se
  anula solo `source_template_id` (nunca `user_id`) y un trigger anula el mes.
- Borrar un usuario elimina en cascada plantillas, proyecciones y borradores
  (probado).

Detalle: `docs/19-movimientos-recurrentes.md`.

## Requisito: PostgreSQL 15 o posterior

`20260927120000_crear_plantillas_recurrentes.sql` usa
`on delete set null (source_template_id)`, disponible desde PostgreSQL 15.
Comprobar antes de aplicar:

```sql
select current_setting('server_version_num')::int >= 150000;  -- debe ser true
```

CI y las pruebas locales usan PostgreSQL 16.

## Migraciones pendientes de aplicar en remoto

| Migración                                         | Contenido                                                                                                                                                | Urgencia    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `20260927120000_crear_plantillas_recurrentes.sql` | Plantillas recurrentes, proyecciones, RPC `project_recurring_templates`, columnas nuevas de `sheet_drafts`                                               | Normal      |
| `20260927130000_restringir_funciones_coach.sql`   | Cierra EXECUTE en todas las funciones (crítico: `purge_ai_data` abierta a cualquier sesión), `search_path = ''` y deny-by-default para funciones futuras | **Crítica** |

Procedimiento completo: `docs/23-procedimiento-aplicacion-remota.md`.
Resumen:

1. Backup (panel de Supabase y volcado cifrado fuera del repositorio) y
   captura de permisos actuales.
2. Comprobar PostgreSQL 15+ y el rol que crea las funciones.
3. `supabase migration list --linked`.
4. `supabase db push --linked --dry-run` y después `supabase db push --linked`.
5. Verificar permisos con `supabase/tests/db/40-function-privileges.sql`
   (solo lectura).
6. Regenerar `src/types/database.types.ts` y comparar con los tipos escritos a
   mano.
7. Smoke tests sin sesión y con una cuenta de prueba.
8. Si algo falla: corregir **hacia adelante** con una migración nueva; nunca
   revertir `…130000`, que reabre la vulnerabilidad.

Auditoría de funciones: `docs/22-auditoria-security-definer.md`.

## Pendientes de pruebas reales

Ninguno de estos puntos se pudo verificar sin el proyecto real ni un
navegador con sesión:

| Superficie           | Qué falta                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Migraciones          | Aplicación en remoto y verificación de permisos                                                                                              |
| Registro de usuarios | Alta real tras el revoke de `handle_new_user` (probado en local con un rol sin privilegios)                                                  |
| `/import`            | Importación de principio a fin con RLS real; extractos bancarios reales anonimizados; recorrido móvil y con teclado                          |
| Recurrentes          | Dashboard (aviso y proyección), Ajustes (plantillas), «Repetir cada mes» en los dos formularios, registro de borradores proyectados en Hojas |
| Coach                | Consentimiento y revocación en Ajustes contra `profiles` real; smoke test de `finance-chat` sin secretos (ruta inerte)                       |
| Accesibilidad        | Lector de pantalla y teclado en navegador; botón flotante del Dashboard frente al pie en móvil; gráficas                                     |
| Cloudflare           | Confirmar que no inyecta analítica ni scripts                                                                                                |

## Bloqueadores antes de producción

No fusionar a `main` ni publicar hasta cerrar:

1. **Aplicar `…130000`** (crítico) y `…120000` según `docs/23`, con la
   verificación de permisos en verde.
2. Regenerar los tipos de Supabase tras aplicar.
3. Pruebas reales de la tabla anterior.
4. CI completo en verde en el PR `dev → main`.
5. Datos de negocio y legales: responsable del tratamiento, canal de contacto,
   ley aplicable, edad mínima; revisión legal de `/privacy` y `/terms`.
6. Licencia del logo propio y conformidad del botón de Google con sus
   directrices de marca.
7. Revisión de Cloudflare (analítica o scripts inyectados).

Adicionales antes de **activar FinTrack Coach** (no bloquean el resto):

- Plan de pago de Gemini confirmado por el propietario y secretos
  `COACH_LLM_*` configurados manualmente.
- Purga programada (`pg_cron`) antes de guardar historial; sin historial ni
  `conversationId` hasta una fase específica.
- Smoke tests autenticados de `finance-chat` con consentimiento concedido.

## Estado de verificación de esta rama

- Vitest completo, TypeScript (`tsc -b`), ESLint (0 errores), build de Vite y
  `bun run check:functions`: en verde.
- `scripts/test-db.sh` sobre PostgreSQL 16 limpio: pruebas 10, 20, 30, 40, 41 y
  42 en verde.
- CI de GitHub (`validar-codigo` y `validar-base-de-datos`) en verde en los
  pushes a `dev`.
- Prettier: los archivos modificados cumplen; quedan archivos anteriores sin
  formatear (p. ej. `src/index.css`), sin cambios en esta rama para no mezclar
  formato con cambios funcionales.
