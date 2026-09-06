import { LogOut } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { supabase } from '@/lib/supabase'

export function AppLayout() {
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-lg font-semibold text-primary">FinTrack</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button type="button" variant="outline" size="icon" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
