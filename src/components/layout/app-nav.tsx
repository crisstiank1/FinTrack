import {
  ArrowLeftRight,
  BookOpen,
  CalendarRange,
  ChevronDown,
  LayoutDashboard,
  Menu,
  PiggyBank,
  Settings,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent } from 'react'
import { matchPath, NavLink, useLocation } from 'react-router-dom'

import { cn } from '@/lib/utils'

/**
 * Cómo se reparte la navegación según el ancho disponible:
 *
 * - `wide` (≥ 1024 px): los siete enlaces en fila, como siempre.
 * - `compact` (640–1023 px): cuatro principales en fila y el resto en «Más».
 * - `narrow` (< 640 px): los siete dentro de «Menú». Cuatro nombres completos
 *   más «Más» no caben en 320 px sin abreviarlos.
 */
export type NavMode = 'narrow' | 'compact' | 'wide'

/*
 * Las dos consultas repiten los breakpoints `sm` (40rem) y `lg` (64rem) de
 * Tailwind v4. `index.css` no los redefine y Tailwind no los expone como
 * variables CSS, así que se escriben aquí; si alguna vez cambian allí, tienen
 * que cambiar aquí también.
 */
export const NAV_COMPACT_QUERY = '(min-width: 40rem)'
export const NAV_WIDE_QUERY = '(min-width: 64rem)'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Las principales siguen visibles en `compact`; las secundarias van a «Más». */
  priority: 'primary' | 'secondary'
}

/** Única lista de rutas de la aplicación autenticada. El orden es el de la fila de escritorio. */
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, priority: 'primary' },
  { to: '/accounts', label: 'Cuentas', icon: Wallet, priority: 'secondary' },
  { to: '/transactions', label: 'Movimientos', icon: ArrowLeftRight, priority: 'primary' },
  { to: '/ledger', label: 'Libro', icon: BookOpen, priority: 'secondary' },
  { to: '/budgets', label: 'Presupuestos', icon: PiggyBank, priority: 'primary' },
  { to: '/plan', label: 'Plan mensual', icon: CalendarRange, priority: 'primary' },
  { to: '/settings', label: 'Ajustes', icon: Settings, priority: 'secondary' },
]

const PRIMARY_ITEMS = NAV_ITEMS.filter((item) => item.priority === 'primary')
const SECONDARY_ITEMS = NAV_ITEMS.filter((item) => item.priority === 'secondary')

const ITEM_BASE = 'rounded-md px-3 py-1.5 text-sm font-medium transition-colors'

/**
 * La página actual no se distingue solo por color: además del fondo y el texto
 * lleva peso seminegrita y una raya inferior. La raya es una sombra interior,
 * así que no suma alto ni ancho al enlace.
 */
const ITEM_ACTIVE =
  'bg-primary-soft font-semibold text-primary shadow-[inset_0_-2px_0_currentColor]'
const ITEM_INACTIVE = 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'

function itemClassName({ isActive }: { isActive: boolean }) {
  return cn(ITEM_BASE, isActive ? ITEM_ACTIVE : ITEM_INACTIVE)
}

/** El mismo criterio que usa `NavLink`: coincidencia por prefijo sobre `pathname`. */
function findActiveItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => matchPath({ path: item.to, end: false }, pathname) !== null)
}

interface AppNavProps {
  mode: NavMode
  className?: string
}

/**
 * Navegación principal.
 *
 * «Más» y «Menú» son un **disclosure** de enlaces, no un `role="menu"`: se
 * recorren con Tab como cualquier enlace, sin flechas ni gestión de foco
 * propia.
 *
 * - Enter y Space los abren porque el control es un `<button>`.
 * - Escape cierra y devuelve el foco al botón.
 * - Un clic fuera cierra sin mover el foco.
 * - Elegir un enlace cierra y devuelve el foco al botón.
 * - Salir del contenedor con Tab o Shift+Tab cierra sin mover el foco.
 * - Cambiar de ruta o de modo cierra.
 *
 * El panel existe siempre, oculto con `hidden`, para que `aria-controls` tenga
 * destino; sus enlaces solo se montan abierto, así que plegado no deja enlaces
 * repetidos en el orden de tabulación.
 */
