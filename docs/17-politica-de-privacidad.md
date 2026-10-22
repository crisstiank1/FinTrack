# Política de privacidad — fuente y mantenimiento

La política pública vive en `src/pages/Privacy.tsx`, ruta `/privacy`, sin
sesión. Junto a `/terms`, `/cookies` y `/refunds` se enlaza desde el pie de
todas las pantallas (`SiteFooter`), desde el registro y desde Ajustes.

Los plazos de 90 días (mensajes) y 7 días (contadores) se retiraron del texto
público: `purge_ai_data` existe pero no está programada, así que no son
verificables hasta que la purga sea operativa.

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
| Contador solo por hora; plazos no publicados aún     | `consume_ai_quota`; purga no programada (`docs/16`)    |
| Hoy no se guarda historial                           | `boundaries.test.ts`                                   |
| Proveedores: Supabase, Google OAuth, Cloudflare      | Cliente Supabase, `signInWithOAuth`, alojamiento       |
| Gemini solo condicional                              | Coach no habilitado; sin secretos ni UI de chat        |
| Solo almacenamiento necesario                        | `storage-inventory.test.ts`                            |
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
