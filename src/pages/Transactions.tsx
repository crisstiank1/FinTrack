import { useMemo, useState } from 'react'
import { ArrowLeftRight, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { PAGE_HELP } from '@/components/shared/page-help'
import { PageTitle } from '@/components/shared/page-title'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccounts } from '@/features/accounts/hooks'
import { useCategories } from '@/features/categories/hooks'
import { usePrimaryCurrency } from '@/features/profile/hooks'
import {
  formatTransferCounterpart,
  transferEditDefaults,
  type TransactionFilters,
  type TransferEditDefaults,
} from '@/features/transactions/api'
import { TransactionFiltersBar } from '@/features/transactions/components/transaction-filters'
import { TransactionForm } from '@/features/transactions/components/transaction-form'
import { TransactionRow } from '@/features/transactions/components/transaction-row'
import { TransferForm } from '@/features/transactions/components/transfer-form'
import {
  useCreateTransaction,
  useCreateTransfer,
  useDeleteTransaction,
  useDuplicateTransaction,
  useTransactions,
  useTransferCounterparts,
  useUpdateTransaction,
  useUpdateTransfer,
} from '@/features/transactions/hooks'
import type { TransactionFormValues, TransferFormValues } from '@/features/transactions/schemas'
import { useOptionalMonthParam } from '@/hooks/use-month-param'
import { resolveCurrencyFilter, resolvePresentationCurrency } from '@/lib/currency'
import type { Tables } from '@/types/database.types'

