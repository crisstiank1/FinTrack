import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { SiteFooter } from '@/components/layout/site-footer'
import { Logo } from '@/components/shared/logo'
import type { LegalDocument } from '@/features/legal/documents'
import { useDocumentTitle } from '@/hooks/use-document-title'

interface LegalLayoutProps {
  document: LegalDocument
  /** Frase inicial bajo el título. */
  summary: string
  children: ReactNode
}

/** Estructura común de las páginas legales públicas: cabecera, contenido y pie. */
export function LegalLayout({ document, summary, children }: LegalLayoutProps) {
  useDocumentTitle(document.title)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <Link
          to="/"
          aria-label="Ir al inicio de FinTrack"
          className="inline-block w-fit rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Logo className="h-10" />
        </Link>
      </header>
      <main className="flex-1 px-4 py-10">
        <article className="mx-auto flex max-w-3xl flex-col gap-8">
          <header className="flex flex-col gap-3">
            <h1 className="text-3xl font-semibold">{document.title}</h1>
            <p className="text-sm text-muted-foreground">
              Versión {document.version} · Vigente desde el{' '}
              <time dateTime={document.effectiveDate}>{document.effectiveDate}</time>
            </p>
            <p className="text-sm leading-relaxed">{summary}</p>
          </header>
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  )
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 text-sm leading-relaxed">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}