export function AppNav({ mode, className }: AppNavProps) {
  const { pathname } = useLocation()
  const panelId = useId()
  const containerRef = useRef<HTMLLIElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const focusInsideRef = useRef(false)

  // Se recuerda dónde se abrió en vez de un booleano: si cambia la ruta o el
  // modo, el panel queda cerrado en ese mismo render. Y se olvida, para que
  // volver a la ruta o al ancho de antes no lo reabra solo.
  const [openedAt, setOpenedAt] = useState<{ pathname: string; mode: NavMode } | null>(null)
  const isStale = openedAt !== null && (openedAt.pathname !== pathname || openedAt.mode !== mode)
  if (isStale) setOpenedAt(null)
  const isOpen = mode !== 'wide' && openedAt !== null && !isStale

  const activeItem = findActiveItem(pathname)
  const isSecondaryActive = activeItem?.priority === 'secondary'

  const inlineItems = mode === 'wide' ? NAV_ITEMS : mode === 'compact' ? PRIMARY_ITEMS : []
  const panelItems = mode === 'compact' ? SECONDARY_ITEMS : NAV_ITEMS

  // Los listeners globales solo existen con el panel abierto.
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      // Un Dialog de Radix que ya atendió el Escape lo marca: no se le pisa.
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setOpenedAt(null)
      buttonRef.current?.focus()
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && containerRef.current?.contains(event.target)) return
      setOpenedAt(null)
    }

    // La página perdió el foco: Shift+Tab desde «Menú», que en `narrow` es el
    // primer elemento enfocable, lo manda fuera del documento. No sirve mirar
    // `document.hasFocus()` en el `focusout`: Chromium todavía responde `true`
    // en ese instante y solo cambia al llegar este `blur`. Se cierra sin mover
    // el foco, porque no hay a dónde devolverlo. Cambiar de ventana o de
    // pestaña también lo cierra.
    function handleWindowBlur() {
      focusInsideRef.current = false
      setOpenedAt(null)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [isOpen])

  // Al cruzar un breakpoint con el foco dentro del panel, ese foco se perdería
  // con los enlaces desmontados. Si el botón sigue existiendo, vuelve a él.
  const previousRef = useRef({ mode, isOpen })
  useLayoutEffect(() => {
    const previous = previousRef.current
    if (previous.mode !== mode && previous.isOpen && focusInsideRef.current) {
      buttonRef.current?.focus()
    }
    previousRef.current = { mode, isOpen }
  }, [mode, isOpen])

  function handleBlur(event: FocusEvent<HTMLLIElement>) {
    const next = event.relatedTarget
    // Sin destino (un elemento desmontado, un clic en una zona no enfocable
    // del propio panel) no se considera salida. Si el foco sale de la página,
    // lo atiende `handleWindowBlur`.
    if (!(next instanceof Node) || event.currentTarget.contains(next)) return
    focusInsideRef.current = false
    setOpenedAt(null)
  }

  function handleSelect() {
    setOpenedAt(null)
    buttonRef.current?.focus()
  }

  const disclosureLabel = mode === 'narrow' ? 'Menú' : 'Más'
  const announcesSection = mode === 'narrow' || isSecondaryActive

  return (
    <nav aria-label="Principal" className={className}>
      <ul className={cn('flex items-center gap-1', mode === 'compact' && 'flex-wrap')}>
        {inlineItems.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} className={itemClassName}>
              {item.label}
            </NavLink>
          </li>
        ))}

        {mode !== 'wide' && (
          <li
            key="disclosure"
            ref={containerRef}
            className={cn(mode === 'compact' && 'relative')}
            onFocus={() => {
              focusInsideRef.current = true
            }}
            onBlur={handleBlur}
          >
            <button
              ref={buttonRef}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenedAt(isOpen ? null : { pathname, mode })}
              className={cn(
                ITEM_BASE,
                'inline-flex items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                mode === 'narrow' && 'h-9 border border-border bg-background',
                mode === 'compact' && isSecondaryActive ? ITEM_ACTIVE : ITEM_INACTIVE,
              )}
            >
              {mode === 'narrow' && <Menu className="size-4" aria-hidden="true" />}
              {disclosureLabel}
              {announcesSection && activeItem && (
                <span className="sr-only">, sección actual: {activeItem.label}</span>
              )}
              {mode === 'compact' && (
                <ChevronDown
                  className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
                  aria-hidden="true"
                />
              )}
            </button>

            <div
              id={panelId}
              hidden={!isOpen}
              className={cn(
                'absolute top-full z-40 border border-border bg-card shadow-lg',
                // En `narrow` ocupa el ancho de la cabecera, que es su bloque
                // contenedor; en `compact` crece hacia la izquierda desde «Más».
                // Ninguno de los dos puede pasar del borde del documento.
                mode === 'narrow'
                  ? 'inset-x-0 border-x-0 px-4 py-2'
                  : 'right-0 mt-1 w-56 rounded-lg p-1',
              )}
            >
              {isOpen && (
                <ul className="flex flex-col gap-1">
                  {panelItems.map((item) => {
                    const Icon = item.icon
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          onClick={handleSelect}
                          className={(state) =>
                            cn(itemClassName(state), 'flex min-h-11 items-center gap-3')
                          }
                        >
                          <Icon className="size-4 shrink-0" aria-hidden="true" />
                          {item.label}
                        </NavLink>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </li>
        )}
      </ul>
    </nav>
  )
}
