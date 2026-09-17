import type { ReactNode } from 'react'

import { HelpHint } from './help-hint'

interface PageTitleProps {
  /** Texto del `h1`. */
  children: ReactNode
  /** Nombre de la pantalla: rotula el «?» («Ayuda: …») y titula su panel. */
  helpTitle: string
  /** Qué es la pantalla, en una o dos frases. */
  help: string
}

/**
 * Título de una pantalla con su «?» de ayuda al lado.
 *
 * El panel se ancla a la fila del título y no al botón: pegado a un título
 * largo, un panel alineado con el «?» se saldría por la derecha de un teléfono.
 * Por eso la fila es la que está posicionada y el «?» queda `static`.
 */
export function PageTitle({ children, helpTitle, help }: PageTitleProps) {
  return (
    <div className="relative flex items-center gap-1">
      <h1 className="text-2xl font-semibold text-foreground">{children}</h1>
      <HelpHint title={helpTitle} className="static">
        {help}
      </HelpHint>
    </div>
  )
}
