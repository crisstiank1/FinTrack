import { Navigate, Outlet } from 'react-router-dom'

import { useAuth } from '@/features/auth/auth-provider'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/auth" replace />
  }

  return <Outlet />
}
