import { useMemo, useState } from 'react'
import { ArrowLeftRight, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccounts } from '@/features/accounts/hooks'
import { useCategories } from '@/features/categories/hooks'
import type { TransactionFilters } from '@/features/transactions/api'
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
  useUpdateTransaction,
} from '@/features/transactions/hooks'
import type { TransactionFormValues, TransferFormValues } from '@/features/transactions/schemas'
import { currentMonthKey } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

export default function Transactions() {
  const [filters, setFilters] = useState<TransactionFilters>({ month: currentMonthKey() })

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: transactions, isLoading } = useTransactions(filters)

  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const createTransfer = useCreateTransfer()
  const deleteTransaction = useDeleteTransaction()
  const duplicateTransaction = useDuplicateTransaction()

  const [movementDialog, setMovementDialog] = useState<'closed' | 'transaction' | 'transfer'>('closed')
  const [editingTransaction, setEditingTransaction] = useState<Tables<'transactions'> | null>(null)
  const [deletingTransaction, setDeletingTransaction] = useState<Tables<'transactions'> | null>(null)

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  )
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const currencyCode = accounts[0]?.currency_code ?? 'COP'

  function openCreateTransaction() {
    setEditingTransaction(null)
    setMovementDialog('transaction')
  }

  function openEditTransaction(transaction: Tables<'transactions'>) {
    setEditingTransaction(transaction)
    setMovementDialog('transaction')
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
    try {
      await createTransfer.mutateAsync({
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        amountMinor: values.amount,
        transactionDate: values.transactionDate,
        description: values.description,
      })
      toast.success('Transferencia registrada')
      setMovementDialog('closed')
    } catch (error) {
      toast.error('No se pudo registrar la transferencia', {
        description: error instanceof Error ? error.message : undefined,
      })
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
        <h1 className="text-2xl font-semibold text-foreground">Movimientos</h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setMovementDialog('transfer')}>
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
        <TransactionFiltersBar filters={filters} accounts={accounts} onChange={setFilters} />
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
              transaction.category_id ? (categoryById.get(transaction.category_id)?.name ?? null) : null
            }
            categoryIcon={
              transaction.category_id ? (categoryById.get(transaction.category_id)?.icon ?? null) : null
            }
            currencyCode={accountById.get(transaction.account_id)?.currency_code ?? currencyCode}
            onEdit={() => openEditTransaction(transaction)}
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
            <DialogTitle>{editingTransaction ? 'Editar movimiento' : 'Nuevo movimiento'}</DialogTitle>
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
        onOpenChange={(open) => !open && setMovementDialog('closed')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir entre cuentas</DialogTitle>
          </DialogHeader>
          <TransferForm
            accounts={accounts}
            currencyCode={currencyCode}
            onSubmit={handleTransferSubmit}
            isSubmitting={createTransfer.isPending}
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
