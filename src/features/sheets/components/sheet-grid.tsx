import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { formatAmount } from '@/lib/currency'
import type { Tables } from '@/types/database.types'

import type { SheetDraftRow } from '../api'
import {
  sheetErrorText,
  validateDraftRow,
  type DraftCells,
  type FieldError,
  type FixedCellField,
  type SheetColumn,
} from '../schemas'
import { AmountCell, InputCell, SelectCell, type SelectOption } from './sheet-cell'
import { SheetRow } from './sheet-row'

/** Resumen devuelto por el registro para el diálogo posterior (docs/07). */
export interface RegisterSummary {
  requested: number
  registered: number
  /** Borradores que siguen en la rejilla tras el registro (incompletos + fallidos). */
  remaining: number
}

export interface SheetGridProps {
  drafts: SheetDraftRow[]
  columnDefs: SheetColumn[]
  accounts: Tables<'accounts'>[]
  categories: Tables<'categories'>[]
  isRegistering: boolean
  onSave: (draftId: string, cells: DraftCells) => void
  onAddRow: () => void
  onRemoveRow: (draftId: string) => void
  onRegister: (draftIds: string[]) => Promise<RegisterSummary>
  onViewMovements: () => void
}

const FIXED_DEFS: { id: FixedCellField; header: string; minWidthClass: string }[] = [
  { id: 'transaction_date', header: 'Fecha', minWidthClass: 'min-w-36' },
  { id: 'description', header: 'Descripción', minWidthClass: 'min-w-56' },
  { id: 'account_id', header: 'Cuenta', minWidthClass: 'min-w-48' },
  { id: 'type', header: 'Tipo', minWidthClass: 'min-w-28' },
  { id: 'category_id', header: 'Categoría', minWidthClass: 'min-w-48' },
  { id: 'amount_minor', header: 'Monto', minWidthClass: 'min-w-40' },
  { id: 'notes', header: 'Notas', minWidthClass: 'min-w-48' },
]

function movimientos(count: number): string {
  return count === 1 ? '1 movimiento' : `${count} movimientos`
}

function movimientoLabel(count: number): string {
  return count === 1 ? 'Registrar 1 movimiento' : `Registrar ${count} movimientos`
}

/**
 * Rejilla de borradores de una hoja. La edición es local con autoguardado al
 * salir de la celda (no tiene efecto financiero); la validación por fila
 * repite las reglas de `register_sheet_draft` para poder registrar solo lo que
 * la RPC aceptará. El registro pasa por una confirmación obligatoria con los
 * textos verbatim de docs/07.
 *
 * Los renderers de columna son estables: todo lo dinámico (valor, errores,
 * moneda) se lee de `stateRef`, que se actualiza en cada render. Así teclear
 * no regenera las columnas y los inputs no pierden el foco.
 */
