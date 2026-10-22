import { useMemo, useState, type ChangeEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileUp, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { PAGE_HELP } from '@/components/shared/page-help'
import { PageTitle } from '@/components/shared/page-title'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useAccounts } from '@/features/accounts/hooks'
import { useAuth } from '@/features/auth/auth-provider'
import { useCategories } from '@/features/categories/hooks'
import { suggestDecimalSeparator, type DecimalSeparator } from '@/features/csv-import/amounts'
import { createImportSheet, fetchExistingMovements } from '@/features/csv-import/api'
import { DATE_FORMAT_LABELS, detectDateFormat, type DateFormat } from '@/features/csv-import/dates'
import { importSheetName, toDraftCells } from '@/features/csv-import/drafts'
import { canInclude, includedByDefault, markDuplicates } from '@/features/csv-import/duplicates'
import { suggestMapping } from '@/features/csv-import/mapping'
import {
  configIssueText,
  EMPTY_MAPPING,
  issueText,
  normalizeRows,
  validateOptions,
  type AmountMode,
  type ColumnMapping,
  type ImportOptions,
  type ImportRow,
  type SignConvention,
} from '@/features/csv-import/normalize'
import { readCsvFile, readErrorText, type ParsedCsv } from '@/features/csv-import/read'
import { formatAmount } from '@/lib/currency'
import { supabase } from '@/lib/supabase'

const PREVIEW_ROWS = 5

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; optional?: boolean }[] = [
  { key: 'date', label: 'Fecha' },
  { key: 'description', label: 'Concepto o descripción' },
]

const STATUS_LABEL: Record<ImportRow['status'], string> = {
  valid: 'Lista',
  needs_review: 'Requiere revisión',
  invalid: 'Con errores',
}

