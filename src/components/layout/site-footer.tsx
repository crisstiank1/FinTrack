import { Link } from 'react-router-dom'

import { LEGAL_DOCUMENTS } from '@/features/legal/documents'
import { cn } from '@/lib/utils'

const LINKS = [
  LEGAL_DOCUMENTS.privacy,
  LEGAL_DOCUMENTS.terms,
  LEGAL_DOCUMENTS.cookies,
  LEGAL_DOCUMENTS.refunds,
]

/** Pie común: enlaces legales en todas las pantallas, con o sin sesión. */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('border-t border-border px-4 py-6 text-sm sm:px-6', className)}>
      <nav aria-label="Información legal">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((document) => (
            <li key={document.path}>
              <Link
                to={document.path}
                className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {document.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-3 text-xs text-muted-foreground">
        FinTrack es una herramienta de registro y planificación. No procesa pagos ni ofrece
        asesoramiento financiero profesional.
      </p>
    </footer>
  )
}
