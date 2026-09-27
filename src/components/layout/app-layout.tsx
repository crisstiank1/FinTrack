import { LogOut } from 'lucide-react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { Logo } from '@/components/shared/logo'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { Button } from '@/components/ui/button'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

import { SiteFooter } from './site-footer'
import { AppNav, NAV_COMPACT_QUERY, NAV_WIDE_QUERY, type NavMode } from './app-nav'

/**
 * Cabecera de cada modo. La de `wide` reproduce la fila de siempre: logo,
 * 24 px, navegación, y tema y sesión empujados a la derecha.
 */
const HEADER_CLASS: Record<NavMode, string> = {
  wide: 'flex items-center gap-4 border-b border-border px-6 py-4',
  compact:
    'relative flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-6 pb-3 pt-4',
  narrow: 'relative flex items-center gap-2 border-b border-border px-4 py-3',
}

const NAV_CLASS: Record<NavMode, string> = {
  wide: '',
  // Ocupa una fila entera: la segunda de la cabecera.
  compact: 'basis-full',
  narrow: 'ml-auto',
}

/** Título de pestaña por ruta: lo anuncian los lectores de pantalla al navegar. */
const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/accounts': 'Cuentas',
  '/transactions': 'Movimientos',
  '/ledger': 'Libro',
  '/sheets': 'Hojas',
  '/budgets': 'Presupuestos',
  '/plan': 'Plan mensual',
  '/import': 'Importar CSV',
  '/settings': 'Ajustes',
}

export function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  useDocumentTitle(ROUTE_TITLES[pathname] ?? 'Inicio')
  const isCompactOrWider = useMediaQuery(NAV_COMPACT_QUERY)
  const isWide = useMediaQuery(NAV_WIDE_QUERY)
  const mode: NavMode = isWide ? 'wide' : isCompactOrWider ? 'compact' : 'narrow'

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  // `shrink-0`: sin él, el flex reducía el logo a 0 px por debajo de 1024.
  const logo = <Logo key="logo" className={cn('h-11 shrink-0', mode === 'wide' && 'mr-2')} />

  const nav = <AppNav key="nav" mode={mode} className={NAV_CLASS[mode]} />

  // Tema y sesión quedan siempre fuera de la navegación: nunca entran en
  // «Más» ni en «Menú».
  const actions = (
    <div
      key="actions"
      className={cn('flex shrink-0 items-center gap-2', mode !== 'narrow' && 'ml-auto')}
    >
      <ThemeToggle />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleLogout}
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <LogOut className="size-4" aria-hidden="true" />
      </Button>
    </div>
  )

  // El orden del DOM sigue al visual, que es el que recorre Tab. Los tres
  // bloques llevan `key`, así que al cambiar de modo React los reordena sin
  // desmontar la navegación ni perder su estado.
  const blocks = mode === 'compact' ? [logo, actions, nav] : [logo, nav, actions]

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring"
      >
        Saltar al contenido
      </a>
      <header className={HEADER_CLASS[mode]}>{blocks}</header>
      <main id="contenido" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  )
}
