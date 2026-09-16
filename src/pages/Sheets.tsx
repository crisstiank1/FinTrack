import { useEffect, useMemo, useState } from 'react'
import { Columns3, FileSpreadsheet, Loader2, Plus, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useAccounts } from '@/features/accounts/hooks'
import { useCategories } from '@/features/categories/hooks'
import { SheetGrid, type RegisterSummary } from '@/features/sheets/components/sheet-grid'
import { useRegisterDrafts } from '@/features/sheets/hooks/use-register-drafts'
import {
  useCreateDraft,
  useCreateSheet,
  useDeleteDraft,
  useSheetDrafts,
  useSheets,
  useUpdateDraftCells,
  useUpdateSheetColumns,
} from '@/features/sheets/hooks/use-sheet-drafts'
import {
  FIXED_CELL_FIELDS,
  isValidCustomColumnId,
  sheetColumnsSchema,
  sheetNameSchema,
  type DraftCells,
  type SheetColumn,
} from '@/features/sheets/schemas'

function slugifyColumnId(label: string, taken: ReadonlySet<string>): string {
  const base = label
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^[0-9_]+/, '')
  const candidate = base || 'columna'
  const reserved = new Set<string>(FIXED_CELL_FIELDS)
  if (!reserved.has(candidate) && !taken.has(candidate) && isValidCustomColumnId(candidate)) {
    return candidate
  }
  let suffix = 1
  while (
    reserved.has(`${candidate}_${suffix}`) ||
    taken.has(`${candidate}_${suffix}`) ||
    !isValidCustomColumnId(`${candidate}_${suffix}`)
  ) {
    suffix += 1
  }
  return `${candidate}_${suffix}`
}

interface ColumnsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sheetName: string
  columns: SheetColumn[]
  isSaving: boolean
  onSave: (columns: SheetColumn[]) => Promise<void>
}

/**
 * Editor de columnas propias de la hoja. El id es un slug estable: renombrar
 * cambia la etiqueta, no el id, y eliminar una columna no pierde datos (la RPC
 * reconstruye `custom_fields` desde `sheets.columns` al registrar).
 */
