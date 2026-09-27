# Permisos de funciones: auditoría y postura deny-by-default

> 2026-09-27. Alcance: todas las funciones del esquema `public` creadas por
> `supabase/migrations/`. Corrección: `20260927130000_restringir_funciones_coach.sql`
> (**pendiente de aplicar en el proyecto remoto**). Verificación automática y de
> solo lectura: `supabase/tests/db/40-function-privileges.sql`.

## 1. El problema

PostgreSQL concede EXECUTE a PUBLIC al crear una función. Supabase, además,
tiene privilegios por defecto en el esquema `public` que conceden EXECUTE
**con nombre** a `anon`, `authenticated` y `service_role`. `revoke … from
public` retira solo la concesión a PUBLIC: la función sigue siendo invocable
por la API REST (`/rest/v1/rpc/<función>`), con o sin sesión.

Por eso `purge_ai_data` —`security definer`, borra datos de todos los
usuarios— era invocable por cualquiera: `purge_ai_data(0, 0)` vaciaba
contadores de cuota e historial del Coach de todos y anulaba el límite de uso.

Referencias: documentación de Supabase sobre funciones de base de datos;
issue `supabase/supabase#49338`.

## 2. Permisos esperados de cada función

Estado **después** de `20260927130000`. Es la misma lista que valida
`40-function-privileges.sql`: cualquier función que no esté aquí, o que se
desvíe, hace fallar la prueba.

| Función                              | Modo              | Por qué ese modo                                                                                  | `search_path` | EXECUTE (API)   | Usa `auth.uid()` | ¿Datos de otros usuarios?         |
| ------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------- | ------------- | --------------- | ---------------- | --------------------------------- |
| `purge_ai_data(integer, integer)`    | definer           | Borra filas de todos los usuarios; ningún rol de la API debe poder hacerlo                        | `''`          | **Ninguno**     | No               | **Sí, de todos**                  |
| `handle_new_user()`                  | definer           | Trigger de `auth.users`: inserta en `profiles` sin sesión de usuario                              | `''`          | **Ninguno**     | No               | Solo el perfil del usuario creado |
| `consume_ai_quota(integer)`          | definer           | `authenticated` no puede escribir `ai_usage_counters` (a propósito); decide con la fila bloqueada | `''`          | `authenticated` | **Sí**           | No                                |
| `register_sheet_draft(uuid)`         | invoker           | Sujeta a RLS con el usuario que llama                                                             | `''`          | `authenticated` | Sí               | No                                |
| `project_recurring_templates(text)`  | invoker           | Sujeta a RLS con el usuario que llama                                                             | `''`          | `authenticated` | Sí               | No                                |
| `set_updated_at()`                   | invoker (trigger) | Solo modifica la fila en curso                                                                    | `''`          | Ninguno         | No               | No                                |
| `validate_transaction()`             | invoker (trigger) | Solo valida                                                                                       | `''`          | Ninguno         | No               | No                                |
| `validate_budget()`                  | invoker (trigger) | Solo valida                                                                                       | `''`          | Ninguno         | No               | No                                |
| `validate_category_classification()` | invoker (trigger) | Solo valida                                                                                       | `''`          | Ninguno         | No               | No                                |
| `validate_income_source_category()`  | invoker (trigger) | Solo valida                                                                                       | `''`          | Ninguno         | No               | No                                |
| `validate_plan_line()`               | invoker (trigger) | Solo valida                                                                                       | `''`          | Ninguno         | No               | No                                |
| `check_plan_allocations_sum()`       | invoker (trigger) | Solo valida                                                                                       | `''`          | Ninguno         | No               | No                                |
| `validate_recurring_template()`      | invoker (trigger) | Solo valida                                                                                       | `''`          | Ninguno         | No               | No                                |
| `clear_draft_generated_month()`      | invoker (trigger) | Solo modifica la fila en curso                                                                    | `''`          | Ninguno         | No               | No                                |

PUBLIC no tiene EXECUTE en ninguna. `service_role` conserva sus concesiones:
es un rol de servidor que ya ignora RLS y nunca se usa desde el navegador.

### Estado anterior

| Función            | EXECUTE antes (Supabase)              | `search_path` antes                                               | Riesgo                                          |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| `purge_ai_data`    | `anon`, `authenticated` (por defecto) | `public`                                                          | **Crítico**                                     |
| `handle_new_user`  | PUBLIC, `anon`, `authenticated`       | `public`                                                          | Bajo: fuera de un trigger PostgreSQL la rechaza |
| `consume_ai_quota` | `authenticated`, `anon`               | `public`                                                          | Bajo: sin sesión lanza                          |
| Triggers           | PUBLIC, `anon`, `authenticated`       | `''`, salvo `set_updated_at` y `validate_transaction` (sin fijar) | Bajo: no invocables fuera de un trigger         |
| RPC invoker        | `authenticated`                       | `''`                                                              | Ninguno                                         |

### Por qué revocar a los triggers no rompe nada

PostgreSQL comprueba EXECUTE sobre la función de un trigger al **crear** el
trigger, no al dispararlo. Lo prueba `41-handle-new-user-trigger.sql`:

- un rol sin privilegios ni EXECUTE inserta en `auth.users` y el perfil se
  crea;
- un usuario `authenticated` inserta un movimiento y un presupuesto, y
  actualiza su perfil: `validate_transaction`, `validate_budget` y
  `set_updated_at` se disparan, y `validate_transaction` sigue rechazando una
  categoría de otro tipo.

