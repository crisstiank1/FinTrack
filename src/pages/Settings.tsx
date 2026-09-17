import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { useAccounts } from '@/features/accounts/hooks'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  ClassificationPanel,
  type PanelCategory,
} from '@/features/categories/classifications/components/classification-panel'
import { ClassificationError } from '@/features/categories/classifications/errors'
import {
  useCategoryClassifications,
  useCreateCategoryClassification,
  useDeleteCategoryClassification,
  useUpdateCategoryClassification,
} from '@/features/categories/classifications/hooks'
import {
  partitionCategoriesForClassification,
  type ClassifiedCategory,
} from '@/features/categories/classifications/mutations'
import type { ClassificationGroup } from '@/features/categories/classifications/schemas'
import { CategoryForm } from '@/features/categories/components/category-form'
import { CategoryList } from '@/features/categories/components/category-list'
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useUpdateCategory,
} from '@/features/categories/hooks'
import type { CategoryFormValues } from '@/features/categories/schemas'
import {
  useDisplayName,
  usePrimaryCurrency,
  useUpdateDisplayName,
  useUpdatePrimaryCurrency,
} from '@/features/profile/hooks'
import { displayNameSchema, type DisplayNameValues } from '@/features/profile/schemas'
import { accountsKeptInCurrentCurrency, currencyOptions } from '@/lib/currency'
import type { Tables } from '@/types/database.types'

/** Colección vacía con identidad estable, para no invalidar el `useMemo`. */
const NO_CLASSIFICATIONS: Tables<'category_classifications'>[] = []

