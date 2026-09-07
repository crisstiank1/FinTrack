import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { AppLayout } from '@/components/layout/app-layout'
import { DashboardSkeleton } from '@/features/dashboard/components/dashboard-states'
import Accounts from '@/pages/Accounts'
import Auth from '@/pages/Auth'
import AuthCallback from '@/pages/AuthCallback'
import Onboarding from '@/pages/Onboarding'
import ResetPassword from '@/pages/ResetPassword'
import Settings from '@/pages/Settings'
import Transactions from '@/pages/Transactions'

/**
 * El dashboard es la única pantalla que usa Recharts (~130 KB gzip). Cargarlo
 * aparte evita que /auth, /onboarding y el resto de rutas paguen ese costo.
 */
const Dashboard = lazy(() => import('@/pages/Dashboard'))

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route element={<AppLayout />}>
            <Route
              path="/dashboard"
              element={
                <Suspense
                  fallback={
                    <div className="mx-auto max-w-6xl p-4 sm:p-6">
                      <DashboardSkeleton />
                    </div>
                  }
                >
                  <Dashboard />
                </Suspense>
              }
            />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
