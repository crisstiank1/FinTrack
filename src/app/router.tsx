import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ProtectedRoute } from '@/components/auth/protected-route'
import { AppLayout } from '@/components/layout/app-layout'
import { DashboardSkeleton } from '@/features/dashboard/components/dashboard-states'
import Accounts from '@/pages/Accounts'
import Auth from '@/pages/Auth'
import AuthCallback from '@/pages/AuthCallback'
import Onboarding from '@/pages/Onboarding'
import Privacy from '@/pages/Privacy'
import ResetPassword from '@/pages/ResetPassword'
import Settings from '@/pages/Settings'
import Transactions from '@/pages/Transactions'

/**
 * Las dos pantallas pesadas van en su propio chunk: el dashboard es la única
 * que usa Recharts y el libro la única que usa TanStack Table. Así /auth,
 * /onboarding y el resto de rutas no pagan el costo de ninguna de las dos.
 */
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Ledger = lazy(() => import('@/pages/Ledger'))

/**
 * Presupuestos no arrastra ninguna librería pesada, pero sí es la única
 * pantalla que no se visita en cada sesión, así que su chunk aparte evita
 * cargarla mientras el usuario solo consulta saldos.
 */
const Budgets = lazy(() => import('@/pages/Budgets'))

/** El Plan mensual sigue el mismo criterio que Presupuestos. */
const Plan = lazy(() => import('@/pages/Plan'))

/** Hojas arrastra TanStack Table; su chunk aparte no penaliza al resto de rutas. */
const Sheets = lazy(() => import('@/pages/Sheets'))

/** El importador CSV solo se usa de vez en cuando; va en su propio chunk. */
const CsvImport = lazy(() => import('@/pages/CsvImport'))

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Pública: se lee antes de crear cuenta y antes de aceptar el Coach. */}
        <Route path="/privacy" element={<Privacy />} />
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
            <Route
              path="/ledger"
              element={
                <Suspense
                  fallback={<p className="p-6 text-sm text-muted-foreground">Cargando libro...</p>}
                >
                  <Ledger />
                </Suspense>
              }
            />
            <Route
              path="/budgets"
              element={
                <Suspense
                  fallback={
                    <p className="p-6 text-sm text-muted-foreground">Cargando presupuestos...</p>
                  }
                >
                  <Budgets />
                </Suspense>
              }
            />
            <Route
              path="/plan"
              element={
                <Suspense
                  fallback={<p className="p-6 text-sm text-muted-foreground">Cargando plan...</p>}
                >
                  <Plan />
                </Suspense>
              }
            />
            <Route
              path="/sheets"
              element={
                <Suspense
                  fallback={<p className="p-6 text-sm text-muted-foreground">Cargando hojas...</p>}
                >
                  <Sheets />
                </Suspense>
              }
            />
            <Route
              path="/import"
              element={
                <Suspense
                  fallback={
                    <p className="p-6 text-sm text-muted-foreground">Cargando importador...</p>
                  }
                >
                  <CsvImport />
                </Suspense>
              }
            />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