export function SheetGrid({
  drafts,
  columnDefs,
  accounts,
  categories,
  isRegistering,
  onSave,
  onAddRow,
  onRemoveRow,
  onRegister,
  onViewMovements,
}: SheetGridProps) {
  const [edits, setEdits] = useState<Record<string, DraftCells>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeDraftId, setRemoveDraftId] = useState<string | null>(null)
  const [summary, setSummary] = useState<RegisterSummary | null>(null)
  const savedCellsRef = useRef<Record<string, string>>({})
  const stateRef = useRef<{
    draftsById: Map<string, SheetDraftRow>
    accountsById: Map<string, Tables<'accounts'>>
    categoriesById: Map<string, Tables<'categories'>>
    edits: Record<string, DraftCells>
    errorsByDraft: Record<string, FieldError[]>
    errorMessages: Record<string, Record<string, string>>
    accountOptions: SelectOption[]
  }>({
    draftsById: new Map(),
    accountsById: new Map(),
    categoriesById: new Map(),
    edits: {},
    errorsByDraft: {},
    errorMessages: {},
    accountOptions: [],
  })

  const draftsById = useMemo(() => new Map(drafts.map((draft) => [draft.id, draft])), [drafts])
  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  )
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )
  const accountIds = useMemo(() => new Set(accounts.map((account) => account.id)), [accounts])
  const accountOptions = useMemo(
    () =>
      accounts
        .filter((account) => !account.is_archived)
        .map((account) => ({ value: account.id, label: account.name })),
    [accounts],
  )

  function mergedCells(draft: SheetDraftRow): DraftCells {
    return { ...(draft.cells as DraftCells), ...(edits[draft.id] ?? {}) }
  }

  const errorsByDraft = useMemo(() => {
    const byId: Record<string, FieldError[]> = {}
    for (const draft of drafts) {
      byId[draft.id] = validateDraftRow(mergedCells(draft), columnDefs, {
        accountIds,
        categoriesById,
      })
    }
    return byId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, edits, columnDefs, accounts, categories])

  const errorMessages = useMemo(() => {
    const byId: Record<string, Record<string, string>> = {}
    for (const [draftId, errors] of Object.entries(errorsByDraft)) {
      byId[draftId] = Object.fromEntries(
        errors.map((error) => [error.field, sheetErrorText(error.field, error.code)]),
      )
    }
    return byId
  }, [errorsByDraft])

  const validDraftIds = useMemo(
    () =>
      drafts
        .filter((draft) => (errorsByDraft[draft.id] ?? []).length === 0)
        .map((draft) => draft.id),
    [drafts, errorsByDraft],
  )
  const incompleteCount = drafts.length - validDraftIds.length

  // estado mutable, más reciente, para los renderers estables de columna
  stateRef.current = {
    draftsById,
    accountsById,
    categoriesById,
    edits,
    errorsByDraft,
    errorMessages,
    accountOptions,
  }

  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  // Sin ediciones pendientes, la primera firma guardada es la del servidor: así
  // salir de una celda intacta no dispara un autoguardado.
  useEffect(() => {
    for (const draft of drafts) {
      if (!edits[draft.id] && savedCellsRef.current[draft.id] === undefined) {
        savedCellsRef.current[draft.id] = JSON.stringify(draft.cells)
      }
    }
  }, [drafts, edits])

  function commitEdit(draftId: string, field: string, value: string) {
    setEdits((current) => ({
      ...current,
      [draftId]: { ...(current[draftId] ?? {}), [field]: value },
    }))
  }

  /** Cambiar el tipo limpia una categoría que ya no corresponde (como el formulario de movimientos). */
  function changeRowType(draftId: string, typeValue: string) {
    const state = stateRef.current
    const draft = state.draftsById.get(draftId)
    const merged = draft ? { ...(draft.cells as DraftCells), ...(state.edits[draftId] ?? {}) } : {}
    const category = merged.category_id ? state.categoriesById.get(merged.category_id) : undefined
    setEdits((current) => {
      const row = { ...(current[draftId] ?? {}) }
      row.type = typeValue
      if (category && category.type !== typeValue) row.category_id = ''
      return { ...current, [draftId]: row }
    })
  }

  /** Autoguardado al salir de la celda: solo si hay cambios respecto a lo guardado. */
  function saveRow(draftId: string) {
    const state = stateRef.current
    const draft = state.draftsById.get(draftId)
    if (!draft) return
    const merged = { ...(draft.cells as DraftCells), ...(state.edits[draftId] ?? {}) }
    const signature = JSON.stringify(merged)
    if (savedCellsRef.current[draftId] === signature) return
    savedCellsRef.current[draftId] = signature
    onSaveRef.current(draftId, merged)
  }

  function amountHelper(draftId: string): string | undefined {
    const state = stateRef.current
    const draft = state.draftsById.get(draftId)
    if (!draft) return undefined
    const merged = { ...(draft.cells as DraftCells), ...(state.edits[draftId] ?? {}) }
    if (!merged.amount_minor) return undefined
    const amount = Number(merged.amount_minor)
    const account = merged.account_id ? state.accountsById.get(merged.account_id) : undefined
    if (!account) return new Intl.NumberFormat('es-CO').format(amount)
    return formatAmount(amount, account.currency_code)
  }

  function mergedFor(draftId: string): DraftCells {
    const state = stateRef.current
    const draft = state.draftsById.get(draftId)
    const base = draft ? (draft.cells as DraftCells) : {}
    return { ...base, ...(state.edits[draftId] ?? {}) }
  }

  function renderFixedCell(field: FixedCellField, draftId: string) {
    const message = stateRef.current.errorMessages[draftId] ?? {}
    switch (field) {
      case 'transaction_date':
        return (
          <InputCell
            type="date"
            value={mergedFor(draftId)[field] ?? ''}
            onChange={(value) => commitEdit(draftId, field, value)}
            onBlur={() => saveRow(draftId)}
            error={message[field]}
          />
        )
      case 'description':
        return (
          <InputCell
            value={mergedFor(draftId)[field] ?? ''}
            onChange={(value) => commitEdit(draftId, field, value)}
            onBlur={() => saveRow(draftId)}
            error={message[field]}
            placeholder="Descripción"
            maxLength={250}
          />
        )
      case 'account_id':
        return (
          <SelectCell
            value={mergedFor(draftId)[field] ?? ''}
            onChange={(value) => commitEdit(draftId, field, value)}
            onBlur={() => saveRow(draftId)}
            error={message[field]}
            placeholder="Cuenta"
            label="Cuenta"
            options={stateRef.current.accountOptions}
          />
        )
      case 'type':
        return (
          <SelectCell
            value={mergedFor(draftId)[field] ?? ''}
            onChange={(value) => changeRowType(draftId, value)}
            onBlur={() => saveRow(draftId)}
            error={message[field]}
            placeholder="Tipo"
            label="Tipo"
            options={[
              { value: 'expense', label: 'Gasto' },
              { value: 'income', label: 'Ingreso' },
            ]}
          />
        )
      case 'category_id': {
        const merged = mergedFor(draftId)
        const available = categories.filter(
          (category) => !merged.type || category.type === merged.type,
        )
        return (
          <SelectCell
            value={merged[field] ?? ''}
            onChange={(value) => commitEdit(draftId, field, value)}
            onBlur={() => saveRow(draftId)}
            error={message[field]}
            placeholder="Categoría"
            label="Categoría"
            options={available.map((category) => ({ value: category.id, label: category.name }))}
          />
        )
      }
      case 'amount_minor': {
        const mergedDraft = mergedFor(draftId)
        const draftAccount = mergedDraft.account_id
          ? stateRef.current.accountsById.get(mergedDraft.account_id)
          : undefined
        return (
          <AmountCell
            value={mergedFor(draftId)[field] ?? ''}
            onChange={(value) => commitEdit(draftId, field, value)}
            onBlur={() => saveRow(draftId)}
            error={message[field]}
            helper={amountHelper(draftId)}
            currency={draftAccount?.currency_code ?? 'COP'}
          />
        )
      }
      case 'notes':
        return (
          <InputCell
            value={mergedFor(draftId)[field] ?? ''}
            onChange={(value) => commitEdit(draftId, field, value)}
            onBlur={() => saveRow(draftId)}
            error={message[field]}
            placeholder="Notas (opcional)"
            maxLength={1000}
          />
        )
    }
  }

  // Las columnas se construyen una sola vez por `columnDefs`: los valores
  // cambiantes se leen de `stateRef` dentro del renderer de cada celda.
  const columns = useMemo<ColumnDef<SheetDraftRow>[]>(() => {
    const fixed: ColumnDef<SheetDraftRow>[] = FIXED_DEFS.map(
      ({ id, header, minWidthClass }): ColumnDef<SheetDraftRow> => ({
        id,
        header: () => <span className={minWidthClass}>{header}</span>,
        cell: ({ row }) => renderFixedCell(id, row.original.id),
      }),
    )
    const custom: ColumnDef<SheetDraftRow>[] = columnDefs.map(
      (column): ColumnDef<SheetDraftRow> => ({
        id: column.id,
        header: () => <span className="min-w-40">{column.label}</span>,
        cell: ({ row }) => (
          <InputCell
            value={mergedFor(row.original.id)[column.id] ?? ''}
            onChange={(value) => commitEdit(row.original.id, column.id, value)}
            onBlur={() => saveRow(row.original.id)}
            error={stateRef.current.errorMessages[row.original.id]?.[`custom_fields.${column.id}`]}
            placeholder={column.label}
            maxLength={1000}
          />
        ),
      }),
    )
    return [...fixed, ...custom]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnDefs])

  const table = useReactTable({
    data: drafts,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const totalColumns = table.getAllLeafColumns().length + 1

  function openConfirm() {
    if (validDraftIds.length === 0) return
    setConfirmOpen(true)
  }

  async function handleConfirmRegister() {
    setConfirmOpen(false)
    const result = await onRegister(validDraftIds)
    setSummary(result)
  }

  const registerDescription =
    incompleteCount > 0
      ? `Se registrarán ${movimientos(validDraftIds.length)}. ${
          incompleteCount === 1
            ? '1 borrador incompleto permanecerá'
            : `${incompleteCount} borradores incompletos permanecerán`
        } en esta hoja para que los corrijas.`
      : `Se registrarán ${movimientos(validDraftIds.length)}.`

  const registerLabel = movimientoLabel(validDraftIds.length)

  const resultDescription = summary
    ? `${summary.registered === 1 ? '1 movimiento registrado' : `${summary.registered} movimientos registrados`} correctamente.${
        summary.remaining > 0
          ? ` ${summary.remaining === 1 ? '1 borrador permanece' : `${summary.remaining} borradores permanecen`} pendientes de completar.`
          : ''
      }`
    : ''

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Captura previa al registro: nada aquí afecta saldos, dashboard, presupuestos ni el Libro
          hasta que pulses «Registrar».
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAddRow}
            disabled={isRegistering}
          >
            <Plus className="size-4" aria-hidden="true" />
            Añadir fila
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={openConfirm}
            disabled={isRegistering || validDraftIds.length === 0}
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Registrar
          </Button>
        </div>
      </div>

      {isRegistering && (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          Registrando borradores…
        </p>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className="whitespace-nowrap px-2 py-2 text-left text-xs font-semibold text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
                <th
                  scope="col"
                  className="w-10 px-1 py-2 text-center text-xs font-semibold text-muted-foreground"
                >
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <SheetRow
                key={row.id}
                row={row}
                errors={errorsByDraft[row.original.id] ?? []}
                onRemove={(draftId) => setRemoveDraftId(draftId)}
              />
            ))}
            {drafts.length === 0 && (
              <tr>
                <td
                  colSpan={totalColumns}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  Añade la primera fila para empezar a cargar movimientos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Registrar movimientos"
        description={registerDescription}
        confirmLabel={registerLabel}
        onConfirm={handleConfirmRegister}
      />

      <AlertDialog open={summary !== null} onOpenChange={(open) => !open && setSummary(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registro completado</AlertDialogTitle>
            <AlertDialogDescription>{resultDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={onViewMovements}>Ver movimientos</AlertDialogAction>
            <AlertDialogAction onClick={() => setSummary(null)}>Seguir en Hoja</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDialog
        open={removeDraftId !== null}
        onOpenChange={(open) => !open && setRemoveDraftId(null)}
        title="Eliminar borrador"
        description="Se descartará esta fila. Todavía no afecta ni saldos ni movimientos."
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (removeDraftId) onRemoveRow(removeDraftId)
          setRemoveDraftId(null)
        }}
      />
    </div>
  )
}
