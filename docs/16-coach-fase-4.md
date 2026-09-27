# FinTrack Coach — Fase 4: consentimiento, cuota, retención y purga

> Controles que deben cumplirse antes de que el Coach envíe un solo dato a un
> proveedor. Migración: `20260923120000_crear_coach_consentimiento_cuota_historial.sql`.
> Estado vigente: `docs/15-fintrack-coach-status.md`.

---

## 1. Consentimiento

### Esquema

`profiles` gana dos columnas, sin tabla aparte:

| Columna              | Tipo          | Significado                                      |
| -------------------- | ------------- | ------------------------------------------------ |
| `ai_consent_at`      | `timestamptz` | Cuándo aceptó. `NULL` = no aceptado              |
| `ai_consent_version` | `text`        | Versión del texto aceptado (fecha de `/privacy`) |

`profiles_ai_consent_pair_check` exige que vayan las dos o ninguna. **Revocar es
poner las dos a `NULL`**; no hay columna de revocación separada.

### Regla de validez

`hasExplicitConsent` (`src/features/coach/consent.ts`) devuelve `true` solo si:

1. `ai_consent_at` es una fecha válida no vacía, y
2. `ai_consent_version === CURRENT_AI_CONSENT_VERSION` (hoy `2026-09-27`).

`request.ts` exige además que el comprobador devuelva exactamente `true`. Un
perfil inexistente, un error de lectura, una excepción, `null`, `false`, una
cadena vacía o **una versión anterior** bloquean.

`CURRENT_AI_CONSENT_VERSION` es la misma constante que muestra `/privacy`.
Cambiar la política exige subirla, y eso invalida todos los consentimientos
anteriores: el usuario debe aceptar de nuevo lo que hoy se hace con sus datos.

### Efecto

Sin consentimiento válido: `consent_required` (HTTP 200), sin leer datos
financieros, sin consumir cuota y sin llamar al proveedor.

### Pendiente

No existe todavía interfaz para aceptar o revocar. Hasta que exista, ningún
usuario tiene consentimiento válido y la ruta de IA es inalcanzable en
producción aunque se configuren los secretos. La interfaz debe escribir
`ai_consent_at = now()` y `ai_consent_version = CURRENT_AI_CONSENT_VERSION`
juntas, y revocar poniendo ambas a `NULL`; las políticas de `profiles` ya
permiten que el usuario actualice su propia fila.

---

## 2. Cuota

| Parámetro       | Valor                                                               |
| --------------- | ------------------------------------------------------------------- |
| Límite          | 15 consultas por usuario y hora (`COACH_HOURLY_LIMIT`)              |
| Ventana         | Fija: `date_trunc('hour', now())`                                   |
| Llave           | `auth.uid()` del JWT; nunca un parámetro del cliente                |
| Decisión        | `consume_ai_quota(p_limit)`, una sola sentencia atómica             |
| Al superarla    | HTTP 429, `code: rate_limited`, `retryAfterSeconds` y `Retry-After` |
| Si falla la RPC | Cierra: `internal`, sin snapshot ni proveedor                       |

### Orden en `finance-chat`

```text
1 método/CORS → 2 Authorization → 3 JWT → 4 cuerpo y tamaño → 5 alcance
→ 6 consentimiento → 7 contexto ligero → 8 aclaración (sin cuota)
→ 9 cuota → 10 snapshot → 11 proveedor → 12 validación
```

El contexto ligero (`resolveCoachContext`) lee `profiles.timezone`,
`profiles.currency_code`, `accounts.currency_code` y un `count` de `budgets`
con `head: true`. Ningún importe, movimiento, descripción ni categoría.

### Consume / no consume

| No consume                                | Consume (una unidad)                          |
| ----------------------------------------- | --------------------------------------------- |
| JWT ausente o inválido                    | Solicitud aceptada para procesamiento de IA   |
| Cuerpo inválido o mensaje demasiado largo | …aunque falle después la lectura del snapshot |
| Fuera de alcance                          | …aunque el proveedor responda 429 o 503       |
| Función financiera no soportada           | …aunque haya timeout, error de red o HTTP     |
| Consentimiento ausente o inválido         | …aunque la respuesta del modelo sea inválida  |
| Aclaración de moneda o sin cuentas        | …con el reintento por validación incluido     |
| Proveedor no configurado                  |                                               |
| Límite ya alcanzado                       |                                               |

No hay devolución de cuota ni reintentos por fallo del proveedor.

