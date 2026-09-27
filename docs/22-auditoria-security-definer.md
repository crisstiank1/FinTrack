# Auditoría de funciones `SECURITY DEFINER`

> 2026-09-27. Alcance: todas las migraciones de `supabase/migrations/`.
> Corrección: `20260927130000_restringir_funciones_coach.sql`.
> Verificación automática: `supabase/tests/db/40-function-privileges.sql`
> (solo lectura, apta para el proyecto remoto).

## Por qué `revoke … from public` no basta

PostgreSQL concede EXECUTE a PUBLIC al crear una función. Supabase, además,
tiene privilegios por defecto en el esquema `public` que conceden EXECUTE
**con nombre** a `anon`, `authenticated` y `service_role` sobre cada función
nueva. `revoke … from public` retira la concesión a PUBLIC pero no las
concesiones con nombre: la función sigue siendo invocable por la API REST
(`/rest/v1/rpc/<función>`), con o sin sesión.

Referencias: documentación de Supabase sobre funciones de base de datos y el
issue `supabase/supabase#49338` («`revoke execute on functions from public` has
no effect»).

## Inventario

Hay 14 funciones en `public`. Solo tres son `security definer`; las otras 11
son `security invoker` (explícito o por defecto) y se ejecutan con los permisos
de quien llama, sujetas a RLS.

### Funciones `security definer`

|                                                    | `purge_ai_data(p_message_days integer, p_counter_days integer)`                                                              | `handle_new_user()`                                                                    | `consume_ai_quota(p_limit integer)`                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Migración                                          | `20260923120000`                                                                                                             | `20260906205216`                                                                       | `20260923120000`                                                                |
| Propósito                                          | Borrar mensajes, conversaciones vacías y contadores vencidos                                                                 | Crear el perfil al registrarse un usuario (trigger `after insert on auth.users`)       | Consumir una unidad de cuota del Coach de forma atómica                         |
| EXECUTE **antes** (en Supabase)                    | PUBLIC revocado; `anon`, `authenticated`, `service_role` por privilegios por defecto                                         | PUBLIC, `anon`, `authenticated`, `service_role`                                        | PUBLIC revocado; `authenticated` explícito; `anon` y `service_role` por defecto |
| EXECUTE **después**                                | Ningún rol de la API (propietario y superusuario)                                                                            | Ningún rol de la API                                                                   | `authenticated` (y `service_role` por defecto)                                  |
| ¿Usa `auth.uid()`?                                 | No                                                                                                                           | No (usa `new.id` del trigger)                                                          | **Sí**: es la única fuente del usuario                                          |
| `search_path` antes → después                      | `public` → `''`                                                                                                              | `public` → `''`                                                                        | `public` → `''`                                                                 |
| ¿Toca datos de otros usuarios?                     | **Sí, de todos**                                                                                                             | Solo inserta el perfil del usuario recién creado                                       | No: solo la fila de `auth.uid()`                                                |
| ¿Revoke explícito de public, anon y authenticated? | **Sí** (crítico)                                                                                                             | **Sí** (higiene; un trigger no necesita EXECUTE para dispararse)                       | Sí de public y anon; se vuelve a conceder a `authenticated`                     |
| Riesgo antes de la corrección                      | **Crítico**: `purge_ai_data(0, 0)` desde cualquier sesión borraba historial y contadores de todos, anulando el límite de uso | Bajo: llamarla directamente falla (“trigger functions can only be called as triggers”) | Bajo: sin sesión lanza; con sesión solo afecta al propio contador               |

**`search_path`:** las tres tenían `set search_path = public`, que ya era un
valor fijo. Se cambian a `''` porque todas sus referencias están calificadas
(`public.…`, `auth.uid()`) y así no queda ninguna resolución implícita de
nombres en código que corre con privilegios del propietario. Las pruebas SQL
ejecutan las tres después del cambio.

**`handle_new_user`:** PostgreSQL comprueba EXECUTE sobre la función del trigger
al **crear** el trigger, no al dispararlo. Revocarla no afecta al alta; lo prueba
`41-handle-new-user-trigger.sql` insertando en `auth.users` con un rol sin
privilegios ni EXECUTE.

### Funciones `security invoker` (sin cambios)

| Función                              | Tipo    | EXECUTE                                     | Nota                                                   |
| ------------------------------------ | ------- | ------------------------------------------- | ------------------------------------------------------ |
| `register_sheet_draft(uuid)`         | RPC     | `authenticated`; revocada a PUBLIC y `anon` | RLS aplica; comprobado en `40-function-privileges.sql` |
| `project_recurring_templates(text)`  | RPC     | `authenticated`; revocada a PUBLIC y `anon` | RLS aplica; comprobado en `40-function-privileges.sql` |
| `set_updated_at()`                   | Trigger | Por defecto                                 | Solo modifica `new.updated_at`                         |
| `validate_transaction()`             | Trigger | Por defecto                                 | Solo valida; lanza excepción                           |
| `validate_budget()`                  | Trigger | Por defecto                                 | Solo valida                                            |
| `validate_category_classification()` | Trigger | Por defecto                                 | Solo valida                                            |
| `validate_income_source_category()`  | Trigger | Por defecto                                 | Solo valida                                            |
| `validate_plan_line()`               | Trigger | Por defecto                                 | Solo valida                                            |
| `check_plan_allocations_sum()`       | Trigger | Por defecto                                 | Solo valida                                            |
| `validate_recurring_template()`      | Trigger | Por defecto                                 | Solo valida                                            |
| `clear_draft_generated_month()`      | Trigger | Por defecto                                 | Solo modifica la fila en curso                         |

Las funciones de trigger no se pueden invocar por RPC (PostgreSQL las rechaza
fuera de un trigger) y, al ser `invoker`, no elevan privilegios. No requieren
revoke.

## Guardas contra regresiones

`40-function-privileges.sql` falla si:

- aparece una función `security definer` en `public` que no está en su lista
  autorizada (obliga a auditarla);
- PUBLIC, `anon` o `authenticated` tienen EXECUTE donde no deben;
- alguna función definer no tiene `search_path` vacío;
- `anon` puede ejecutar `register_sheet_draft` o `project_recurring_templates`,
  o `authenticated` no puede.

`30-coach-consent-and-purge.sql` falla si `anon` o `authenticated` pueden
ejecutar `purge_ai_data`, y comprueba que solo borra datos vencidos (mensajes
de 89 días y contadores de 6 días se conservan).

Control negativo: sin la migración `20260927130000`, fallan
`30-coach-consent-and-purge.sql`, `40-function-privileges.sql` y
`41-handle-new-user-trigger.sql`, con este detalle:

```text
handle_new_user(): PUBLIC tiene EXECUTE
handle_new_user(): anon tiene EXECUTE
handle_new_user(): authenticated tiene EXECUTE
purge_ai_data(integer,integer): anon tiene EXECUTE
purge_ai_data(integer,integer): authenticated tiene EXECUTE
consume_ai_quota(integer): anon tiene EXECUTE
… search_path no es vacío (search_path=public)
```

## Recomendación abierta

Cerrar por defecto las funciones futuras:

```sql
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
```

No se incluye en la migración: obligaría a que cada RPC futura conceda EXECUTE
explícitamente (como ya hacen `register_sheet_draft` y
`project_recurring_templates`) y cambia el comportamiento por defecto del
proyecto. Decisión del propietario; la guarda de `40-function-privileges.sql`
cubre mientras tanto las funciones `security definer`.
