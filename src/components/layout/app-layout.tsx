import { Outlet } from 'react-router-dom'

import { ThemeToggle } from '@/components/theme/theme-toggle'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="text-lg font-semibold text-primary">FinTrack</span>
        <ThemeToggle />
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
