# FinTrack Coach — Estado

> Página viva de estado. Sustituye a las secciones «Siguiente paso» de los
> documentos de cada fase, que quedan como registro histórico.
>
> **Actualizado:** 2026-09-27.

Plan: `docs/12-fintrack-coach.md`. Detalle por fase: `docs/13-coach-fase-0.md`,
`docs/14-coach-fase-2.md`, `docs/15-coach-fase-3.md`.

---

## Estado por fase

| Fase | Contenido                                                                | Estado                                 |
| ---- | ------------------------------------------------------------------------ | -------------------------------------- |
| 0    | Inventario del esquema real y recorte de alcance de v1                   | Cerrada                                |
| 1    | Lógica de dominio compartida fuera del navegador                         | Cerrada                                |
| 2    | Frontera segura de `finance-chat`: JWT, alcance sin IA, contexto         | Cerrada                                |
| 3    | Proveedor (Gemini vía API compatible con OpenAI), snapshot y validación  | Cerrada                                |
| 4a   | Migración de consentimiento, cuota, historial y purga                    | Aplicada                               |
| 4b   | **Consentimiento real y cuota persistente conectados en `finance-chat`** | **Cerrada en este paso**               |
| 4c   | Historial y `conversationId`                                             | Pendiente, con revisión propia         |
| 4d   | Interfaz de chat y de consentimiento                                     | Pendiente, tras política de privacidad |

## Commits relevantes

| Commit    | Fecha      | Qué                                                                      |
| --------- | ---------- | ------------------------------------------------------------------------ |
| `ebfa524` | 2026-09-17 | Fase 1: dominio compartido (`monthKeyInTimeZone`, etc.)                  |
| `1200aae` | 2026-09-17 | Fase 2: frontera segura de `finance-chat`                                |
| `45b1136` | 2026-09-18 | Exponente por moneda (centavos para USD, ARS…)                           |
| `1ffe7d0` | 2026-09-21 | CI verifica la Edge Function con `deno check`                            |
| `9df97d3` | 2026-09-21 | Fase 3: ruta de IA detrás del consentimiento                             |
| `5c9a6de` | 2026-09-22 | Prompt `fintrack-coach-v3`                                               |
| `fa9fdb3` | 2026-09-23 | Fase 4a: migración de consentimiento, cuota e historial                  |
| `134499a` | 2026-09-27 | Fase 4b: consentimiento real y cuota persistente                         |
| `7298c77` | 2026-09-27 | Versión de consentimiento vigente y política de modelos                  |
| `42cd35b` | 2026-09-27 | Política de privacidad pública en `/privacy`                             |
| `22f2eab` | 2026-09-27 | `docs/16-coach-fase-4.md`: retención, purga y rollback                   |
| `b10df9d` | 2026-09-27 | Arnés SQL (`scripts/test-db.sh`) que también prueba la cuota concurrente |

---

## Capacidades terminadas

- `finance-chat` valida método, CORS, `Authorization` y JWT; el usuario sale
  solo de `auth.getUser()`.
- Filtro de alcance por reglas, antes de cualquier lectura:
  `out_of_scope` y `unsupported_financial_feature` (deuda, metas, fondo de
  emergencia, conversión).
- Contexto por usuario: período con `profiles.timezone`, moneda derivada de las
  cuentas, aclaración si hay varias.
- Snapshot agregado calculado con los mismos módulos que el Dashboard y
  `/budgets`; sin descripciones, notas ni identificadores.
- Redacción por proveedor con validación de referencias: el modelo no puede
  escribir cifras propias.
- **Consentimiento real** leído de `profiles` (nuevo).
- **Cuota persistente y atómica** por usuario y hora (nuevo).

### Recorrido de una pregunta (Fase 4b)

```text
POST finance-chat
  │
  ├─ 1. método y CORS                        (http.ts)
  ├─ 2. cabecera Authorization               → 401
  ├─ 3. JWT con auth.getUser()               → 401
  ├─ 4. cuerpo JSON, message, ≤ 1000 car.    → 400
  ├─ 5. filtro de alcance                    → out_of_scope / unsupported_financial_feature
  ├─ ¿proveedor configurado? ── no ──────────→ coach_context_ready (ruta inerte)
  ├─ 6. consentimiento === true              → consent_required
  ├─ 8a. contexto: zona horaria, moneda      → clarification
  ├─ 7. cuota atómica                        → rate_limited (429) / internal si no se puede comprobar
  ├─ 9. snapshot agregado
  ├─ 10. proveedor                           → provider_error (502), sin reintento
  └─ 11. validación de referencias           → financial_answer / answer_rejected (502)
```

Los pasos 1 a 7 no leen ni un importe. Hasta el paso 7 no se ha consumido
cuota; desde el paso 7 la unidad está consumida aunque el proveedor falle.