`10-recurring-templates.sql` cubre además `validate_recurring_template`,
`clear_draft_generated_month` y `register_sheet_draft` como `authenticated`.

## 3. Deny-by-default para funciones futuras

`ALTER DEFAULT PRIVILEGES` solo afecta a los objetos que crea **el rol
indicado**. No se asume cuál es:

- el repositorio no fija con qué rol se aplican las migraciones;
- la CLI de Supabase usa su propio rol de sesión (`cli_login_postgres`) al
  conectarse al proyecto.

La migración lo configura, en un bloque `do`, para:

1. `current_user`, el rol que realmente ejecuta la migración (el que creará
   las funciones de las migraciones siguientes aplicadas del mismo modo); y
2. el propietario real de las funciones existentes (el de `purge_ai_data`),
   si es otro.

En dos niveles, porque PostgreSQL los combina:

| Nivel                    | Qué quita                                                    | Por qué                                                                                     |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Global (sin `IN SCHEMA`) | EXECUTE de PUBLIC (y de `anon`/`authenticated` si existiera) | El EXECUTE a PUBLIC es un valor por defecto global; un revoke por esquema no puede quitarlo |
| Esquema `public`         | EXECUTE de `anon` y `authenticated`                          | Es donde Supabase añade esas concesiones                                                    |

Si no puede configurarse para el propietario (falta de pertenencia al rol),
la migración avisa con un `WARNING` y continúa: los revokes de las funciones
existentes son lo urgente, y la verificación posterior fallará.

**Verificado localmente** (PostgreSQL 16):

- aplicando la migración como superusuario;
- aplicando la migración como un rol **no superusuario** miembro de
  `postgres`, distinto del propietario: configura ambos roles, y una función
  creada después por ese rol no es ejecutable por `anon` ni `authenticated`.

`40-function-privileges.sql` comprueba en modo lectura que el propietario de
las funciones de `public` tiene fila global de privilegios por defecto sin
PUBLIC y que ni ella ni la de `public` conceden EXECUTE a `anon` o
`authenticated`. `42-default-function-privileges.sql` lo comprueba en la
práctica creando y borrando una función de prueba.

### Límites

- **Otros roles creadores.** Funciones creadas por `supabase_admin` (panel,
  extensiones gestionadas por Supabase) no se ven afectadas: no son de este
  repositorio.
- **Extensiones creadas por migración.** Si una migración futura hace
  `create extension` con el rol configurado, sus funciones también nacerán sin
  EXECUTE para PUBLIC. Tras crear una extensión, conceder explícitamente lo
  que necesite y ejecutar `40-function-privileges.sql`.
- **Cambio de rol de despliegue.** Si en el futuro las migraciones se
  aplicaran con otro rol, habría que repetir el bloque para ese rol. La
  verificación posterior al despliegue lo detecta.

## 4. Reglas obligatorias para toda función nueva

A partir de `20260927130000`, cada `create function` en `public` debe:

```sql
-- Propósito: <qué hace>.
-- Modo: security invoker, porque <razón>.   -- o definer, con su justificación
create function public.mi_funcion(p_x text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Todas las referencias calificadas: public.tabla, auth.uid(), …
end;
$$;

revoke all on function public.mi_funcion(text) from public, anon, authenticated;
grant execute on function public.mi_funcion(text) to authenticated;  -- solo si es RPC de usuario

comment on function public.mi_funcion(text) is '…';
```

Y en el mismo cambio:

1. Añadirla a `c_expected` en `40-function-privileges.sql` con su modo y sus
   roles.
2. Añadirla a la tabla de la sección 2.
3. Pruebas SQL de permisos: qué rol puede y cuál no (como
   `30-coach-consent-and-purge.sql` o `10-recurring-templates.sql`).

Criterios:

- **`security invoker` por defecto.** `security definer` solo con una razón
  escrita (p. ej. escribir en una tabla que el usuario no puede tocar) y
  usando `auth.uid()`, nunca un parámetro, para identificar al usuario.
- **`anon` nunca** sin justificación explícita, revisión de seguridad y una
  prueba específica que lo cubra. Hoy ninguna función la tiene.
- **Nada que toque datos de varios usuarios** debe ser ejecutable por la API.

## 5. Guardas

| Prueba                               | Tipo                           | Falla si                                                                                                                                                     |
| ------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `40-function-privileges.sql`         | Solo lectura; apta para remoto | Una función no está auditada; modo, `search_path` o roles distintos a los esperados; PUBLIC con EXECUTE; privilegios por defecto que abren funciones futuras |
| `42-default-function-privileges.sql` | Local/CI                       | Una función nueva es ejecutable por PUBLIC, `anon` o `authenticated` sin concesión explícita                                                                 |
| `30-coach-consent-and-purge.sql`     | Local/CI                       | `anon` o `authenticated` ejecutan `purge_ai_data`, o la purga borra datos no vencidos                                                                        |
| `41-handle-new-user-trigger.sql`     | Local/CI                       | El alta o los triggers dejan de funcionar tras los revokes                                                                                                   |

Controles negativos ejecutados:

- Sin el bloque deny-by-default fallan `40` («no tiene privilegios por defecto
  globales», «concede EXECUTE en public a anon/authenticated») y `42`.
- Sin el revoke de un trigger (`validate_budget`) falla `40` con
  «PUBLIC/anon/authenticated tiene EXECUTE».
- Sin la migración completa fallan `30`, `40`, `41` y `42`.
