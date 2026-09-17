import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CircleHelp } from 'lucide-react'

import { cn } from '@/lib/utils'

interface HelpHintProps {
  title: string
  children: ReactNode
  /** Nombre accesible del botón. */
  label?: string
  /**
   * Borde del panel que se alinea con su contenedor posicionado: `start` para
   * un «?» junto a un título, `end` para uno al final de una fila.
   */
  align?: 'start' | 'end'
  className?: string
}

/**
 * Botón «?» con una explicación breve.
 *
 * No es un tooltip de solo ratón: en un teléfono no existe el hover. Se abre al
 * pasar el ratón, al llegar con el teclado y al tocarlo; un toque o un clic lo
 * deja fijo hasta cerrarlo. Escape y tocar fuera lo cierran, y Escape devuelve
 * el foco al botón para no perder el sitio.
 *
 * El proyecto no tiene librería de tooltips ni de popovers, y para un texto de
 * dos líneas no merece la pena añadirla.
 */
export function HelpHint({ title, children, label, align = 'start', className }: HelpHintProps) {
  const [isOpen, setOpen] = useState(false)
  const [isPinned, setPinned] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const titleId = useId()

  function close() {
    setOpen(false)
    setPinned(false)
  }

  useEffect(() => {
    if (!isOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) close()
    }

    // Escape se escucha en todo el documento: abierto con el ratón, el foco puede
    // estar en cualquier otro sitio, y la ayuda tiene que poder cerrarse sin
    // mover el puntero.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return

      const hadFocus = wrapperRef.current?.contains(document.activeElement) ?? false
      close()
      if (hadFocus) buttonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div
      ref={wrapperRef}
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => !isPinned && setOpen(false)}
      onBlur={(event) => {
        // El foco sale del conjunto: se cierra salvo que se fijara con un toque.
        if (!isPinned && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={label ?? `Ayuda: ${title}`}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onFocus={() => setOpen(true)}
        onClick={() => {
          if (isPinned) {
            close()
          } else {
            setPinned(true)
            setOpen(true)
          }
        }}
        className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <CircleHelp className="size-5" aria-hidden="true" />
      </button>

      <div
        id={panelId}
        role="region"
        aria-labelledby={titleId}
        hidden={!isOpen}
        className={cn(
          'absolute top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-3 text-left shadow-lg',
          align === 'start' ? 'left-0' : 'right-0',
        )}
      >
        <p id={titleId} className="text-sm font-semibold text-foreground">
          {title}
        </p>
        <div className="mt-1 text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  )
}