### Consentimiento

- `readAIConsent` (`src/features/coach/consent.ts`) lee **solo**
  `ai_consent_at, ai_consent_version` de `profiles`, filtrando por el `id` del
  JWT y con RLS.
- El esquema no tiene un booleano: la migración guarda fecha y versión del
  texto aceptado. «Consentimiento explícito» es **las dos presentes y no
  vacías**. `request.ts` exige además que el comprobador devuelva exactamente
  `true`.
- Bloquean: `null`, `undefined`, `false`, cadena vacía, perfil inexistente,
  error de PostgREST y excepción del cliente.
- Respuesta sin consentimiento, HTTP 200:

```json
{
  "type": "consent_required",
  "message": "Para analizar tus datos financieros con FinTrack Coach, primero debes autorizar el uso de la información necesaria para generar respuestas personalizadas. Puedes cambiar esta decisión en Ajustes cuando quieras."
}
```

### Cuota

- `consumeAIQuota` (`src/features/coach/quota.ts`) hace **una** llamada RPC a
  `consume_ai_quota(p_limit)` y nada más: no lee el contador ni decide por su
  cuenta.
- La función SQL toma el usuario de `auth.uid()` —el mismo JWT—, incrementa y
  decide en una sola sentencia bajo el bloqueo de la fila. Devuelve el consumo o
  `NULL` si ya estaba en el límite.
- Límite: **15 consultas por usuario y hora** (`COACH_HOURLY_LIMIT`), ventana
  fija `date_trunc('hour', now())`.
- `retryAfterSeconds` = segundos hasta la siguiente hora en punto. La función
  SQL no lo devuelve, pero la ventana está fijada en la migración y la sesión de
  PostgreSQL de Supabase está en UTC, así que el cálculo coincide con el de la
  base de datos. Mínimo 1. Viaja en el cuerpo y en la cabecera `Retry-After`:

```json
{
  "type": "error",
  "code": "rate_limited",
  "message": "Alcanzaste el límite temporal de consultas de FinTrack Coach. Inténtalo de nuevo más tarde.",
  "retryAfterSeconds": 2400
}
```

- Si la RPC falla o devuelve algo inesperado, **cierra**: `internal`, sin
  snapshot ni proveedor.

| Consume cuota                                          | No consume cuota                          |
| ------------------------------------------------------ | ----------------------------------------- |
| Pregunta válida que llega al proveedor                 | Sin JWT o JWT inválido                    |
| Aunque el proveedor responda 429, 503, timeout o falle | Cuerpo inválido o mensaje demasiado largo |
| Una sola unidad aunque la validación pida un reintento | Fuera de alcance                          |
|                                                        | Función financiera no soportada           |
|                                                        | Sin consentimiento                        |
|                                                        | Aclaración de moneda o sin cuentas        |
|                                                        | Sin proveedor configurado                 |
|                                                        | Límite ya alcanzado                       |

### Errores del proveedor

| Fallo                      | Respuesta                                                  | Reintento                                       |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| HTTP 429 / 503 / otro HTTP | `provider_error`, 502, mensaje genérico                    | No                                              |
| Tiempo agotado (30 s)      | `provider_error`, 502, «tardó demasiado»                   | No                                              |
| Red / excepción inesperada | `provider_error`, 502, mensaje genérico                    | No                                              |
| Redacción inválida         | Un reintento con correcciones; si falla, `answer_rejected` | Uno, por validación, no por fallo del proveedor |

El cuerpo de error solo lleva `type`, `code` y `message`: ni el código HTTP del
proveedor, ni la clave, ni el prompt, ni el snapshot.

---

## Límites explícitos de v1

No implementa ni simula: deudas (saldo, tasa, cuota mínima, avalancha, bola de
nieve), metas con monto y fecha, fondo de emergencia personalizado, conversión
de monedas, recomendaciones de inversión o predicciones, asesoramiento
tributario, legal o crediticio, ni ninguna escritura de datos financieros.

---

## Validaciones realizadas (Fase 4b)

