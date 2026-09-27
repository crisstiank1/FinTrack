# Procedimiento de aplicación remota: migraciones 20260927120000 y 20260927130000

> Para ejecutar **manualmente** por el propietario del proyecto. Nada de este
> documento se ha ejecutado contra el proyecto remoto. No incluye ni debe
> incluir claves, JWTs ni el identificador del proyecto: donde aparecen
> `<…>`, se sustituyen en la terminal, nunca en el repositorio.

## Prioridad

`20260927130000_restringir_funciones_coach.sql` corrige un defecto **crítico**:
hoy cualquier sesión puede ejecutar `purge_ai_data`
(`docs/22-auditoria-security-definer.md`). Debe aplicarse antes de habilitar
cualquier otra funcionalidad del Coach, y antes de historial o
`conversationId`.

| Migración                                         | Contenido                                                                                                                                  | Toca datos                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `20260927120000_crear_plantillas_recurrentes.sql` | Tablas `recurring_templates`, `recurring_template_projections`; columnas en `sheet_drafts`; RPC `project_recurring_templates`              | Solo añade (columnas nulas en `sheet_drafts`) |
| `20260927130000_restringir_funciones_coach.sql`   | Revoca EXECUTE en las 14 funciones de `public` (mínimo necesario), fija `search_path = ''` y activa deny-by-default para funciones futuras | No                                            |

`supabase db push` aplica las pendientes en orden de fecha: primero `…120000`,
después `…130000`.

## 0. Requisitos

- Supabase CLI enlazada al proyecto (`supabase link --project-ref <REF>`),
  con la versión de `package.json`.
- Checkout de `dev` en el commit revisado, con CI en verde (jobs
  `validar-codigo` y `validar-base-de-datos`).
- `psql` para la verificación de permisos.
- Una cuenta de prueba (no personal) para los smoke tests autenticados.
- Ventana sin uso intenso: la migración `…120000` altera `sheet_drafts`.
- **PostgreSQL 15 o posterior** en el proyecto: `…120000` usa
  `on delete set null (source_template_id)`. Comprobar con
  `select current_setting('server_version_num')::int >= 150000;` (debe dar
  `true`). Si no, parar: la migración fallaría.

## 1. Backup previo

1. Panel de Supabase → **Database → Backups**: comprobar que existe una copia
   reciente; si el plan lo permite, anotar la hora para una restauración
   puntual (PITR).
2. Además, un volcado local **fuera del repositorio**:

   ```bash
   mkdir -p ~/fintrack-backups
   supabase db dump --linked -f ~/fintrack-backups/schema-$(date +%F-%H%M).sql
   supabase db dump --linked --data-only -f ~/fintrack-backups/data-$(date +%F-%H%M).sql
   ```

   El volcado de datos contiene datos personales y financieros: guardarlo
   cifrado y borrarlo cuando deje de ser necesario. **Nunca** añadirlo a Git.

3. Guardar el estado actual de permisos para poder comparar:

   ```sql
   select p.oid::regprocedure as funcion, p.prosecdef, p.proconfig, p.proacl
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' order by 1;
   ```

## 2. Comprobar el estado de migraciones

```bash
supabase migration list --linked
```

Debe mostrar hasta `20260923120000` aplicada en remoto y `20260927120000`,
`20260927130000` solo en local. Si aparece cualquier otra diferencia, parar e
investigar antes de continuar.

## 2b. Identificar el rol que crea las funciones

`ALTER DEFAULT PRIVILEGES` se aplica al rol que ejecuta la migración y al
propietario de las funciones existentes (`docs/22-auditoria-security-definer.md`
§3). Antes de aplicar, anotar ambos:

```sql
select current_user as rol_de_sesion,
       pg_get_userbyid(p.proowner) as propietario_funciones
from pg_proc p
where p.oid = 'public.purge_ai_data(integer, integer)'::regprocedure;

select pg_get_userbyid(defaclrole) as rol,
       coalesce(defaclnamespace::regnamespace::text, '(global)') as esquema,
       defaclacl
from pg_default_acl
where defaclobjtype = 'f'
order by 1, 2;
```

Ejecutar la primera consulta **con el mismo método** con que se aplicarán las
migraciones. Si `supabase db push` no permite consultas, basta con la segunda:
después de aplicar debe aparecer una fila global y otra de `public` para el
propietario, sin `anon`, `authenticated` ni `=X` (PUBLIC).

