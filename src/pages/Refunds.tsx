import { LegalLayout, LegalSection } from '@/components/legal/legal-layout'
import { LEGAL_DOCUMENTS } from '@/features/legal/documents'

export default function Refunds() {
  return (
    <LegalLayout
      document={LEGAL_DOCUMENTS.refunds}
      summary="Actualmente FinTrack no procesa pagos ni ofrece suscripciones pagas dentro de la aplicación. Por esta razón, no existe un proceso de reembolsos aplicable."
    >
      <LegalSection title="Si esto cambia">
        <p>
          Si en el futuro FinTrack ofrece funciones de pago, las condiciones de cobro y de reembolso
          se publicarán en esta página antes de que se pueda realizar cualquier pago.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
