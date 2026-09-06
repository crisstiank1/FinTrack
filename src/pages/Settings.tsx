import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CategoryForm } from '@/features/categories/components/category-form'
import { CategoryList } from '@/features/categories/components/category-list'
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useUpdateCategory,
} from '@/features/categories/hooks'
import type { CategoryFormValues } from '@/features/categories/schemas'
import type { Tables } from '@/types/database.types'

export default function Settings() {
  const { data: categories, isLoading } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const archiveCategory = useArchiveCategory()

  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Tables<'categories'> | null>(null)
  const [archivingCategory, setArchivingCategory] = useState<Tables<'categories'> | null>(null)

  function openCreateForm() {
    setEditingCategory(null)
    setFormOpen(true)
  }

  async function handleSubmit(values: CategoryFormValues) {
    try {
      if (editingCategory) {
        await updateCategory.mutateAsync({ id: editingCategory.id, input: values })
        toast.success('Categoría actualizada')
      } else {
        await createCategory.mutateAsync(values)
        toast.success('Categoría creada')
      }
      setFormOpen(false)
    } catch (error) {
      toast.error('No se pudo guardar la categoría', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  async function handleArchiveConfirm() {
    if (!archivingCategory) return

    try {
      await archiveCategory.mutateAsync(archivingCategory.id)
      toast.success('Categoría archivada')
    } catch (error) {
      toast.error('No se pudo archivar la categoría', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setArchivingCategory(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ajustes</h1>
          <p className="text-sm text-muted-foreground">Categorías</p>
        </div>
        <Button type="button" onClick={openCreateForm}>
          <Plus className="size-4" aria-hidden="true" />
          Nueva categoría
        </Button>
      </div>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Cargando categorías...</p>}

      {!isLoading && categories && categories.length > 0 && (
        <div className="mt-8">
          <CategoryList
            categories={categories}
            onEdit={(category) => {
              setEditingCategory(category)
              setFormOpen(true)
            }}
            onArchive={(category) => setArchivingCategory(category)}
          />
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Editar categoría' : 'Nueva categoría'}</DialogTitle>
          </DialogHeader>
          <CategoryForm
            key={editingCategory?.id ?? 'new'}
            defaultValues={
              editingCategory
                ? {
                    name: editingCategory.name,
                    type: editingCategory.type as CategoryFormValues['type'],
                    icon: editingCategory.icon ?? 'more-horizontal',
                    color: editingCategory.color ?? '#E83E8C',
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            submitLabel={editingCategory ? 'Guardar cambios' : 'Crear categoría'}
            isSubmitting={createCategory.isPending || updateCategory.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!archivingCategory}
        onOpenChange={(open) => !open && setArchivingCategory(null)}
        title="Archivar categoría"
        description={`"${archivingCategory?.name}" dejará de estar disponible para nuevos movimientos, pero se conservará su historial.`}
        confirmLabel="Archivar"
        onConfirm={handleArchiveConfirm}
      />
    </div>
  )
}