## 3. Aplicar

```bash
supabase db push --linked --dry-run   # revisar que solo aparecen las dos
supabase db push --linked
```

Durante la aplicación de `…130000` deben aparecer avisos como:

```text
NOTICE:  deny-by-default configurado para funciones creadas por <rol>
```

uno por cada rol configurado. Un `WARNING: No se pudo configurar
deny-by-default para <rol>` no aborta la migración (los revokes son lo
urgente), pero hará fallar la verificación del paso 4: resolverlo antes de
continuar, ejecutando el bloque `do` de la migración con un rol que pertenezca
al indicado.

Si la CLI informa de un error, **no reintentar a ciegas**: pasar al apartado 7.

## 4. Verificar permisos (SQL)

Ejecutar el archivo de verificación, que es **solo lectura**:

```bash
psql "<CADENA_DE_CONEXION_DEL_PROYECTO>" -v ON_ERROR_STOP=1 \
  -f supabase/tests/db/40-function-privileges.sql
```

Resultado esperado:

```text
NOTICE:  Permisos de funciones correctos: 14 funciones auditadas; deny-by-default activo para <rol>.
```

Cualquier `ERROR: Permisos de funciones incorrectos` lista exactamente qué
rol o función falla. Desde el editor SQL del panel se puede pegar solo el
bloque `do $$ … $$;` (sin la línea `\set`).

Comprobación directa adicional:

```sql
select r.rol, f.funcion, has_function_privilege(r.rol, f.funcion, 'EXECUTE') as puede
from (values ('anon'), ('authenticated')) r(rol)
cross join (values
  ('public.purge_ai_data(integer,integer)'::regprocedure),
  ('public.handle_new_user()'::regprocedure),
  ('public.consume_ai_quota(integer)'::regprocedure),
  ('public.project_recurring_templates(text)'::regprocedure),
  ('public.register_sheet_draft(uuid)'::regprocedure)
) f(funcion)
order by 2, 1;
```

Esperado: `puede = true` solo para `authenticated` en `consume_ai_quota`,
`project_recurring_templates` y `register_sheet_draft`.

## 5. Regenerar tipos

```bash
supabase gen types typescript --linked > src/types/database.types.ts
bunx prettier --write src/types/database.types.ts
git diff src/types/database.types.ts
bun run typecheck && bun run test
```

El diff debería limitarse al orden o formato de lo añadido a mano para
`recurring_templates`, `recurring_template_projections`, las columnas
`source_template_id` y `generated_for_month` de `sheet_drafts` y la función
`project_recurring_templates`. Cualquier otra diferencia indica deriva de
esquema: investigar antes de hacer commit
(`chore(supabase): regenerate database types`).

## 6. Smoke tests

Variables solo en la terminal (no en archivos):

```bash
export SB_URL="https://<REF>.supabase.co"
export SB_ANON="<CLAVE_PUBLICABLE>"
```

### Sin sesión (solo clave pública)

| Llamada                                                                            | Esperado                                                    |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `POST $SB_URL/rest/v1/rpc/purge_ai_data` con `{}`                                  | 401 o 403, código `42501` (permiso denegado). **Nunca 200** |
| `POST $SB_URL/rest/v1/rpc/consume_ai_quota` con `{"p_limit":15}`                   | 401 o 403, `42501`                                          |
| `POST $SB_URL/rest/v1/rpc/project_recurring_templates` con `{"p_month":"2026-10"}` | 401 o 403, `42501`                                          |
| `POST $SB_URL/rest/v1/rpc/handle_new_user` con `{}`                                | Error; nunca 200                                            |
| `POST $SB_URL/functions/v1/finance-chat` sin `Authorization`                       | 401                                                         |

```bash
curl -s -o /dev/stderr -w '%{http_code}\n' -X POST "$SB_URL/rest/v1/rpc/purge_ai_data" \
  -H "apikey: $SB_ANON" -H "Content-Type: application/json" -d '{}'
```

### Con sesión de la cuenta de prueba

Obtener un token de acceso iniciando sesión con la cuenta de prueba (por
ejemplo desde la app y copiándolo de las herramientas del navegador) y
guardarlo solo en la terminal como `SB_JWT`. No pegarlo en ningún archivo,
issue ni chat.

