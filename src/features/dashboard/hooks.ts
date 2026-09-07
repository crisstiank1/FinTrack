import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'

import { fetchAllTransactions } from './api'

/**
 * Historial completo de movimientos, base de todos los cálculos del dashboard.
 *
 * La clave empieza por 'transactions' para que las mutaciones existentes
 * (crear, editar, duplicar, eliminar) que invalidan ['transactions', userId]
 * también refresquen el dashboard sin trabajo adicional.
 */
export function useAllTransactions(options?: { enabled?: boolean }) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['transactions', user?.id, 'all'],
    queryFn: () => fetchAllTransactions(user!.id),
    // El libro solo necesita el historial si el usuario activa la columna de
    // saldo acumulado, así que puede pedirse desactivado.
    enabled: !!user && (options?.enabled ?? true),
  })
}
