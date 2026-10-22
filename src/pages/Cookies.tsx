import { LegalLayout, LegalSection } from '@/components/legal/legal-layout'
import { LEGAL_DOCUMENTS } from '@/features/legal/documents'

/**
 * Inventario verificado en el código (`docs/legal-and-privacy-risk-register.md`).
 * Si se añade cualquier tecnología nueva, esta tabla y el registro de riesgos
 * deben actualizarse en el mismo cambio.
 */
const ITEMS = [
  {
    name: 'fintrack-theme',
    kind: 'Almacenamiento local',
    purpose: 'Recordar si elegiste tema claro u oscuro.',
    duration: 'Hasta que lo borres',
  },
  {
    name: 'sb-…-auth-token',
    kind: 'Almacenamiento local',
    purpose: 'Mantener tu sesión iniciada (Supabase Auth).',
    duration: 'Hasta cerrar sesión o que la sesión caduque',
  },
]

export default function Cookies() {
  return (
    <LegalLayout
      document={LEGAL_DOCUMENTS.cookies}
      summary="FinTrack solo usa almacenamiento estrictamente necesario para funcionar. No usa cookies de analítica, publicidad ni seguimiento."
    >
      <LegalSection title="Qué guardamos en tu navegador">
        <div className="relative overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Tecnologías de almacenamiento que usa FinTrack</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Nombre
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Tipo
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Para qué
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Duración
                </th>
              </tr>
            </thead>
            <tbody>
              {ITEMS.map((item) => (
                <tr key={item.name} className="border-t border-border align-top">
                  <th scope="row" className="px-3 py-2 font-mono text-xs font-normal">
                    {item.name}
                  </th>
                  <td className="px-3 py-2">{item.kind}</td>
                  <td className="px-3 py-2">{item.purpose}</td>
                  <td className="px-3 py-2">{item.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Todo es estrictamente necesario: sin la sesión no puedes usar la aplicación, y el tema es
          una preferencia que tú eliges. Por eso no mostramos un aviso de consentimiento de cookies.
        </p>
      </LegalSection>

      <LegalSection title="Qué no usamos">
        <p>
          FinTrack no carga Google Analytics, Tag Manager, píxeles de publicidad, mapas de calor,
          herramientas de seguimiento de errores con datos personales ni widgets de terceros.
        </p>
      </LegalSection>

      <LegalSection title="Servicios de terceros">
        <p>
          Si inicias sesión con Google, esa pantalla la muestra Google en su propio dominio y se
          rige por sus políticas. La aplicación se entrega a través de Cloudflare, que puede tratar
          datos técnicos de la conexión para protegerla.
        </p>
      </LegalSection>

      <LegalSection title="Cómo borrarlo">
        <p>
          Cerrar sesión elimina la sesión guardada. También puedes borrar los datos del sitio desde
          la configuración de tu navegador; después tendrás que volver a iniciar sesión.
        </p>
      </LegalSection>
    </LegalLayout>
  )
}
