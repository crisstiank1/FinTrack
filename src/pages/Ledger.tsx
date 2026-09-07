import { useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
  type SortingState,
} from '@tanstack/react-table'
import { Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccounts } from '@/features/accounts/hooks'
import { useAuth } from '@/features/auth/auth-provider'
import { useCategories } from '@/features/categories/hooks'
import { useAllTransactions } from '@/features/dashboard/hooks'
import {
  fetchLedgerForExport,
  type LedgerFilters,
  type LedgerSort,
  type LedgerSortField,
} from '@/features/ledger/api'
import { createLedgerColumns } from '@/features/ledger/columns'
import { ColumnVisibilityMenu } from '@/features/ledger/components/column-visibility-menu'
import { LedgerCards } from '@/features/ledger/components/ledger-cards'
import { LedgerFiltersBar } from '@/features/ledger/components/ledger-filters'
import { LedgerPagination } from '@/features/ledger/components/ledger-pagination'
import { LedgerSummary } from '@/features/ledger/components/ledger-summary'
import { LedgerTable } from '@/features/ledger/components/ledger-table'
import { buildLedgerCsv, ledgerCsvFilename } from '@/features/ledger/export'
import { useLedgerPage, useLedgerTotals } from '@/features/ledger/hooks'
import { buildDailyBalances } from '@/features/ledger/running-balance'
import { TransactionForm } from '@/features/transactions/components/transaction-form'
import {
  useDeleteTransaction,
  useDuplicateTransaction,
  useUpdateTransaction,
} from '@/features/transactions/hooks'
import type { TransactionFormValues } from '@/features/transactions/schemas'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { downloadCsv } from '@/lib/csv'
import type { Tables } from '@/types/database.types'

const DEFAULT_SORT: SortingState = [{ id: 'transaction_date', desc: true }]

/** Oculta por defecto: obliga a cargar todo el historial (ver ColumnVisibilityMenu). */
const DEFAULT_COLUMN_VISIBILITY: VisibilityState = { runningBalance: false }

