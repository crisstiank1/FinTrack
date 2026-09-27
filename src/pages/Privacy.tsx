import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { Logo } from '@/components/shared/logo'
import { CURRENT_AI_CONSENT_VERSION } from '@/features/coach/consent'

/**
 * Política de privacidad pública.
 *
 * Es una ruta sin sesión: tiene que poder leerse antes de crear una cuenta y
 * antes de aceptar el análisis de FinTrack Coach. La versión que se muestra es
 * la misma constante que valida el backend, así que el texto publicado y el
 * consentimiento que se exige no pueden desalinearse sin que cambie este
 * archivo.
 *
 * El contenido describe solo lo que el código hace hoy. Ver
 * `docs/17-politica-de-privacidad.md` para el origen de cada afirmación.
 */
export default function Privacy() {
  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <article className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-4">
          <Link to="/" aria-label="Volver a FinTrack" className="w-fit">
            <Logo className="h-10" />
          </Link>
          <h1 className="text-3xl font-semibold">Política de privacidad</h1>
          <p className="text-sm text-muted-foreground">
            Versión {CURRENT_AI_CONSENT_VERSION}. Esta página explica qué datos guarda FinTrack,
            para qué los usa y qué hace FinTrack Coach con ellos.
          </p>
        </header>

        <Section title="Qué es FinTrack">
          <p>
            FinTrack es una aplicación de planificación y registro de finanzas personales. No
            procesa pagos, no administra tarjetas, no ejecuta transferencias y no es una billetera
            digital. Los movimientos que ves son los que tú registras o importas.
          </p>
        </Section>

        <Section title="Qué datos guarda FinTrack">
          <ul className="list-disc space-y-1 pl-5">
            <li>Tu correo y los datos de inicio de sesión, incluido el de Google si lo usas.</li>
            <li>Tu perfil: nombre visible, moneda principal y zona horaria.</li>
            <li>
              Tus cuentas, categorías, movimientos, presupuestos, plan mensual, hojas de borradores
              y plantillas de movimientos recurrentes.
            </li>
          </ul>
          <p>
            Los datos se guardan en la base de datos de FinTrack con reglas de acceso por usuario:
            cada consulta solo puede ver las filas de la cuenta con la que iniciaste sesión.
          </p>
        </Section>

        <Section title="Importación de extractos en CSV">
          <p>
            El archivo CSV se lee en tu navegador. FinTrack no guarda el archivo original ni lo
            envía a ningún servicio de inteligencia artificial. Solo se guardan como borradores las
            filas que decides importar, y ningún borrador se convierte en movimiento hasta que tú lo
            registras.
          </p>
        </Section>

        <Section title="FinTrack Coach">
          <p>
            <strong>FinTrack Coach todavía no está disponible para los usuarios.</strong> Esta
            sección describe cómo tratará tus datos cuando se active, para que puedas leerla antes
            de aceptarlo.
          </p>
          <p>
            FinTrack Coach es un asistente de <strong>planificación y educación financiera</strong>.
            No es asesoramiento profesional financiero, legal, tributario, crediticio ni de
            inversión, y no recomienda comprar o vender activos.
          </p>
          <p>
            <strong>Requiere tu consentimiento explícito.</strong> Sin él, FinTrack no lee tus
            cifras para el Coach ni envía nada al proveedor. El consentimiento queda registrado con
            su fecha y con la versión de esta política; si la política cambia, se te volverá a
            pedir.
          </p>
          <h3 className="font-semibold">Proveedor</h3>
          <p>
            Las respuestas del Coach las redacta la API de Gemini, de Google. FinTrack le envía la
            pregunta y un resumen agregado; el modelo no tiene acceso a tu cuenta ni a la base de
            datos, no usa búsquedas en internet y no puede modificar tus datos.
          </p>
          <h3 className="font-semibold">Qué se envía</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>El texto de tu pregunta.</li>
            <li>
              Totales agregados del período y la moneda que se analizan: ingresos, gastos, ahorro
              neto, gasto por categoría con su nombre, variaciones frente al mes anterior y estado
              de presupuestos.
            </li>
            <li>El nombre del mes y la moneda del análisis.</li>
          </ul>
          <h3 className="font-semibold">Qué no se envía</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Las descripciones ni las notas de tus movimientos.</li>
            <li>Movimientos individuales, nombres de cuentas ni identificadores internos.</li>
            <li>Tu correo, tu nombre, tokens de sesión ni datos bancarios.</li>
            <li>El contenido de archivos CSV importados.</li>
          </ul>
          <h3 className="font-semibold">Límite de uso</h3>
          <p>
            Para controlar el coste y el abuso, cada usuario tiene un número limitado de consultas
            por hora. El contador guarda solo cuántas consultas hiciste en cada hora y se elimina a
            los 7 días.
          </p>
          <h3 className="font-semibold">Historial</h3>
          <p>
            Hoy el Coach no guarda el historial de conversaciones. Cuando lo haga, los mensajes se
            conservarán como máximo 90 días, podrás borrarlos y nunca incluirán una copia del
            resumen financiero enviado.
          </p>
          <h3 className="font-semibold">Cómo revocar el consentimiento</h3>
          <p>
            Cuando el Coach esté disponible, podrás aceptarlo y retirarlo desde Ajustes en cualquier
            momento. Desde que lo retires, FinTrack deja de enviar datos al proveedor para tus
            consultas.
          </p>
        </Section>

        <Section title="Qué no hace FinTrack con tus datos">
          <ul className="list-disc space-y-1 pl-5">
            <li>No los vende ni los comparte con fines publicitarios.</li>
            <li>No crea movimientos reales de forma automática.</li>
            <li>No mezcla monedas ni convierte importes entre ellas.</li>
          </ul>
        </Section>

        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/auth" className="underline underline-offset-4">
            Volver a FinTrack
          </Link>
        </footer>
      </article>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 text-sm leading-relaxed">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}