function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function CsvImport() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const accountsQuery = useAccounts()
  const categoriesQuery = useCategories()

  const [fileName, setFileName] = useState<string | null>(null)
  const [csv, setCsv] = useState<ParsedCsv | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [isReading, setIsReading] = useState(false)

  const [accountId, setAccountId] = useState('')
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_MAPPING)
  const [amountMode, setAmountMode] = useState<AmountMode>('signed')
  const [signConvention, setSignConvention] = useState<SignConvention | null>(null)
  const [dateFormat, setDateFormat] = useState<DateFormat | null>(null)
  const [decimalSeparator, setDecimalSeparator] = useState<DecimalSeparator | null>(null)
  const [expenseCategoryId, setExpenseCategoryId] = useState('')
  const [incomeCategoryId, setIncomeCategoryId] = useState('')
  const [overrides, setOverrides] = useState<Map<number, boolean>>(new Map())
  const [isImporting, setIsImporting] = useState(false)

  const activeAccounts = (accountsQuery.data ?? []).filter((account) => !account.is_archived)
  const activeCategories = (categoriesQuery.data ?? []).filter((category) => !category.is_archived)
  const account = activeAccounts.find((candidate) => candidate.id === accountId) ?? null

  const dateDetection = useMemo(
    () =>
      csv && mapping.date !== null
        ? detectDateFormat(csv.rows.map((row) => row[mapping.date!] ?? ''))
        : null,
    [csv, mapping.date],
  )

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setIsReading(true)
    setReadError(null)
    setCsv(null)
    setOverrides(new Map())
    try {
      const result = await readCsvFile(file)
      if (!result.ok) {
        setReadError(readErrorText(result.code))
        return
      }
      const suggestion = suggestMapping(result.csv.headers)
      setFileName(file.name)
      setCsv(result.csv)
      setMapping(suggestion.mapping)
      setAmountMode(suggestion.amountMode)
      setSignConvention(null)

      const dates =
        suggestion.mapping.date !== null
          ? detectDateFormat(result.csv.rows.map((row) => row[suggestion.mapping.date!] ?? ''))
          : null
      // Solo se preselecciona un formato inequívoco. Si es ambiguo queda vacío
      // y la importación no avanza hasta que el usuario lo elija.
      setDateFormat(dates?.suggested ?? null)

      const amountColumns = [
        suggestion.mapping.amount,
        suggestion.mapping.debit,
        suggestion.mapping.credit,
      ]
      const amountValues = result.csv.rows.flatMap((row) =>
        amountColumns.filter((index): index is number => index !== null).map((index) => row[index]),
      )
      setDecimalSeparator(suggestDecimalSeparator(amountValues))
    } finally {
      setIsReading(false)
      event.target.value = ''
    }
  }

  const options: ImportOptions = {
    mapping,
    amountMode,
    signConvention,
    dateFormat,
    decimalSeparator,
    account,
    defaultCategories: {
      expense: activeCategories.find((category) => category.id === expenseCategoryId) ?? null,
      income: activeCategories.find((category) => category.id === incomeCategoryId) ?? null,
    },
  }
  const configIssues = csv ? validateOptions(options) : []
  const normalized = useMemo(
    () => (csv && configIssues.length === 0 ? normalizeRows(csv.rows, options, csv.lines) : []),
    // `options` se reconstruye en cada render; sus partes son las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      csv,
      configIssues.length,
      mapping,
      amountMode,
      signConvention,
      dateFormat,
      decimalSeparator,
      account?.id,
      expenseCategoryId,
      incomeCategoryId,
    ],
  )

  const dates = normalized.flatMap((row) => (row.date ? [row.date] : [])).sort()
  const range = dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null

  const existingQuery = useQuery({
    queryKey: ['csv-import-existing', user?.id, account?.id, range?.from, range?.to],
    queryFn: () => fetchExistingMovements(supabase, user!.id, account!.id, range!.from, range!.to),
    enabled: !!user && !!account && !!range,
  })

  const rows = useMemo(
    () =>
      account && existingQuery.data
        ? markDuplicates(normalized, account.id, existingQuery.data)
        : normalized,
    [normalized, account, existingQuery.data],
  )

  const isIncluded = (row: ImportRow) =>
    canInclude(row) && (overrides.get(row.sourceLine) ?? includedByDefault(row))
  const selected = rows.filter(isIncluded)
  const counts = {
    valid: rows.filter((row) => row.status === 'valid').length,
    review: rows.filter((row) => row.status === 'needs_review').length,
    invalid: rows.filter((row) => row.status === 'invalid').length,
    duplicates: rows.filter((row) =>
      row.warnings.some((w) => w.code === 'likely_duplicate' || w.code === 'possible_duplicate'),
    ).length,
  }

  async function handleImport() {
    if (!user || !account || !fileName || selected.length === 0) return
    setIsImporting(true)
    try {
      const { sheetId, created } = await createImportSheet(
        supabase,
        user.id,
        importSheetName(fileName, todayIso()),
        selected.map((row) => toDraftCells(row, account.id, fileName)),
      )
      await queryClient.invalidateQueries({ queryKey: ['sheets', user.id] })
      toast.success(`${created} borradores creados`, {
        description: 'Revísalos, asigna categorías y regístralos desde Hojas.',
      })
      navigate(`/sheets?sheet=${sheetId}`)
    } catch (error) {
      toast.error('No se pudieron crear los borradores', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setIsImporting(false)
    }
  }

  /**
   * Cambia una columna del mapeo. Si cambia la fecha o el monto, lo que el
   * usuario confirmó para la columna anterior ya no vale: se vuelve a detectar
   * el formato de fecha (vacío si la nueva columna es ambigua) y a proponer el
   * separador decimal. Sin esto, un DMY elegido para una columna inequívoca se
   * aplicaría en silencio a otra ambigua.
   */
  function changeColumn(key: keyof ColumnMapping, index: number | null) {
    const next = { ...mapping, [key]: index }
    setMapping(next)
    if (!csv) return

    if (key === 'date') {
      const detection =
        index === null ? null : detectDateFormat(csv.rows.map((row) => row[index] ?? ''))
      setDateFormat(detection?.suggested ?? null)
    }
    if (key === 'amount' || key === 'debit' || key === 'credit') {
      const columns = [next.amount, next.debit, next.credit].filter(
        (column): column is number => column !== null,
      )
      setDecimalSeparator(
        suggestDecimalSeparator(csv.rows.flatMap((row) => columns.map((column) => row[column]))),
      )
    }
  }

  function columnSelect(key: keyof ColumnMapping, label: string, optional = false) {
    const id = `csv-map-${key}`
    return (
      <div key={key} className="flex flex-col gap-2">
        <Label htmlFor={id}>
          {label}
          {optional && <span className="text-muted-foreground"> (opcional)</span>}
        </Label>
        <Select
          id={id}
          value={mapping[key] === null ? '' : String(mapping[key])}
          onChange={(event) =>
            changeColumn(key, event.target.value === '' ? null : Number(event.target.value))
          }
        >
          <option value="">Sin asignar</option>
          {csv!.headers.map((header, index) => (
            <option key={index} value={index}>
              {header}
            </option>
          ))}
        </Select>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <PageTitle helpTitle="Importar CSV" help={PAGE_HELP.csvImport}>
        Importar CSV
      </PageTitle>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>No se publicarán movimientos automáticamente.</li>
        <li>Podrás revisar y categorizar los movimientos antes de publicarlos.</li>
        <li>Las filas con errores no serán importadas hasta que las corrijas.</li>
        <li>El archivo se lee en tu navegador y no se guarda.</li>
      </ul>

      <section
        className="mt-6 flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
        aria-labelledby="csv-step-file"
      >
        <h2 id="csv-step-file" className="text-lg font-semibold">
          1. Archivo
        </h2>
        <Label htmlFor="csv-file">Extracto en CSV (máximo 5 MB)</Label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv,.txt"
          onChange={handleFile}
          className="w-full cursor-pointer rounded-xl border border-dashed border-input bg-surface-elevated/60 p-3 text-sm text-muted-foreground transition-colors hover:border-primary/60 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-border file:bg-card file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground file:shadow-xs hover:file:bg-primary/8 hover:file:text-primary-strong"
        />
        {isReading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Leyendo archivo...
          </p>
        )}
        {readError && (
          <p role="alert" className="text-sm text-destructive">
            {readError}
          </p>
        )}
        {csv && (
          <p className="text-sm text-muted-foreground">
            {fileName}: {csv.rows.length} filas · separador{' '}
            {csv.delimiter === '\t' ? 'tabulador' : `«${csv.delimiter}»`} · codificación{' '}
            {csv.encoding === 'utf-8' ? 'UTF-8' : 'Windows-1252 (revisa las tildes)'}
          </p>
        )}
      </section>

      {csv && (
        <>
          <section
            className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
            aria-labelledby="csv-step-preview"
          >
            <h2 id="csv-step-preview" className="text-lg font-semibold">
              2. Vista previa
            </h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {csv.headers.map((header, index) => (
                      <th key={index} scope="col" className="px-3 py-2 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csv.rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-border">
                      {row.map((value, index) => (
                        <td key={index} className="whitespace-nowrap px-3 py-2">
                          {value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            className="mt-6 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 sm:grid-cols-2"
            aria-labelledby="csv-step-mapping"
          >
            <h2 id="csv-step-mapping" className="text-lg font-semibold sm:col-span-2">
              3. Cuenta y columnas
            </h2>
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv-account">Cuenta de FinTrack</Label>
              <Select
                id="csv-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              >
                <option value="">Elige una cuenta</option>
                {activeAccounts.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.currency_code})
                  </option>
                ))}
              </Select>
              {account && (
                <p className="text-xs text-muted-foreground">
                  Los montos se interpretan en {account.currency_code}, la moneda de la cuenta.
                </p>
              )}
            </div>
            {MAPPING_FIELDS.map((field) => columnSelect(field.key, field.label))}
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv-amount-mode">Cómo vienen los montos</Label>
              <Select
                id="csv-amount-mode"
                value={amountMode}
                onChange={(event) => setAmountMode(event.target.value as AmountMode)}
              >
                <option value="signed">Una columna con signo</option>
                <option value="debit_credit">Columnas separadas de débito y crédito</option>
              </Select>
            </div>
            {amountMode === 'signed'
              ? columnSelect('amount', 'Monto')
              : [
                  columnSelect('debit', 'Débito (gastos)'),
                  columnSelect('credit', 'Crédito (ingresos)'),
                ]}
            {columnSelect('balance', 'Saldo', true)}
          </section>

          <section
            className="mt-6 grid gap-4 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 sm:grid-cols-3"
            aria-labelledby="csv-step-format"
          >
            <h2 id="csv-step-format" className="text-lg font-semibold sm:col-span-3">
              4. Formato
            </h2>
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv-date-format">Formato de fecha</Label>
              <Select
                id="csv-date-format"
                value={dateFormat ?? ''}
                onChange={(event) =>
                  setDateFormat(
                    event.target.value === '' ? null : (event.target.value as DateFormat),
                  )
                }
              >
                <option value="">Elige el formato</option>
                {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((format) => (
                  <option key={format} value={format}>
                    {DATE_FORMAT_LABELS[format]}
                    {dateDetection?.candidates.includes(format) ? '' : ' (no encaja)'}
                  </option>
                ))}
              </Select>
              {dateDetection?.ambiguous && (
                <p role="status" className="text-xs text-amber-700 dark:text-amber-400">
                  Las fechas encajan en más de un formato. Confirma cuál usa tu banco.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv-decimal">Separador decimal</Label>
              <Select
                id="csv-decimal"
                value={decimalSeparator ?? ''}
                onChange={(event) =>
                  setDecimalSeparator(
                    event.target.value === '' ? null : (event.target.value as DecimalSeparator),
                  )
                }
              >
                <option value="">Elige el separador</option>
                <option value=",">Coma (1.234,56)</option>
                <option value=".">Punto (1,234.56)</option>
              </Select>
            </div>
            {amountMode === 'signed' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="csv-sign">Un monto negativo es</Label>
                <Select
                  id="csv-sign"
                  value={signConvention ?? ''}
                  onChange={(event) =>
                    setSignConvention(
                      event.target.value === '' ? null : (event.target.value as SignConvention),
                    )
                  }
                >
                  <option value="">Confirma la convención</option>
                  <option value="negative_is_expense">Un gasto (positivo = ingreso)</option>
                  <option value="positive_is_expense">Un ingreso (positivo = gasto)</option>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv-expense-category">Categoría para gastos (opcional)</Label>
              <Select
                id="csv-expense-category"
                value={expenseCategoryId}
                onChange={(event) => setExpenseCategoryId(event.target.value)}
              >
                <option value="">Asignar después</option>
                {activeCategories
                  .filter((category) => category.type === 'expense')
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="csv-income-category">Categoría para ingresos (opcional)</Label>
              <Select
                id="csv-income-category"
                value={incomeCategoryId}
                onChange={(event) => setIncomeCategoryId(event.target.value)}
              >
                <option value="">Asignar después</option>
                {activeCategories
                  .filter((category) => category.type === 'income')
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
            </div>
          </section>

          <section
            className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6"
            aria-labelledby="csv-step-review"
          >
            <h2 id="csv-step-review" className="text-lg font-semibold">
              5. Revisión
            </h2>
            {configIssues.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                {configIssues.map((issue) => (
                  <li key={issue}>{configIssueText(issue)}</li>
                ))}
              </ul>
            ) : (
              <>
                <p role="status" className="mt-2 text-sm text-muted-foreground">
                  {counts.valid} listas · {counts.review} requieren revisión · {counts.invalid} con
                  errores · {counts.duplicates} posibles duplicados
                  {existingQuery.isFetching && ' · comprobando duplicados...'}
                </p>
                <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Incluir
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Línea
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Fecha
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Descripción
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Tipo
                        </th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">
                          Monto
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.sourceLine} className="border-t border-border align-top">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Importar línea ${row.sourceLine}`}
                              disabled={!canInclude(row)}
                              checked={isIncluded(row)}
                              onChange={(event) =>
                                setOverrides((current) =>
                                  new Map(current).set(row.sourceLine, event.target.checked),
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2 tabular-nums">{row.sourceLine}</td>
                          <td className="whitespace-nowrap px-3 py-2">{row.date ?? '—'}</td>
                          <td className="px-3 py-2">{row.description || '—'}</td>
                          <td className="px-3 py-2">
                            {row.type === 'expense'
                              ? 'Gasto'
                              : row.type === 'income'
                                ? 'Ingreso'
                                : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            {row.amountMinor !== null && account
                              ? formatAmount(row.amountMinor, account.currency_code)
                              : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium">{STATUS_LABEL[row.status]}</span>
                            {[...row.errors, ...row.warnings].map((issue, index) => (
                              <span key={index} className="block text-xs text-muted-foreground">
                                {issueText(issue)}
                              </span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={configIssues.length > 0 || selected.length === 0 || isImporting}
              onClick={handleImport}
            >
              {isImporting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileUp className="size-4" aria-hidden="true" />
              )}
              Importar {selected.length} filas como borradores
            </Button>
            <p className="text-sm text-muted-foreground">
              Se creará una hoja nueva. Nada se registra hasta que lo hagas tú desde Hojas.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
