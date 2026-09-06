import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AccountCard } from '@/features/accounts/components/account-card'
import { AccountForm } from '@/features/accounts/components/account-form'
import {
  useAccounts,
  useArchiveAccount,
  useCreateAccount,
  useUpdateAccount,
} from '@/features/accounts/hooks'
import type { AccountFormValues } from '@/features/accounts/schemas'
import type { Tables } from '@/types/database.types'

export default function Accounts() {
  const { data: accounts, isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const archiveAccount = useArchiveAccount()

  const [formOpen, setFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Tables<'accounts'> | null>(null)
  const [archivingAccount, setArchivingAccount] = useState<Tables<'accounts'> | null>(null)

  function openCreateForm() {
    setEditingAccount(null)
    setFormOpen(true)
  }

  function openEditForm(account: Tables<'accounts'>) {
    setEditingAccount(account)
    setFormOpen(true)
  }

  async function handleSubmit(values: AccountFormValues) {
    try {
      if (editingAccount) {
        await updateAccount.mutateAsync({
          id: editingAccount.id,
          input: {
            name: values.name,
            type: values.type,
            initial_balance_minor: values.initialBalance,
            currency_code: values.currencyCode,
            icon: values.icon,
            color: values.color,
          },
        })
        toast.success('Cuenta actualizada')
      } else {
        await createAccount.mutateAsync({
          name: values.name,
          type: values.type,
          initial_balance_minor: values.initialBalance,
          currency_code: values.currencyCode,
          icon: values.icon,
          color: values.color,
        })
        toast.success('Cuenta creada')
      }
      setFormOpen(false)
    } catch (error) {
      toast.error('No se pudo guardar la cuenta', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  async function handleArchiveConfirm() {
    if (!archivingAccount) return

    try {
      await archiveAccount.mutateAsync(archivingAccount.id)
      toast.success('Cuenta archivada')
    } catch (error) {
      toast.error('No se pudo archivar la cuenta', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setArchivingAccount(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Cuentas</h1>
        <Button type="button" onClick={openCreateForm}>
          <Plus className="size-4" aria-hidden="true" />
          Nueva cuenta
        </Button>
      </div>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Cargando cuentas...</p>}

      {!isLoading && accounts?.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Aún no tienes cuentas. Crea la primera para empezar a registrar tus movimientos.
          </p>
          <Button type="button" className="mt-4" onClick={openCreateForm}>
            <Plus className="size-4" aria-hidden="true" />
            Crear cuenta
          </Button>
        </div>
      )}

      {!isLoading && accounts && accounts.length > 0 && (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account, index) => (
            <AccountCard
              key={account.id}
              account={account}
              index={index}
              onEdit={() => openEditForm(account)}
              onArchive={() => setArchivingAccount(account)}
            />
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
          </DialogHeader>
          <AccountForm
            key={editingAccount?.id ?? 'new'}
            defaultValues={
              editingAccount
                ? {
                    name: editingAccount.name,
                    type: editingAccount.type as AccountFormValues['type'],
                    initialBalance: editingAccount.initial_balance_minor,
                    currencyCode: editingAccount.currency_code,
                    icon: editingAccount.icon ?? 'wallet',
                    color: editingAccount.color ?? '#E83E8C',
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            submitLabel={editingAccount ? 'Guardar cambios' : 'Crear cuenta'}
            isSubmitting={createAccount.isPending || updateAccount.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!archivingAccount}
        onOpenChange={(open) => !open && setArchivingAccount(null)}
        title="Archivar cuenta"
        description={`"${archivingAccount?.name}" dejará de aparecer como activa, pero se conservará su historial.`}
        confirmLabel="Archivar"
        onConfirm={handleArchiveConfirm}
      />
    </div>
  )
}