function ColumnsDialog({
  open,
  onOpenChange,
  sheetName,
  columns,
  isSaving,
  onSave,
}: ColumnsDialogProps) {
  const [local, setLocal] = useState<SheetColumn[]>([])
  const [draftLabel, setDraftLabel] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLocal(columns)
      setDraftLabel('')
      setError(null)
    }
  }, [open, columns])

  function updateLabel(id: string, label: string) {
    setLocal((current) =>
      current.map((column) => (column.id === id ? { ...column, label } : column)),
    )
  }

  function removeColumn(id: string) {
    setLocal((current) =>
      current
        .filter((column) => column.id !== id)
        .map((column, index) => ({ ...column, position: index })),
    )
  }

  function addColumn() {
    const label = draftLabel.trim()
    if (!label) return
    const taken = new Set(local.map((column) => column.id))
    setLocal((current) => [
      ...current,
      { id: slugifyColumnId(label, taken), label, type: 'text', position: current.length },
    ])
    setDraftLabel('')
    setError(null)
  }

  async function handleSave() {
    const parsed = sheetColumnsSchema.safeParse(local)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'La definición de columnas no es válida')
      return
    }
    await onSave(
      parsed.data.map(({ id, label, type, position }) => ({ id, label, type, position })),
    )
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Columnas de «{sheetName}»</DialogTitle>
          <DialogDescription>
            Hasta 20 columnas propias de texto, además de los campos fijos del movimiento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {local.map((column) => (
            <div key={column.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  className="h-9"
                  value={column.label}
                  aria-label="Etiqueta de la columna"
                  onChange={(event) => updateLabel(column.id, event.target.value)}
                />
                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={column.id}>
                  {column.id} · se mantiene al renombrar
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 shrink-0"
                aria-label={`Eliminar columna ${column.label}`}
                onClick={() => removeColumn(column.id)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="new-column-label">Nueva columna</Label>
            <Input
              id="new-column-label"
              className="mt-1 h-9"
              value={draftLabel}
              placeholder="Etiqueta (p. ej. Proveedor)"
              onChange={(event) => setDraftLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addColumn()
                }
              }}
            />
          </div>
          <Button type="button" variant="outline" onClick={addColumn}>
            <Plus className="size-4" aria-hidden="true" />
            Añadir
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Guardar columnas
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function Sheets() {
  const navigate = useNavigate()

  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null)
  const [newSheetOpen, setNewSheetOpen] = useState(false)
  const [newSheetName, setNewSheetName] = useState('')
  const [newSheetError, setNewSheetError] = useState<string | null>(null)
  const [columnsOpen, setColumnsOpen] = useState(false)

  const sheetsQuery = useSheets()
  const createSheetMutation = useCreateSheet()
  const updateColumnsMutation = useUpdateSheetColumns()
  const draftsQuery = useSheetDrafts(selectedSheetId)
  const createDraftMutation = useCreateDraft()
  const updateDraftCellsMutation = useUpdateDraftCells()
  const deleteDraftMutation = useDeleteDraft()
  const registerDrafts = useRegisterDrafts()

  const accountsQuery = useAccounts()
  const categoriesQuery = useCategories()

  const sheets = useMemo(() => sheetsQuery.data ?? [], [sheetsQuery.data])

  useEffect(() => {
    if (
      !sheetsQuery.isLoading &&
      sheets.length > 0 &&
      !sheets.some((sheet) => sheet.id === selectedSheetId)
    ) {
      setSelectedSheetId(sheets[0].id)
    }
  }, [sheetsQuery.isLoading, sheets, selectedSheetId])

  const selectedSheet = sheets.find((sheet) => sheet.id === selectedSheetId) ?? null

  const columnDefs = useMemo(() => {
    if (!selectedSheet) return []
    const parsed = sheetColumnsSchema.safeParse(selectedSheet.columns)
    if (!parsed.success) return []
    return parsed.data.map(({ id, label, type, position }) => ({ id, label, type, position }))
  }, [selectedSheet])

  async function handleCreateSheet() {
    const name = newSheetName.trim()
    const parsed = sheetNameSchema.safeParse(name)
    if (!parsed.success) {
      setNewSheetError(parsed.error.issues[0]?.message ?? 'Nombre inválido')
      return
    }
    try {
      const sheet = await createSheetMutation.mutateAsync({ name, columns: [] })
      setSelectedSheetId(sheet.id)
      setNewSheetOpen(false)
      setNewSheetName('')
      setNewSheetError(null)
      toast.success('Hoja creada')
    } catch (error) {
      toast.error('No se pudo crear la hoja', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  async function handleSaveColumns(columns: SheetColumn[]) {
    if (!selectedSheet) return
    try {
      await updateColumnsMutation.mutateAsync({ sheetId: selectedSheet.id, columns })
      toast.success('Columnas guardadas')
    } catch (error) {
      toast.error('No se pudieron guardar las columnas', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  function handleSave(draftId: string, cells: DraftCells) {
    updateDraftCellsMutation.mutate(
      { draftId, cells },
      {
        onError: (error) => {
          toast.error('No se pudo guardar la fila', {
            description: error instanceof Error ? error.message : undefined,
          })
        },
      },
    )
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Hojas</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Captura estructurada de movimientos antes de registrarlos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setNewSheetOpen(true)}
            disabled={sheetsQuery.isLoading}
          >
            <Plus className="size-4" aria-hidden="true" />
            Nueva hoja
          </Button>
        </div>
      </div>

      {sheetsQuery.isLoading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Cargando hojas…
        </p>
      ) : sheets.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed p-10 text-center">
          <FileSpreadsheet className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-semibold text-foreground">Crea tu primera hoja</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Una hoja agrupa borradores con la misma plantilla de columnas. Los registras cuando los
            tengas completos.
          </p>
          <Button type="button" className="mt-4" onClick={() => setNewSheetOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nueva hoja
          </Button>
        </div>
      ) : (
        <>
          {selectedSheet && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="min-w-56 sm:min-w-72">
                <Label htmlFor="sheet-select" className="sr-only">
                  Hoja
                </Label>
                <Select
                  id="sheet-select"
                  className="h-10"
                  value={selectedSheet.id}
                  onChange={(event) => setSelectedSheetId(event.target.value)}
                >
                  {sheets.map((sheet) => (
                    <option key={sheet.id} value={sheet.id}>
                      {sheet.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setColumnsOpen(true)}
              >
                <Columns3 className="size-4" aria-hidden="true" />
                Columnas
              </Button>
            </div>
          )}

          <div className="mt-4">
            <SheetGrid
              drafts={draftsQuery.data ?? []}
              columnDefs={columnDefs}
              accounts={accountsQuery.data ?? []}
              categories={categoriesQuery.data ?? []}
              isRegistering={registerDrafts.isPending}
              onSave={handleSave}
              onAddRow={() => {
                if (!selectedSheet) return
                createDraftMutation.mutate(
                  { sheetId: selectedSheet.id, cells: {} },
                  {
                    onError: (error) => {
                      toast.error('No se pudo añadir la fila', {
                        description: error instanceof Error ? error.message : undefined,
                      })
                    },
                  },
                )
              }}
              onRemoveRow={(draftId) => {
                deleteDraftMutation.mutate(draftId, {
                  onSuccess: () => toast.success('Borrador eliminado'),
                  onError: (error) => {
                    toast.error('No se pudo eliminar el borrador', {
                      description: error instanceof Error ? error.message : undefined,
                    })
                  },
                })
              }}
              onRegister={async (draftIds): Promise<RegisterSummary> => {
                if (!selectedSheet) return { requested: 0, registered: 0, remaining: 0 }
                const outcomes = await registerDrafts.mutateAsync({
                  sheetId: selectedSheet.id,
                  draftIds,
                })
                const registered = outcomes.filter((outcome) => outcome.ok).length
                const requested = outcomes.length
                const remaining = (draftsQuery.data ?? []).length - registered
                return { requested, registered, remaining }
              }}
              onViewMovements={() => navigate('/ledger')}
            />
          </div>
        </>
      )}

      <Dialog open={newSheetOpen} onOpenChange={setNewSheetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva hoja</DialogTitle>
            <DialogDescription>
              Ponle nombre a la hoja; las columnas propias se añaden después.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="new-sheet-name">Nombre</Label>
            <Input
              id="new-sheet-name"
              className="mt-1"
              value={newSheetName}
              placeholder="p. ej. Gastos de la casa"
              onChange={(event) => {
                setNewSheetName(event.target.value)
                setNewSheetError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleCreateSheet()
                }
              }}
            />
            {newSheetError && <p className="mt-1 text-sm text-destructive">{newSheetError}</p>}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNewSheetOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleCreateSheet()}
              disabled={createSheetMutation.isPending}
            >
              {createSheetMutation.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Crear
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {selectedSheet && (
        <ColumnsDialog
          open={columnsOpen}
          onOpenChange={setColumnsOpen}
          sheetName={selectedSheet.name}
          columns={columnDefs}
          isSaving={updateColumnsMutation.isPending}
          onSave={handleSaveColumns}
        />
      )}
    </div>
  )
}