### Atomicidad

`insert … on conflict (user_id, window_start) do update set message_count =
message_count + 1 where message_count < p_limit returning message_count`. Con
la fila bloqueada, la segunda petición ve el valor ya incrementado. Verificado
en PostgreSQL 16 local con la migración aplicada: 40 llamadas concurrentes con
límite 15 dejan exactamente 15 concedidas y el contador en 15.

---

## 3. Proveedor

| Secreto de Supabase  | Valor previsto                                            |
| -------------------- | --------------------------------------------------------- |
| `COACH_LLM_PROVIDER` | `gemini` (solo trazabilidad)                              |
| `COACH_LLM_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `COACH_LLM_MODEL`    | `gemini-3.1-flash-lite`                                   |
| `COACH_LLM_API_KEY`  | secreto; nunca en el repositorio ni en variables `VITE_*` |

- Temperatura 0,1 y 400 tokens de salida.
- JSON obligatorio (`response_format: json_object`) y validación de
  referencias posterior.
- La petición solo lleva `model`, `messages`, `max_tokens`, `temperature` y
  `response_format`: sin herramientas, búsqueda ni grounding.
- `isAllowedCoachModel` rechaza identificadores con `preview`, `exp`,
  `experimental`, `latest`, `image`, `imagen`, `audio`, `tts` o `live`. Con un
  modelo rechazado la función queda inerte, igual que sin secretos.
- **Antes de activar**: confirmar en la consola del proveedor que el modelo
  elegido es estable (no preview) y que el proyecto tiene facturación activa;
  en el plan sin pago los datos enviados pueden usarse para mejorar productos
  (`docs/15-coach-fase-3.md`).

---

## 4. Retención

| Dato                            | Retención                 | Mecanismo          |
| ------------------------------- | ------------------------- | ------------------ |
| `ai_usage_counters`             | 7 días                    | `purge_ai_data`    |
| `ai_messages`                   | 90 días                   | `purge_ai_data`    |
| `ai_conversations` sin mensajes | 90 días sin actividad     | `purge_ai_data`    |
| Snapshot enviado al proveedor   | No se guarda              | —                  |
| Consentimiento                  | Mientras exista el perfil | Borrado en cascada |

Hoy `finance-chat` no escribe en `ai_conversations` ni en `ai_messages`: el
historial está en el esquema, no en el flujo. Una prueba de frontera impide
que el backend del Coach mencione esas tablas o `conversationId`.

---

## 5. Purga

`public.purge_ai_data(p_message_days default 90, p_counter_days default 7)` es
`security definer` y **no la puede ejecutar ningún usuario final** (`revoke …
from public`). Devuelve cuántas filas borró de cada tabla.

Ejecución manual, desde el editor SQL del proyecto con un rol de
administración:

```sql
select * from public.purge_ai_data();
```

Programación: pendiente. Requiere decidir entre `pg_cron` (extensión del
proyecto) y un programador externo. Hasta entonces, ejecutarla al menos una vez
por semana mientras el Coach esté activo.

---

## 6. Rollback manual de la migración

Solo forward en el repositorio. Si hubiera que retirarla, en este orden, dentro
de una transacción y tras exportar lo que se quiera conservar:

```sql
begin;
drop function if exists public.purge_ai_data(integer, integer);
drop function if exists public.consume_ai_quota(integer);
drop table if exists public.ai_messages;
drop table if exists public.ai_conversations;
drop table if exists public.ai_usage_counters;
alter table public.profiles drop constraint if exists profiles_ai_consent_pair_check;
alter table public.profiles
  drop column if exists ai_consent_version,
  drop column if exists ai_consent_at;
commit;
```

Antes, desplegar una versión de `finance-chat` que no llame a
`consume_ai_quota` ni lea `ai_consent_*`, o dejarla sin secretos del proveedor
(ruta inerte): con la migración retirada, la lectura de consentimiento falla y
**cierra**, así que no se envía nada, pero todas las preguntas con datos
responderían `consent_required`.

---

## 7. Historial y `conversationId`: pendiente

No implementado a propósito. Antes de conectarlo hace falta una fase propia
que defina:

- contrato de entrada de `conversationId` y validación de propiedad;
- inserción de mensajes con el cliente del usuario (RLS) y la FK compuesta;
- metadatos mínimos permitidos (nunca el snapshot);
- borrado por el usuario y su interfaz;
- programación de la purga.
