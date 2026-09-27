# Política de privacidad — fuente y mantenimiento

La política pública vive en `src/pages/Privacy.tsx`, ruta `/privacy`, sin
sesión. Se enlaza desde la pantalla de acceso y desde Ajustes.

## Versión

La versión mostrada es `CURRENT_AI_CONSENT_VERSION`
(`src/features/coach/consent.ts`). Es la misma que valida `finance-chat`: si
el texto cambia de forma material, hay que subir la constante, y todos los
consentimientos anteriores dejan de valer.

## De dónde sale cada afirmación

| Afirmación                                           | Respaldo en el código                                  |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Acceso por usuario                                   | RLS en todas las tablas de `supabase/migrations`       |
| El CSV se lee en el navegador y no se guarda         | `src/features/csv-import` (sin Storage ni envío)       |
| Ningún borrador se registra solo                     | `register_sheet_draft` solo lo llama la interfaz       |
| El Coach requiere consentimiento explícito y vigente | `consent.ts`, `request.ts`, `consent-quota.test.ts`    |
| Proveedor: API de Gemini                             | `docs/16-coach-fase-4.md` §3                           |
| Qué se envía                                         | `snapshot.ts`, `prompt.ts`, `ai-path.test.ts`          |
| No se envían descripciones, notas ni identificadores | `loadSnapshotData` nombra columnas; pruebas de envío   |
| Sin búsqueda ni herramientas                         | `openai-compatible.test.ts` fija las claves del cuerpo |
| Contador por hora, 7 días                            | `consume_ai_quota`, `purge_ai_data`                    |
| Historial 90 días, hoy no se guarda                  | `purge_ai_data`; `boundaries.test.ts`                  |
| No crea movimientos automáticamente                  | CSV y recurrentes solo crean borradores                |

## Lo que la página no afirma

- Nada sobre las políticas internas de Google más allá de nombrar el
  proveedor: no hay en el proyecto una confirmación de facturación ni de los
  términos del plan contratado.
- No promete eliminación de la cuenta completa: no existe ese flujo.

## Pendiente antes de activar el Coach

1. Confirmar facturación activa del proveedor y el modelo estable elegido.
2. Añadir un canal de contacto del responsable del tratamiento.
3. Revisión legal del texto para las jurisdicciones de los usuarios.
4. Interfaz de consentimiento y revocación en Ajustes; quitar entonces el aviso
   de «todavía no está disponible».