export default function Transactions() {
  // El mes vive en la URL (`?month=YYYY-MM`) para que un enlace desde el
  // dashboard o el plan abra el mismo mes; vaciarlo (`?month=`) muestra todos.
  // Moneda, cuenta y tipo siguen siendo estado local: no se comparten ni
  // sobreviven a recargar, igual que antes.
  const [month, setMonth] = useOptionalMonthParam()
  const [scope, setScope] = useState<Omit<TransactionFilters, 'month' | 'accountIds'>>({})

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: primaryCurrency } = usePrimaryCurrency()

  // La moneda elegida se traduce a sus cuentas; si ya no aplica, vuelve a todas.
  const currencyFilter = useMemo(
    () => resolveCurrencyFilter(accounts, scope.currencyCode, primaryCurrency),
    [accounts, scope.currencyCode, primaryCurrency],
  )

  const filters = useMemo<TransactionFilters>(
    () => ({
      ...scope,
      currencyCode: currencyFilter.currencyCode,
      accountIds: currencyFilter.accountIds,
      month,
    }),
    [scope, currencyFilter, month],
  )

  function handleFiltersChange(next: TransactionFilters) {
    if (next.month !== month) setMonth(next.month)
    setScope({ currencyCode: next.currencyCode, accountId: next.accountId, type: next.type })
  }

  const { data: transactions, isLoading } = useTransactions(filters)
  const { data: counterparts } = useTransferCounterparts(transactions)

  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const createTransfer = useCreateTransfer()
  const updateTransfer = useUpdateTransfer()
  const deleteTransaction = useDeleteTransaction()
  const duplicateTransaction = useDuplicateTransaction()

  const [movementDialog, setMovementDialog] = useState<'closed' | 'transaction' | 'transfer'>(
    'closed',
  )
  const [editingTransaction, setEditingTransaction] = useState<Tables<'transactions'> | null>(null)
  // La transferencia se guarda ya resuelta, no como fila: sus dos patas deben
  // seguir siendo las mismas mientras el diálogo está abierto, aunque la lista
  // se refresque debajo.
  const [editingTransfer, setEditingTransfer] = useState<TransferEditDefaults | null>(null)
  const [deletingTransaction, setDeletingTransaction] = useState<Tables<'transactions'> | null>(
    null,
  )

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  )
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )
  const currencyByAccountId = useMemo(
    () => new Map(accounts.map((account) => [account.id, account.currency_code])),
    [accounts],
  )

  // Esta página no suma importes: cada fila va en la moneda de su cuenta. Esta
  // moneda solo cubre filas sin cuenta conocida y formularios sin cuenta elegida.
  const currencyCode = resolvePresentationCurrency(primaryCurrency, accounts)

  function counterpartLabelFor(transaction: Tables<'transactions'>) {
    const counterpart = counterparts?.get(transaction.id)
    return counterpart
      ? formatTransferCounterpart(counterpart, accountById.get(counterpart.accountId), currencyCode)
      : undefined
  }

  function openCreateTransaction() {
    setEditingTransaction(null)
    setMovementDialog('transaction')
  }

  function openCreateTransfer() {
    setEditingTransfer(null)
    setMovementDialog('transfer')
  }

  /** Editar: un movimiento abre su formulario; una transferencia, el suyo (M8). */
  function openEdit(transaction: Tables<'transactions'>) {
    const transfer = transferEditDefaults(transaction, counterparts?.get(transaction.id))

    if (transfer) {
      setEditingTransfer(transfer)
      setMovementDialog('transfer')
      return
    }

    setEditingTransaction(transaction)
    setMovementDialog('transaction')
  }

  function closeMovementDialog() {
    setMovementDialog('closed')
    setEditingTransfer(null)
  }

  async function handleTransactionSubmit(values: TransactionFormValues) {
    try {
      if (editingTransaction) {
        await updateTransaction.mutateAsync({
          id: editingTransaction.id,
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
      } else {
        await createTransaction.mutateAsync({
          type: values.type,
          account_id: values.accountId,
          category_id: values.categoryId,
          amount_minor: values.amount,
          transaction_date: values.transactionDate,
          description: values.description,
          notes: values.notes || null,
        })
        toast.success('Movimiento registrado')
      }
      setMovementDialog('closed')
    } catch (error) {
      toast.error('No se pudo guardar el movimiento', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  async function handleTransferSubmit(values: TransferFormValues) {
    const legs = {
      fromAccountId: values.fromAccountId,
      toAccountId: values.toAccountId,
      fromAmountMinor: values.amount,
      toAmountMinor: values.receivedAmount,
      transactionDate: values.transactionDate,
      description: values.description,
    }

    try {
      if (editingTransfer) {
        await updateTransfer.mutateAsync({
          ...legs,
          transferGroupId: editingTransfer.transferGroupId,
          currencyByAccountId,
        })
        toast.success('Transferencia actualizada')
      } else {
        await createTransfer.mutateAsync(legs)
        toast.success('Transferencia registrada')
      }
      closeMovementDialog()
    } catch (error) {
      toast.error(
        editingTransfer
          ? 'No se pudo guardar la transferencia'
          : 'No se pudo registrar la transferencia',
        { description: error instanceof Error ? error.message : undefined },
      )
    }
  }

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

  async function handleDeleteConfirm() {
    if (!deletingTransaction) return

    try {
      await deleteTransaction.mutateAsync({
        id: deletingTransaction.id,
        transfer_group_id: deletingTransaction.transfer_group_id,
      })
      toast.success('Movimiento eliminado')
    } catch (error) {
      toast.error('No se pudo eliminar el movimiento', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setDeletingTransaction(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageTitle helpTitle="Movimientos" help={PAGE_HELP.transactions}>
          Movimientos
        </PageTitle>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={openCreateTransfer}>
            <ArrowLeftRight className="size-4" aria-hidden="true" />
            Transferir
          </Button>
          <Button type="button" onClick={openCreateTransaction}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo movimiento
          </Button>
        </div>
      </div>

      <div className="mt-4">
        <TransactionFiltersBar
          filters={filters}
          accounts={accounts}
          currencyCodes={currencyFilter.currencyCodes}
          onChange={handleFiltersChange}
        />
      </div>

      <div className="mt-6 flex flex-col gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando movimientos...</p>}

        {!isLoading && transactions?.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No hay movimientos para este período. Registra tu primer ingreso o gasto.
            </p>
          </div>
        )}

        {transactions?.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            transaction={transaction}
            accountName={accountById.get(transaction.account_id)?.name ?? 'Cuenta eliminada'}
            categoryName={
              transaction.category_id
                ? (categoryById.get(transaction.category_id)?.name ?? null)
                : null
            }
            categoryIcon={
              transaction.category_id
                ? (categoryById.get(transaction.category_id)?.icon ?? null)
                : null
            }
            currencyCode={accountById.get(transaction.account_id)?.currency_code ?? currencyCode}
            counterpartLabel={counterpartLabelFor(transaction)}
            canEdit={transaction.type !== 'transfer' || !!counterparts?.get(transaction.id)}
            onEdit={() => openEdit(transaction)}
            onDuplicate={() => handleDuplicate(transaction)}
            onDelete={() => setDeletingTransaction(transaction)}
          />
        ))}
      </div>

      <Dialog
        open={movementDialog === 'transaction'}
        onOpenChange={(open) => !open && setMovementDialog('closed')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTransaction ? 'Editar movimiento' : 'Nuevo movimiento'}
            </DialogTitle>
          </DialogHeader>
          <TransactionForm
            key={editingTransaction?.id ?? 'new'}
            accounts={accounts}
            categories={categories}
            currencyCode={currencyCode}
            defaultValues={
              editingTransaction
                ? {
                    type: editingTransaction.type as 'income' | 'expense',
                    accountId: editingTransaction.account_id,
                    categoryId: editingTransaction.category_id ?? '',
                    amount: editingTransaction.amount_minor,
                    transactionDate: editingTransaction.transaction_date,
                    description: editingTransaction.description,
                    notes: editingTransaction.notes ?? '',
                  }
                : undefined
            }
            onSubmit={handleTransactionSubmit}
            submitLabel={editingTransaction ? 'Guardar cambios' : 'Registrar movimiento'}
            isSubmitting={createTransaction.isPending || updateTransaction.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={movementDialog === 'transfer'}
        onOpenChange={(open) => !open && closeMovementDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTransfer ? 'Editar transferencia' : 'Transferir entre cuentas'}
            </DialogTitle>
          </DialogHeader>
          <TransferForm
            key={editingTransfer?.transferGroupId ?? 'new'}
            accounts={accounts}
            currencyCode={currencyCode}
            defaultValues={
              editingTransfer
                ? {
                    fromAccountId: editingTransfer.fromAccountId,
                    toAccountId: editingTransfer.toAccountId,
                    amount: editingTransfer.fromAmountMinor,
                    receivedAmount: editingTransfer.toAmountMinor,
                    transactionDate: editingTransfer.transactionDate,
                    description: editingTransfer.description,
                  }
                : undefined
            }
            lockedCurrencies={
              editingTransfer
                ? {
                    from: currencyByAccountId.get(editingTransfer.fromAccountId) ?? currencyCode,
                    to: currencyByAccountId.get(editingTransfer.toAccountId) ?? currencyCode,
                  }
                : undefined
            }
            submitLabel={editingTransfer ? 'Guardar cambios' : 'Transferir'}
            onSubmit={handleTransferSubmit}
            isSubmitting={createTransfer.isPending || updateTransfer.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletingTransaction}
        onOpenChange={(open) => !open && setDeletingTransaction(null)}
        title="Eliminar movimiento"
        description={
          deletingTransaction?.transfer_group_id
            ? 'Se eliminarán los dos movimientos vinculados a esta transferencia. Esta acción no se puede deshacer.'
            : 'Esta acción no se puede deshacer.'
        }
        confirmLabel="Eliminar"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
