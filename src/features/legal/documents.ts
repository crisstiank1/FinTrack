/**
 * Versión y vigencia de cada documento legal público.
 *
 * La política de privacidad comparte versión con el consentimiento del Coach
 * (`CURRENT_AI_CONSENT_VERSION`): cambiarla obliga a pedirlo de nuevo.
 */
import { CURRENT_AI_CONSENT_VERSION } from '@/features/coach/consent'

export interface LegalDocument {
  path: string
  title: string
  version: string
  /** Fecha de vigencia, 'YYYY-MM-DD'. */
  effectiveDate: string
}

export const LEGAL_DOCUMENTS = {
  privacy: {
    path: '/privacy',
    title: 'Política de privacidad',
    version: CURRENT_AI_CONSENT_VERSION,
    effectiveDate: CURRENT_AI_CONSENT_VERSION,
  },
  terms: {
    path: '/terms',
    title: 'Términos de uso',
    version: '2026-09-27',
    effectiveDate: '2026-09-27',
  },
  cookies: {
    path: '/cookies',
    title: 'Cookies y almacenamiento local',
    version: '2026-09-27',
    effectiveDate: '2026-09-27',
  },
  refunds: {
    path: '/refunds',
    title: 'Reembolsos',
    version: '2026-09-27',
    effectiveDate: '2026-09-27',
  },
} as const satisfies Record<string, LegalDocument>

/**
 * Texto visible mientras el propietario no defina el canal de contacto. Es un
 * marcador deliberado: inventar un correo o una dirección sería peor.
 */
export const CONTACT_PLACEHOLDER =
  'Canal de contacto pendiente de publicar por el responsable de FinTrack.'