| Comprobación                                                     | Resultado                                                                                                                                                                                        |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run test`                                                   | 89 archivos, 1618 pruebas, todas en verde (antes: 88 y 1569)                                                                                                                                     |
| `bun run typecheck` (`tsc -b`)                                   | Sin errores                                                                                                                                                                                      |
| `bun run lint`                                                   | 0 errores (2 avisos previos en `auth-provider.tsx`, ajenos a este cambio)                                                                                                                        |
| `bun run build`                                                  | Correcto                                                                                                                                                                                         |
| `bun run check:functions`                                        | Correcto. Comprobado que recorre `quota.ts`, `consent.ts` y `request.ts`: un error de tipo inyectado en cada uno lo hace fallar                                                                  |
| Mutaciones                                                       | Aceptar consentimiento «verdadoso», saltarse la cuota o consumirla antes del contexto hacen fallar las pruebas                                                                                   |
| Atomicidad real en PostgreSQL 16 local con la migración aplicada | 40 llamadas concurrentes con límite 15: exactamente 15 concedidas (1…15), 25 `NULL`, contador final 15. Otro usuario no se ve afectado. Sin sesión, la función lanza; `anon` no puede ejecutarla |

La prueba de concurrencia de la suite usa un doble que reproduce la semántica
de la función SQL; la atomicidad real se comprobó aparte contra PostgreSQL,
porque CI no levanta una base de datos.

---

### Validaciones del cierre (2026-09-27)

| Comprobación                         | Resultado                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `bun run test`                       | 97 archivos, 1723 pruebas en verde                                                                          |
| `bun run typecheck`, `lint`, `build` | Sin errores (2 avisos previos de ESLint)                                                                    |
| `bun run check:functions`            | Correcto; incluye `model-policy.ts`                                                                         |
| `scripts/test-db.sh` (PostgreSQL 16) | Todas las migraciones aplican en limpio; SQL y concurrencia en verde; 40 consumos simultáneos de cuota → 15 |
| `/privacy` en Chromium a 390 px      | Renderiza sin errores ni scroll horizontal                                                                  |

## Hallazgos y correcciones no planificadas

1. **El consentimiento no es un booleano.** La especificación de este paso
   habla de `consent_for_ai_analysis === true`, pero la migración aplicada
   guarda `ai_consent_at` y `ai_consent_version`. No se modificó la migración:
   el booleano se deriva de las dos columnas.
2. **Orden cuota/contexto.** Consumir la cuota antes de resolver el contexto
   cobraría una unidad por una aclaración de moneda, que no llama al proveedor.
   La cuota se aplica tras el contexto (que solo lee metadatos: zona horaria,
   monedas de las cuentas y si hay presupuestos) y antes del snapshot.
3. **`deno.json` es una lista cerrada.** Un módulo nuevo en `src/features/coach`
   necesita su entrada en el mapa de imports; sin ella, `check:functions` falla.
4. **Referencia rota en la migración.** Su cabecera cita
   `docs/16-coach-fase-4.md` para el rollback manual y el procedimiento de
   purga, y ese documento no existía. Creado el 2026-09-27.

## Bloqueos externos

- **Proveedor de producción y facturación.** En el plan gratuito de Gemini los
  datos enviados pueden usarse para mejorar productos y leerse por revisores
  humanos (`docs/15-coach-fase-3.md`). Hace falta el plan de pago u otro
  proveedor antes de abrir la ruta a usuarios reales.
- **Política de privacidad** publicada, antes de pedir consentimiento visible.

## Decisiones tomadas en el cierre de la Fase 4

| Decisión                                  | Resolución                                                                        |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| Versión del consentimiento                | Debe coincidir con `CURRENT_AI_CONSENT_VERSION` (`2026-09-27`)                    |
| Orden cuota/contexto                      | Contexto ligero antes de la cuota; aclaraciones no consumen                       |
| Reintento por validación                  | Cuenta dentro de la misma unidad                                                  |
| Fallo del snapshot tras conceder la cuota | La unidad se consume; sin devolución                                              |
| Parámetros del proveedor                  | Temperatura 0,1; 400 tokens; modelos preview, `latest`, imagen y audio rechazados |
| Documento de retención, purga y rollback  | `docs/16-coach-fase-4.md`                                                         |
| Política de privacidad                    | Pública en `/privacy`; fuente en `docs/17-politica-de-privacidad.md`              |

## Decisiones abiertas

1. **Programación de la purga**: `pg_cron` o programador externo.
2. **Límite de 15/hora**: constante en código; decidir si pasa a secreto.
3. **Canal de contacto** y revisión legal de la política antes de activar.

## Próximo paso autorizado

Ninguno en curso para el Coach. La interfaz de consentimiento y revocación ya
existe en Ajustes (`src/features/coach-consent/`). Pendientes, cada uno con
revisión propia:

1. **Bloqueante:** aplicar `20260927130000_restringir_funciones_coach.sql`
   (fallo crítico de permisos en `purge_ai_data`, auditoría en
   `docs/22-auditoria-security-definer.md`, procedimiento en
   `docs/23-procedimiento-aplicacion-remota.md`) y programar la purga
   (`pg_cron`). Nada más del Coach avanza hasta cerrar esto.
2. Historial y `conversationId` (`docs/16-coach-fase-4.md` §7).
3. Interfaz de chat.
4. Activación: facturación del proveedor, secretos y despliegue, con
   instrucción explícita.

No se ha aceptado `conversationId`, no se guardan mensajes y no existe
interfaz de chat ni de consentimiento.