export default function Ledger() {
  const { user } = useAuth()

  const [filters, setFilters] = useState<LedgerFilters>({})
  const [searchInput, setSearchInput] = useState('')
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORT)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    DEFAULT_COLUMN_VISIBILITY,
  )
  const [isExporting, setExporting] = useState(false)

  const [editing, setEditing] = useState<Tables<'transactions'> | null>(null)
  const [deleting, setDeleting] = useState<Tables<'transactions'> | null>(null)

  const debouncedSearch = useDebouncedValue(searchInput)

  // La búsqueda vive aparte para que el input responda al instante, y solo
  // entra a `filters` (que dispara la consulta) cuando deja de escribir.
  const activeFilters = useMemo<LedgerFilters>(
    () => ({ ...filters, search: debouncedSearch || undefined }),
    [filters, debouncedSearch],
  )

  const sort = useMemo<LedgerSort>(
    () => ({
      field: (sorting[0]?.id ?? 'transaction_date') as LedgerSortField,
      direction: sorting[0]?.desc === false ? 'asc' : 'desc',
    }),
    [sorting],
  )

  // Cambiar filtros u orden reordena todo el conjunto: seguir en la página 7
  // mostraría un tramo arbitrario, o nada si el resultado es más corto.
  useEffect(() => {
    setPageIndex(0)
  }, [activeFilters, sort, pageSize])

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const page = useLedgerPage(activeFilters, sort, pageIndex, pageSize)
  const totals = useLedgerTotals(activeFilters)

  const showRunningBalance = columnVisibility.runningBalance === true
  const { data: allTransactions = [] } = useAllTransactions({ enabled: showRunningBalance })

  const updateTransaction = useUpdateTransaction()
  const deleteTransaction = useDeleteTransaction()
  const duplicateTransaction = useDuplicateTransaction()

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const currencyCode = accounts[0]?.currency_code ?? 'COP'

  const balanceByDate = useMemo(
    () =>
      showRunningBalance
        ? buildDailyBalances(accounts, allTransactions, activeFilters.accountId)
        : undefined,
    [showRunningBalance, accounts, allTransactions, activeFilters.accountId],
  )

  const rows = useMemo(() => page.data?.rows ?? [], [page.data])
  const totalCount = page.data?.totalCount ?? 0

  const columns = useMemo(
    () =>
      createLedgerColumns({
        accountsById,
        categoriesById,
        currencyCode,
        balanceByDate,
        onEdit: setEditing,
        onDuplicate: handleDuplicate,
        onDelete: setDeleting,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountsById, categoriesById, currencyCode, balanceByDate],
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // El servidor ordena y pagina; la tabla solo refleja ese estado.
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
  })

  async function handleDuplicate(transaction: Tables<'transactions'>) {
    try {
      await duplicateTransaction.mutateAsync(transaction.id)
      toast.success('Movimiento duplicado')
    } catch (error) {
      toast.error('No se pudo duplicar el movimiento', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  async function handleEditSubmit(values: TransactionFormValues) {
    if (!editing) return

    try {
      await updateTransaction.mutateAsync({
        id: editing.id,
        input: {
          type: values.type,
          account_id: values.accountId,
          category_id: values.categoryId,
          amount_minor: values.amount,
          transaction_date: values.transactionDate,
          description: values.description,
          notes: values.notes || null,
        },
      })
      toast.success('Movimiento actualizado')
      setEditing(null)
    } catch (error) {
      toast.error('No se pudo guardar el movimiento', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  async function handleDeleteConfirm() {
    if (!deleting) return

    try {
      await deleteTransaction.mutateAsync({
        id: deleting.id,
        transfer_group_id: deleting.transfer_group_id,
      })
      toast.success('Movimiento eliminado')
    } catch (error) {
      toast.error('No se pudo eliminar el movimiento', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setDeleting(null)
    }
  }

  async function handleExport() {
    if (!user) return

    setExporting(true)
    try {
      // Se piden las filas con los filtros y el orden actuales, no las de la
      // página en pantalla: el CSV refleja lo que el usuario está viendo.
      const exported = await fetchLedgerForExport(user.id, activeFilters, sort)

      if (exported.length === 0) {
        toast.info('No hay movimientos que exportar con estos filtros')
        return
      }

      downloadCsv(
        ledgerCsvFilename(),
        buildLedgerCsv(exported, {
          accountsById,
          categoriesById,
          fallbackCurrency: currencyCode,
        }),
      )
      toast.success(`${exported.length} movimientos exportados`)
    } catch (error) {
      toast.error('No se pudo exportar el CSV', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Libro financiero</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Todos tus movimientos, con filtros y exportación.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ColumnVisibilityMenu table={table} />
          <Button type="button" variant="outline" onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="size-4" aria-hidden="true" />
            )}
            Exportar CSV
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <LedgerFiltersBar
          filters={filters}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          onChange={setFilters}
          accounts={accounts}
          categories={categories}
        />

        <LedgerSummary
          totals={totals.data}
          isError={totals.isError}
          currencyCode={currencyCode}
        />

        {page.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-border bg-card p-8 text-center"
          >
            <p className="text-sm text-muted-foreground">
              No pudimos cargar los movimientos. Revisa tu conexión e inténtalo de nuevo.
            </p>
            <Button type="button" className="mt-4" onClick={() => void page.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : page.isPending ? (
          <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Cargando movimientos...
          </p>
        ) : totalCount === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Ningún movimiento coincide con estos filtros.
            </p>
          </div>
        ) : (
          <>
            <LedgerTable table={table} />
            <LedgerCards
              transactions={rows}
              accountsById={accountsById}
              categoriesById={categoriesById}
              currencyCode={currencyCode}
              balanceByDate={balanceByDate}
              onEdit={setEditing}
              onDuplicate={handleDuplicate}
              onDelete={setDeleting}
            />
          </>
        )}

        <LedgerPagination
          pageIndex={pageIndex}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPageIndex}
          onPageSizeChange={setPageSize}
        />
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar movimiento</DialogTitle>
          </DialogHeader>
          {editing && (
            <TransactionForm
              key={editing.id}
              accounts={accounts}
              categories={categories}
              currencyCode={currencyCode}
              defaultValues={{
                type: editing.type as 'income' | 'expense',
                accountId: editing.account_id,
                categoryId: editing.category_id ?? '',
                amount: editing.amount_minor,
                transactionDate: editing.transaction_date,
                description: editing.description,
                notes: editing.notes ?? '',
              }}
              onSubmit={handleEditSubmit}
              submitLabel="Guardar cambios"
              isSubmitting={updateTransaction.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Eliminar movimiento"
        description={
          deleting?.transfer_group_id
            ? 'Se eliminarán los dos movimientos vinculados a esta transferencia. Esta acción no se puede deshacer.'
            : 'Esta acción no se puede deshacer.'
        }
        confirmLabel="Eliminar"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