export default function Settings() {
  const { data: categories, isLoading } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const archiveCategory = useArchiveCategory()

  const classificationsQuery = useCategoryClassifications()
  const createClassification = useCreateCategoryClassification()
  const updateClassification = useUpdateCategoryClassification()
  const deleteClassification = useDeleteCategoryClassification()

  const displayNameQuery = useDisplayName()
  const updateDisplayName = useUpdateDisplayName()
  const primaryCurrencyQuery = usePrimaryCurrency()
  const updatePrimaryCurrency = useUpdatePrimaryCurrency()
  const accountsQuery = useAccounts()

  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Tables<'categories'> | null>(null)
  const [archivingCategory, setArchivingCategory] = useState<Tables<'categories'> | null>(null)
  const [removingClassification, setRemovingClassification] =
    useState<ClassifiedCategory<PanelCategory> | null>(null)
  const [currencyCandidate, setCurrencyCandidate] = useState<string | null>(null)

  /** Cuentas en la moneda actual que conservarán su moneda si se confirma el cambio. */
  const keptAccounts = useMemo(() => {
    const current = primaryCurrencyQuery.data
    if (!current || !currencyCandidate) return 0
    return accountsKeptInCurrentCurrency(accountsQuery.data ?? [], current, currencyCandidate)
  }, [accountsQuery.data, primaryCurrencyQuery.data, currencyCandidate])

  const partition = useMemo(
    () =>
      partitionCategoriesForClassification(
        categories ?? [],
        classificationsQuery.data ?? NO_CLASSIFICATIONS,
      ),
    [categories, classificationsQuery.data],
  )

  const isClassifying =
    createClassification.isPending ||
    updateClassification.isPending ||
    deleteClassification.isPending

  function openCreateForm() {
    setEditingCategory(null)
    setFormOpen(true)
  }

  /** Cambiar la moneda en el selector solo prepara el cambio; hay que confirmarlo. */
  function handleCurrencySelect(value: string) {
    const current = primaryCurrencyQuery.data
    if (!current || value === current) return
    setCurrencyCandidate(value)
  }

  async function handleCurrencyConfirm() {
    const candidate = currencyCandidate
    if (!candidate) return

    try {
      await updatePrimaryCurrency.mutateAsync(candidate)
      toast.success('Moneda principal actualizada')
    } catch (error) {
      toast.error('No se pudo cambiar la moneda principal', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setCurrencyCandidate(null)
    }
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

  function reportClassificationError(error: unknown, fallback: string) {
    const known = error instanceof ClassificationError ? error : null
    toast.error(fallback, { description: known?.message })
  }

  async function handleClassify(categoryId: string, group: ClassificationGroup) {
    try {
      await createClassification.mutateAsync({ categoryId, group })
      toast.success('Categoría clasificada')
    } catch (error) {
      reportClassificationError(error, 'No se pudo clasificar la categoría')
    }
  }

  async function handleChangeGroup(classificationId: string, group: ClassificationGroup) {
    try {
      await updateClassification.mutateAsync({ classificationId, group })
      toast.success('Clasificación actualizada')
    } catch (error) {
      reportClassificationError(error, 'No se pudo cambiar el grupo')
    }
  }

  async function handleRemoveClassification() {
    const target = removingClassification
    if (!target?.classificationId) return

    try {
      await deleteClassification.mutateAsync(target.classificationId)
      toast.success('Clasificación eliminada')
    } catch (error) {
      reportClassificationError(error, 'No se pudo quitar la clasificación')
    } finally {
      setRemovingClassification(null)
    }
  }

  async function handleDisplayNameSave(displayName: string) {
    try {
      await updateDisplayName.mutateAsync(displayName)
      toast.success('Nombre actualizado')
    } catch (error) {
      toast.error('No se pudo guardar el nombre', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ajustes</h1>
          <p className="text-sm text-muted-foreground">Perfil, preferencias y categorías</p>
        </div>
        <Button type="button" onClick={openCreateForm}>
          <Plus className="size-4" aria-hidden="true" />
          Nueva categoría
        </Button>
      </div>

      <section className="mt-8" aria-labelledby="settings-profile-title">
        <h2 id="settings-profile-title" className="text-lg font-semibold text-foreground">
          Perfil
        </h2>
        <p className="text-sm text-muted-foreground">
          El nombre con el que te saluda el Dashboard.
        </p>

        {displayNameQuery.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">Cargando perfil...</p>
        ) : (
          // La clave remonta el formulario cuando llega o cambia el nombre, para
          // que el campo muestre el valor guardado.
          <DisplayNameForm
            key={displayNameQuery.data ?? ''}
            defaultName={displayNameQuery.data ?? ''}
            isSaving={updateDisplayName.isPending}
            onSave={handleDisplayNameSave}
          />
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-foreground">Moneda principal</h2>
        <p className="text-sm text-muted-foreground">
          En qué moneda se presentan tus totales en todas las pantallas. Tus cuentas conservan su
          moneda: esto no migra ninguna.
        </p>

        <div className="mt-4 flex max-w-xs flex-col gap-2">
          <Label htmlFor="primary-currency">Moneda principal</Label>
          <Select
            id="primary-currency"
            value={primaryCurrencyQuery.data ?? ''}
            disabled={primaryCurrencyQuery.isPending}
            onChange={(event) => handleCurrencySelect(event.target.value)}
          >
            {currencyOptions().map((currency) => (
              <option key={currency.code} value={currency.code}>
                {currency.label}
              </option>
            ))}
          </Select>
        </div>
      </section>

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

      {!isLoading && (
        <ClassificationPanel
          unclassified={partition.unclassified}
          classified={partition.classified}
          historical={partition.historical}
          hasNoExpenseCategories={
            (categories ?? []).filter((category) => category.type === 'expense').length === 0
          }
          isBusy={isClassifying}
          onClassify={handleClassify}
          onChangeGroup={handleChangeGroup}
          onRemove={setRemovingClassification}
        />
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

      <ConfirmDialog
        open={removingClassification !== null}
        onOpenChange={(open) => !open && setRemovingClassification(null)}
        title="Quitar la clasificación"
        description={`"${removingClassification?.category.name}" volverá a contar como gasto sin clasificar en el Plan mensual, en todos los meses. La categoría y sus movimientos no se tocan.`}
        confirmLabel="Quitar"
        onConfirm={handleRemoveClassification}
      />

      <ConfirmDialog
        open={currencyCandidate !== null}
        onOpenChange={(open) => !open && setCurrencyCandidate(null)}
        title="Cambiar la moneda principal"
        description={
          keptAccounts > 0
            ? `Tienes ${keptAccounts} ${keptAccounts === 1 ? 'cuenta' : 'cuentas'} en ${primaryCurrencyQuery.data}. La moneda principal pasará a ser ${currencyCandidate}, pero esas cuentas conservarán su moneda y sus totales aparecerán aparte.`
            : `Los totales de todas las pantallas se presentarán en ${currencyCandidate}. Ninguna cuenta cambia de moneda.`
        }
        confirmLabel="Cambiar moneda"
        onConfirm={handleCurrencyConfirm}
      />
    </div>
  )
}

interface DisplayNameFormProps {
  defaultName: string
  isSaving: boolean
  onSave: (displayName: string) => void | Promise<void>
}

/** Nombre del perfil, con la misma regla que el onboarding (entre 1 y 60 caracteres). */
function DisplayNameForm({ defaultName, isSaving, onSave }: DisplayNameFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DisplayNameValues>({
    resolver: zodResolver(displayNameSchema),
    mode: 'onBlur',
    defaultValues: { displayName: defaultName },
  })

  return (
    <form
      className="mt-4 flex max-w-sm flex-col gap-2"
      onSubmit={handleSubmit((values) => onSave(values.displayName))}
      noValidate
    >
      <Label htmlFor="profile-display-name">Nombre</Label>
      <div className="flex gap-2">
        <Input
          id="profile-display-name"
          autoComplete="given-name"
          aria-invalid={!!errors.displayName}
          aria-describedby={errors.displayName ? 'profile-display-name-error' : undefined}
          {...register('displayName')}
        />
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          Guardar
        </Button>
      </div>
      {errors.displayName && (
        <p id="profile-display-name-error" className="text-sm text-destructive">
          {errors.displayName.message}
        </p>
      )}
    </form>
  )
}
