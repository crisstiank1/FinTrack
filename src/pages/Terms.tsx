import { LegalLayout, LegalList, LegalSection } from '@/components/legal/legal-layout'
import { CONTACT_PLACEHOLDER, LEGAL_DOCUMENTS } from '@/features/legal/documents'

export default function Terms() {
  return (
    <LegalLayout
      document={LEGAL_DOCUMENTS.terms}
      summary="Condiciones para usar FinTrack. Al usar la aplicación aceptas estos términos; si no estás de acuerdo, no la uses."
    >
      <LegalSection title="Qué es y qué no es FinTrack">
        <p>FinTrack es una herramienta de registro y planificación de finanzas personales.</p>
        <LegalList
          items={[
            'No procesa pagos ni transferencias reales, y no mueve dinero.',
            'No administra tarjetas ni cuentas bancarias.',
            'No es una entidad financiera, bancaria ni de pagos.',
            'No ofrece asesoramiento profesional financiero, legal, tributario, contable, crediticio ni de inversión.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Tus registros">
        <p>
          Las cifras, saldos, presupuestos y análisis se calculan a partir de lo que tú registras o
          importas. Eres responsable de revisar que tus registros sean correctos. FinTrack no crea
          movimientos reales por su cuenta: los importados y los recurrentes llegan como borradores
          que tú revisas y registras.
        </p>
      </LegalSection>

      <LegalSection title="FinTrack Coach">
        <p>
          Cuando esté disponible, FinTrack Coach ofrecerá orientación general de planificación y
          educación financiera basada solo en tus datos registrados. Puede equivocarse o estar
          incompleto, no conoce tu situación fuera de FinTrack y no sustituye a un profesional. Las
          decisiones que tomes son tuyas.
        </p>
      </LegalSection>

      <LegalSection title="Uso permitido">
        <p>No está permitido:</p>
        <LegalList
          items={[
            'Acceder o intentar acceder a datos de otras personas.',
            'Eludir los límites de uso, la autenticación o las medidas de seguridad.',
            'Usar FinTrack para actividades ilícitas o para registrar datos de terceros sin autorización.',
            'Automatizar el uso de forma que degrade el servicio para otros usuarios.',
            'Intentar manipular FinTrack Coach para obtener contenido ajeno a su finalidad.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Propiedad intelectual">
        <p>
          El software, la marca y los contenidos de FinTrack pertenecen a su titular. Tus datos son
          tuyos: FinTrack solo los usa para prestarte el servicio, como explica la política de
          privacidad.
        </p>
      </LegalSection>

      <LegalSection title="Disponibilidad y responsabilidad">
        <p>
          FinTrack se ofrece tal como está. Trabajamos para que funcione de forma correcta y segura,
          pero no podemos garantizar que esté siempre disponible ni libre de errores. En la medida
          en que la ley aplicable lo permita, FinTrack no responde por decisiones tomadas a partir
          de la información mostrada ni por pérdidas derivadas de registros incorrectos.
        </p>
      </LegalSection>

      <LegalSection title="Suspensión y cambios">
        <p>
          Podemos suspender el acceso de una cuenta que incumpla estos términos o ponga en riesgo el
          servicio. Podemos cambiar, ampliar o retirar funciones; los cambios importantes de estos
          términos se publicarán en esta página con una nueva versión y fecha.
        </p>
      </LegalSection>

      <LegalSection title="Ley aplicable">
        <p>Pendiente de definir por el responsable de FinTrack.</p>
      </LegalSection>

      <LegalSection title="Contacto">
        <p>{CONTACT_PLACEHOLDER}</p>
      </LegalSection>
    </LegalLayout>
  )
}