| Llamada (con `Authorization: Bearer $SB_JWT`)                               | Esperado                                                                                                                 |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `rpc/purge_ai_data` `{}`                                                    | 403, `42501`. **Nunca 200**                                                                                              |
| `rpc/consume_ai_quota` `{"p_limit":15}`                                     | 200 con un entero (consume una unidad de la cuenta de prueba)                                                            |
| `rpc/project_recurring_templates` `{"p_month":"2026-10"}`                   | 200 con `{"month":"2026-10","sheet_id":null,"results":[]}` si la cuenta no tiene plantillas                              |
| `rpc/project_recurring_templates` `{"p_month":"2026-13"}`                   | 400, código `22023`                                                                                                      |
| `functions/v1/finance-chat` con `{"message":"¿En qué gasté más este mes?"}` | 200. Sin secretos del proveedor: `coach_context_ready` o una aclaración de moneda. **No** debe llamar a ningún proveedor |

### Flujos de la aplicación

1. **Registro de un usuario nuevo** de prueba: debe crearse su fila en
   `profiles` (confirma que `handle_new_user` sigue funcionando tras el revoke).
2. Movimiento con «Repetir cada mes» → aparece en Ajustes → Movimientos
   recurrentes.
3. Dashboard muestra «Proyectar 1 movimiento recurrente…»; al pulsar, crea el
   borrador en «Recurrentes YYYY-MM»; al pulsar de nuevo, `ya existían`.
4. Registrar el borrador desde Hojas; proyectar otra vez no lo duplica.
5. `/import` con un CSV de prueba sintético: crea la hoja y los borradores.
6. Ajustes → FinTrack Coach: autorizar y retirar; comprobar en `profiles` que
   las dos columnas cambian juntas.

## 7. Rollback

| Situación                                                                                                        | Acción                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `db push` falla en `…120000`                                                                                     | Comprobar con `supabase migration list --linked` si quedó registrada y, con la consulta del paso 1.3 y `\d public.recurring_templates`, si quedó algo creado. Si no quedó nada, corregir en `dev`, pasar CI y repetir; si quedó a medias, aplicar el bloque de reversión de la migración y `supabase migration repair --status reverted 20260927120000` antes de repetir |
| `db push` falla en `…130000` tras aplicar `…120000`                                                              | `…120000` queda aplicada y es independiente. Revisar el error; **no** dejar el proyecto sin la corrección de seguridad más tiempo del necesario                                                                                                                                                                                                                          |
| Tras aplicar, el alta de usuarios no crea el perfil                                                              | Muy improbable (probado). Revertir **solo** la parte de `handle_new_user`: `alter function public.handle_new_user() set search_path = public;` y verificar. No volver a conceder EXECUTE sobre `purge_ai_data`                                                                                                                                                           |
| Un trigger falla con «permission denied for function» (no esperado: PostgreSQL no comprueba EXECUTE al disparar) | Conceder solo esa función a quien la necesite, p. ej. `grant execute on function public.validate_budget() to authenticated;`, y registrar el caso en `docs/22`                                                                                                                                                                                                           |
| Una RPC nueva de una migración posterior no es invocable                                                         | Es el comportamiento esperado de deny-by-default: añadir en esa migración `grant execute … to authenticated` y su fila en `40-function-privileges.sql`                                                                                                                                                                                                                   |
| Hay que retirar la funcionalidad de recurrentes                                                                  | Bloque de reversión comentado al final de `…120000` (borra las tablas de plantillas y proyecciones; los borradores quedan como borradores normales). Después: `supabase migration repair --status reverted 20260927120000`                                                                                                                                               |
| Daño de datos inesperado                                                                                         | Restaurar desde el backup del paso 1 (PITR o volcado)                                                                                                                                                                                                                                                                                                                    |

Revertir `…130000` completa **no** es una opción de rollback aceptable: reabre
la vulnerabilidad.

## 8. Después

- Registrar en `docs/15-fintrack-coach-status.md` la fecha de aplicación y el
  resultado de la verificación.
- Mantener el bloqueo: sin historial, `conversationId` ni habilitación pública
  del Coach hasta cerrar también la programación de la purga
  (`docs/16-coach-fase-4.md` §5).
