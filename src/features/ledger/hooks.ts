import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useAuth } from '@/features/auth/auth-provider'

import {
  fetchLedgerPage,
  fetchLedgerTotals,
  type LedgerFilters,
  type LedgerSort,
} from './api'

/**
 * Una página del libro.
 *
 * `keepPreviousData` mantiene la página anterior visible mientras llega la
 * siguiente: sin esto la tabla se vaciaría en cada cambio de página o de orden
 * y la vista daría un salto.
 *
 * La clave empieza por 'transactions' para que las mutaciones ya existentes,
 * que invalidan ['transactions', userId], refresquen también el libro.
 */
export function useLedgerPage(
  filters: LedgerFilters,
  sort: LedgerSort,
  pageIndex: number,
  pageSize: number,
) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['transactions', user?.id, 'ledger', 'page', filters, sort, pageIndex, pageSize],
    queryFn: () => fetchLedgerPage(user!.id, filters, sort, pageIndex, pageSize),
    enabled: !!user,
    placeholderData: keepPreviousData,
  })
}

/**
 * Totales del conjunto filtrado completo. Va en su propia consulta para que un
 * fallo aquí no impida navegar la tabla.
 */
export function useLedgerTotals(filters: LedgerFilters) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['transactions', user?.id, 'ledger', 'totals', filters],
    queryFn: () => fetchLedgerTotals(user!.id, filters),
    enabled: !!user,
    placeholderData: keepPreviousData,
  })
}
