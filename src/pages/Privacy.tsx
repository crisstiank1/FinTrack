import { LegalLayout, LegalList, LegalSection } from '@/components/legal/legal-layout'
import { CONTACT_PLACEHOLDER, LEGAL_DOCUMENTS } from '@/features/legal/documents'

/**
 * Política de privacidad pública.
 *
 * Solo describe lo que el código hace hoy; el origen de cada afirmación está en
 * `docs/17-politica-de-privacidad.md`. La versión es la misma constante que
 * valida el consentimiento del Coach.
 */
export default function Privacy() {
  return (
    <LegalLayout
      document={LEGAL_DOCUMENTS.privacy}
      summary="Qué datos guarda FinTrack, para qué los usa, con qué proveedores y qué puedes hacer con ellos."
    >
      <LegalSection title="Qué es FinTrack">
        <p>
          FinTrack es una aplicación de registro y planificación de finanzas personales. No procesa
          pagos, no administra tarjetas, no ejecuta transferencias y no es una entidad financiera.
          Los movimientos que ves son los que tú registras o importas.
        </p>
      </LegalSection>

      <LegalSection title="Qué datos guarda FinTrack">
        <LegalList
          items={[
            'Datos de acceso: tu correo y, si entras con Google, los datos básicos que Google comparte según los permisos que autorices (como tu correo y tu nombre).',
            'Tu perfil: nombre visible, moneda principal y zona horaria.',
            'Tus datos financieros registrados: cuentas, categorías, movimientos, presupuestos, plan mensual, hojas de borradores y plantillas de movimientos recurrentes.',
            'Si autorizas FinTrack Coach: la fecha y la versión de esa autorización.',
          ]}
        />
        <p>
          Cada consulta a la base de datos solo puede ver las filas de la cuenta con la que
          iniciaste sesión.
        </p>
      </LegalSection>

      <LegalSection title="Proveedores que tratan datos">
        <LegalList
          items={[
            <>
              <strong>Supabase</strong>: base de datos y autenticación. Guarda tu cuenta y tus datos
              financieros.
            </>,
            <>
              <strong>Google</strong>: inicio de sesión con Google (OAuth), solo si eliges ese
              método.
            </>,
            <>
              <strong>Cloudflare</strong>: alojamiento y entrega de la aplicación web.
            </>,
            <>
              <strong>Google Gemini API</strong>: FinTrack puede utilizar Google Gemini API cuando
              FinTrack Coach esté habilitado y el usuario otorgue consentimiento explícito. Hoy
              FinTrack Coach no está habilitado para los usuarios y no se envía nada a Gemini.
            </>,
          ]}
        />
        <p>
          Estos proveedores pueden almacenar o procesar datos fuera de tu país. FinTrack no vende
          tus datos ni los comparte con fines publicitarios.
        </p>
      </LegalSection>

      <LegalSection title="Importación de extractos en CSV">
        <p>
          El archivo CSV se lee en tu navegador. FinTrack no guarda el archivo original ni lo envía
          a ningún servicio de inteligencia artificial. Solo se guardan como borradores las filas
          que decides importar, y ningún borrador se convierte en movimiento hasta que tú lo
          registras.
        </p>
      </LegalSection>

      <LegalSection title="FinTrack Coach">
        <p>
          <strong>FinTrack Coach todavía no está disponible para los usuarios.</strong> Esta sección
          describe cómo tratará tus datos cuando se habilite.
        </p>
        <p>
          Es una herramienta de planificación y educación financiera. No es asesoramiento
          profesional financiero, legal, tributario, contable, crediticio ni de inversión.
        </p>
        <p>
          <strong>Requiere tu consentimiento explícito</strong>, separado de cualquier otra
          aceptación. Sin él, FinTrack no prepara tus cifras para el Coach ni envía nada al
          proveedor. El consentimiento se registra con su fecha y con la versión de esta política;
          si la política cambia, se te volverá a pedir. Puedes retirarlo en Ajustes cuando quieras.
        </p>
        <h3 className="font-semibold">Qué se enviaría</h3>
        <LegalList
          items={[
            'El texto de tu pregunta.',
            'Totales agregados del período y la moneda analizados: ingresos, gastos, ahorro neto, gasto por categoría con su nombre, variaciones frente al mes anterior y estado de presupuestos.',
          ]}
        />
        <h3 className="font-semibold">Qué no se envía nunca</h3>
        <LegalList
          items={[
            'Las descripciones ni las notas de tus movimientos.',
            'Movimientos individuales, nombres de cuentas ni identificadores internos.',
            'Tu correo, tu nombre, tokens de sesión ni datos bancarios.',
            'El contenido de archivos CSV importados.',
          ]}
        />
        <h3 className="font-semibold">Límite de uso e historial</h3>
        <p>
          Para controlar el coste y el abuso habrá un número limitado de consultas por hora. El
          contador solo guarda cuántas consultas hiciste en cada hora. Hoy el Coach no guarda el
          historial de conversaciones. Antes de activarlo se publicarán aquí los plazos de
          conservación y su eliminación.
        </p>
      </LegalSection>

      <LegalSection title="Tus derechos">
        <LegalList
          items={[
            'Acceso: puedes ver todos tus datos en la aplicación y exportar tus movimientos a CSV desde el Libro.',
            'Corrección: puedes editar tu perfil, cuentas, categorías, movimientos y presupuestos.',
            'Eliminación: puedes borrar tus movimientos, borradores y plantillas. La eliminación completa de la cuenta todavía no está disponible dentro de la aplicación; puedes solicitarla por el canal de contacto.',
            'Revocación: puedes retirar el consentimiento de FinTrack Coach en cualquier momento.',
          ]}
        />
      </LegalSection>

      <LegalSection title="Almacenamiento en tu navegador">
        <p>
          FinTrack guarda en tu navegador la sesión y el tema elegido. No usa cookies de analítica
          ni de publicidad. Detalle en{' '}
          <a href={LEGAL_DOCUMENTS.cookies.path} className="underline underline-offset-4">
            Cookies y almacenamiento local
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Contacto">
        <p>{CONTACT_PLACEHOLDER}</p>
      </LegalSection>
    </LegalLayout>
  )
}
