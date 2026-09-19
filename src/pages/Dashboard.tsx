import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Percent, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { PAGE_HELP } from '@/components/shared/page-help'
import { PageTitle } from '@/components/shared/page-title'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccounts } from '@/features/accounts/hooks'
import { selectBudgetCategories } from '@/features/budgets/categories'
import { BudgetAlerts, type BudgetAlertItem } from '@/features/budgets/components/budget-alerts'
import { BudgetForm, type BudgetFormSubmit } from '@/features/budgets/components/budget-form'
import { BudgetError } from '@/features/budgets/errors'
import { useBudgetProgress, useBudgets, useSaveBudget } from '@/features/budgets/hooks'
import { buildGlobalBudgetAlert } from '@/features/budgets/progress'
import { useCategories, useCreateCategory } from '@/features/categories/hooks'
import type { CategoryFormValues } from '@/features/categories/schemas'
import {
  AddBudgetDialog,
  type BudgetCategoryOption,
} from '@/features/dashboard/components/add-budget-dialog'
import { BalancePillars } from '@/features/dashboard/components/balance-pillars'
import {
  BudgetCategoryGrid,
  type BudgetCategoryItem,
} from '@/features/dashboard/components/budget-category-grid'
import { CategoryDonut } from '@/features/dashboard/components/category-donut'
import { DashboardPanel } from '@/features/dashboard/components/dashboard-panel'
import {
  DashboardEmptyState,
  DashboardError,
  DashboardSkeleton,
  PanelEmptyMessage,
} from '@/features/dashboard/components/dashboard-states'
import { DashboardToolbar } from '@/features/dashboard/components/dashboard-toolbar'
import { IncomeExpenseChart } from '@/features/dashboard/components/income-expense-chart'
import { KpiCard } from '@/features/dashboard/components/kpi-card'
import { QuickTransactionForm } from '@/features/dashboard/components/quick-transaction-form'
import { useAllTransactions } from '@/features/dashboard/hooks'
import {
  buildBalancePillars,
  buildCategoryBreakdown,
  buildDashboardSummary,
  buildMonthlyTrend,
  hasBudgetThisMonth,
} from '@/features/dashboard/summary'
import { useDisplayName, usePrimaryCurrency } from '@/features/profile/hooks'
import { TransactionForm } from '@/features/transactions/components/transaction-form'
import { useCreateTransaction } from '@/features/transactions/hooks'
import type { TransactionFormValues } from '@/features/transactions/schemas'
import { formatAmount, resolvePresentationCurrency, sortCurrencyCodes } from '@/lib/currency'
import { currentMonthKey, formatLongDate, formatMonthLabel, monthRange } from '@/lib/dates'

const TREND_MONTHS = 6

/** Descripción bajo el saludo. */
export const DASHBOARD_DESCRIPTION =
  'Este es el resumen de tu mes: registra movimientos y revisa cómo van tus cuentas y presupuestos.'

const percentFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

function formatRate(rate: number | null): string {
  return rate === null ? 'Sin ingresos' : `${percentFormatter.format(rate)} %`
}

/** 'USD', 'USD y ARS', 'USD, ARS y EUR'. */
function joinCurrencyCodes(codes: string[]): string {
  if (codes.length <= 1) return codes.join('')
  return `${codes.slice(0, -1).join(', ')} y ${codes[codes.length - 1]}`
}

export default function Dashboard() {
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [isFormOpen, setFormOpen] = useState(false)
  const [isAddBudgetOpen, setAddBudgetOpen] = useState(false)
  /** Categoría cuyo presupuesto se está editando. */
  const [editingBudget, setEditingBudget] = useState<BudgetCategoryItem | null>(null)

  const { data: accounts = [], isPending: accountsPending } = useAccounts()
  const { data: categories = [] } = useCategories()
  const {
    data: transactions = [],
    isPending: transactionsPending,
    isError,
    refetch,
  } = useAllTransactions()
  const primaryCurrency = usePrimaryCurrency()
  // Un nombre en blanco cuenta como ausente. Mientras carga, o si la consulta
  // falla, el saludo es «Hola» y se completa cuando llega.
  const displayName = useDisplayName().data?.trim()

  const createTransaction = useCreateTransaction()
  const createCategory = useCreateCategory()
  const saveBudget = useSaveBudget()

  // Sin cuentas ni moneda principal no se sabe en qué moneda presentar: se
  // espera en vez de mostrar un instante cifras en una moneda equivocada.
  // Si el perfil falla, `isPending` pasa a false y se usa la primera cuenta.
  const isPending = transactionsPending || accountsPending || primaryCurrency.isPending

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const selectedAccount = accountId ? accountsById.get(accountId) : undefined

  // FinTrack no convierte divisas: los totales solo suman cuentas de una moneda.
  // Con una cuenta elegida manda la suya; si no, la moneda de presentación.
  const currencyCode =
    selectedAccount?.currency_code ?? resolvePresentationCurrency(primaryCurrency.data, accounts)

  const otherCurrencies = useMemo(
    () =>
      sortCurrencyCodes(
        accounts.map((account) => account.currency_code),
        primaryCurrency.data,
      ).filter((code) => code !== currencyCode),
    [accounts, primaryCurrency.data, currencyCode],
  )
  const showsCurrencySplit = !selectedAccount && otherCurrencies.length > 0

  const scope = useMemo(
    () => ({ accounts, transactions, monthKey, accountId, currencyCode }),
    [accounts, transactions, monthKey, accountId, currencyCode],
  )

  const summary = useMemo(() => buildDashboardSummary(scope), [scope])
  const trend = useMemo(() => buildMonthlyTrend(scope, TREND_MONTHS), [scope])
  const categorySlices = useMemo(
    () => buildCategoryBreakdown({ ...scope, categories }),
    [scope, categories],
  )
  // Chips del formulario rápido: las categorías que más ha usado el mes en
  // pantalla van primero, que es lo que hace corta la lista visible. Sin
  // movimientos en el mes no hay ranking y quedan en orden alfabético, el de
  // `fetchCategories`.
  const frequentCategoryIds = useMemo(() => {
    const uses = new Map<string, number>()
    for (const transaction of transactions) {
      if (!transaction.category_id) continue
      if (!transaction.transaction_date.startsWith(monthKey)) continue
      uses.set(transaction.category_id, (uses.get(transaction.category_id) ?? 0) + 1)
    }

    return [...uses.entries()].sort((a, b) => b[1] - a[1]).map(([categoryId]) => categoryId)
  }, [transactions, monthKey])

  const pillars = useMemo(
    () => buildBalancePillars(scope, primaryCurrency.data),
    [scope, primaryCurrency.data],
  )

  // Los presupuestos no tienen dimensión de cuenta: se reparten por categoría
  // sobre el gasto del mes. Por eso el panel no reacciona al filtro de cuenta,
  // aunque la alerta global sí, porque sale del resumen en pantalla.
  //
  // Tampoco guardan moneda: van siempre en la de presentación, igual que en
  // /budgets y /plan, aunque se elija una cuenta en otra moneda. Sin esto, un
  // presupuesto de 700.000 se leería «USD 700.000» al filtrar una cuenta USD.
  const budgetCurrencyCode = resolvePresentationCurrency(primaryCurrency.data, accounts)
  const budgetsQuery = useBudgets()
  const budgetCategories = useMemo(
    () => selectBudgetCategories(categories, budgetsQuery.data ?? [], monthKey),
    [categories, budgetsQuery.data, monthKey],
  )
  const budgetCategoryIds = useMemo(
    () => budgetCategories.map((category) => category.id),
    [budgetCategories],
  )
  const budgetProgress = useBudgetProgress({
    monthKey,
    categoryIds: budgetCategoryIds,
    currencyCode: primaryCurrency.isPending ? undefined : budgetCurrencyCode,
  })

  const budgetAlertItems = useMemo<BudgetAlertItem[]>(() => {
    const byId = new Map(budgetCategories.map((category) => [category.id, category]))

    return (budgetProgress.data ?? []).flatMap((progress) => {
      const category = byId.get(progress.categoryId)
      if (!category) return []

      return [
        {
          categoryId: category.id,
          categoryName: category.name,
          isArchived: category.is_archived,
          progress,
        },
      ]
    })
  }, [budgetCategories, budgetProgress.data])

  // La rejilla solo lleva lo que tiene presupuesto este mes, 0 incluido; lo
  // demás se ofrece desde «Agregar presupuesto».
  const budgetedItems = useMemo(
    () => budgetAlertItems.filter((item) => hasBudgetThisMonth(item.progress)),
    [budgetAlertItems],
  )
  const unbudgetedCategories = useMemo<BudgetCategoryOption[]>(
    () =>
      budgetAlertItems
        .filter((item) => !item.isArchived && !hasBudgetThisMonth(item.progress))
        .map((item) => ({ id: item.categoryId, name: item.categoryName })),
    [budgetAlertItems],
  )

  const globalBudgetAlert = useMemo(
    () => buildGlobalBudgetAlert(summary.income.currentMinor, summary.expense.currentMinor),
    [summary],
  )

  const toolbarAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        ...account,
        name: account.is_archived ? `${account.name} (archivada)` : account.name,
      })),
    [accounts],
  )

  const scopeLabel =
    selectedAccount?.name ??
    (showsCurrencySplit ? `Cuentas en ${currencyCode}` : 'Todas las cuentas')
  const isPastMonth = monthKey < currentMonthKey()
  const monthLabel = formatMonthLabel(monthKey)
  const asOfLabel = `Al ${formatLongDate(monthRange(monthKey).end)}`

  function toTransactionInput(values: TransactionFormValues) {
    return {
      type: values.type,
      account_id: values.accountId,
      category_id: values.categoryId,
      amount_minor: values.amount,
      transaction_date: values.transactionDate,
      description: values.description,
      notes: values.notes || null,
    }
  }

  function reportSaveError(error: unknown) {
    toast.error('No se pudo guardar el movimiento', {
      description: error instanceof Error ? error.message : undefined,
    })
  }

  async function handleSubmit(values: TransactionFormValues) {
    try {
      await createTransaction.mutateAsync(toTransactionInput(values))
      toast.success('Movimiento registrado')
      setFormOpen(false)
    } catch (error) {
      reportSaveError(error)
    }
  }

  /**
   * Alta desde el panel de la izquierda. El error se vuelve a lanzar para que el
   * formulario conserve lo escrito y se pueda reintentar sin teclearlo otra vez.
   */
  async function handleQuickSubmit(values: TransactionFormValues) {
    try {
      await createTransaction.mutateAsync(toTransactionInput(values))
      toast.success('Movimiento registrado')
    } catch (error) {
      reportSaveError(error)
      throw error
    }
  }

  /**
   * Guarda un presupuesto con el modelo de siempre (plantilla o excepción). Lanza
   * si falla, para que el diálogo que lo pidió siga abierto.
   */
  async function saveBudgetFor(categoryId: string, { amountMinor, scope }: BudgetFormSubmit) {
    try {
      await saveBudget.mutateAsync({
        amountMinor,
        intent: { kind: scope, categoryId, monthKey },
      })
      toast.success('Presupuesto guardado')
    } catch (error) {
      if (error instanceof BudgetError && error.code === 'conflict') {
        // La lista ya se refrescó sola; no se reintenta ni se sobrescribe nada.
        toast.error('El presupuesto cambió en otra sesión', { description: error.message })
      } else {
        toast.error('No se pudo guardar el presupuesto', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
      throw error
    }
  }

  async function handleEditBudget(values: BudgetFormSubmit) {
    if (!editingBudget) return

    try {
      await saveBudgetFor(editingBudget.categoryId, values)
      setEditingBudget(null)
    } catch {
      // Ya se avisó; el diálogo sigue abierto para corregir o reintentar.
    }
  }

  /** Crea la categoría de gasto desde «Agregar presupuesto» y la devuelve elegida. */
  async function handleCreateCategory(values: CategoryFormValues): Promise<BudgetCategoryOption> {
    try {
      const created = await createCategory.mutateAsync({ ...values, type: 'expense' })
      toast.success('Categoría creada')
      return { id: created.id, name: created.name }
    } catch (error) {
      toast.error('No se pudo crear la categoría', {
        description: error instanceof Error ? error.message : undefined,
      })
      throw error
    }
  }

  const addBudgetButton = (
    <Button type="button" variant="outline" size="sm" onClick={() => setAddBudgetOpen(true)}>
      <Plus className="size-4" aria-hidden="true" />
      Agregar presupuesto
    </Button>
  )

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      {/* Cabecera: el mes y la cuenta filtran toda la vista, así que viven junto
          al título y no dentro de una columna. En móvil bajan bajo el título. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle helpTitle="Dashboard" help={PAGE_HELP.dashboard}>
            {displayName ? `Hola, ${displayName}` : 'Hola'}
          </PageTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">{DASHBOARD_DESCRIPTION}</p>
          <p className="mt-1 text-sm text-muted-foreground first-letter:uppercase">{monthLabel}</p>
          {showsCurrencySplit && (
            <p className="mt-1 text-sm text-muted-foreground">
              Cifras en {currencyCode}. Tus cuentas en {joinCurrencyCodes(otherCurrencies)} no se
              suman: su saldo aparece aparte, sin convertir.
            </p>
          )}
        </div>

        {/* Grupo con nombre: hay otro selector «Cuenta» en el alta rápida, y
            este es el que filtra la vista. */}
        <div role="group" aria-label="Mes y cuenta" className="flex flex-wrap items-center gap-2">
          <DashboardToolbar
            monthKey={monthKey}
            onMonthChange={setMonthKey}
            accounts={toolbarAccounts}
            accountId={accountId}
            onAccountChange={setAccountId}
          />
        </div>
      </div>

      {/*
        Dos columnas a partir de 1024px: a la izquierda el alta rápida, a la
        derecha las cifras. Por debajo de 1024px el alta vive en el botón
        flotante y su diálogo: el formulario arriba empujaría las cifras fuera
        de la pantalla.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <aside className="mt-6 hidden flex-col gap-4 lg:flex">
          <DashboardPanel index={0} title="Cargar movimiento" description="Se registra al instante">
            <QuickTransactionForm
              accounts={accounts}
              categories={categories}
              currencyCode={currencyCode}
              frequentCategoryIds={frequentCategoryIds}
              onSubmit={handleQuickSubmit}
              isSubmitting={createTransaction.isPending}
            />
          </DashboardPanel>
        </aside>

        {/* `min-w-0`: sin él, un gráfico ancho estiraría la columna y desbordaría
            la rejilla. */}
        <div className="flex min-w-0 flex-col">
          {isPending && <DashboardSkeleton />}

          {!isPending && isError && <DashboardError onRetry={() => void refetch()} />}

          {!isPending && !isError && transactions.length === 0 && (
            <DashboardEmptyState onCreate={() => setFormOpen(true)} />
          )}

          {!isPending && !isError && transactions.length > 0 && (
            <>
              {/* El primer vistazo: cuánto hay, cuánto se debe y qué queda.
                  Las cifras de otras monedas viven aparte, sin convertir. */}
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <BalancePillars
                  pillars={pillars}
                  currencyCode={currencyCode}
                  scopeLabel={scopeLabel}
                  asOfLabel={asOfLabel}
                />
              </div>

              {/* Cuatro cifras de desempeño del mes en fila cuando la columna
                  da de sí; antes, dos. */}
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  index={0}
                  label="Ingresos del mes"
                  value={formatAmount(summary.income.currentMinor, currencyCode)}
                  icon={ArrowDownLeft}
                  tone="income"
                  delta={summary.income.deltaPercent}
                  higherIsBetter
                  caption={`Antes ${formatAmount(summary.income.previousMinor, currencyCode)}`}
                />

                <KpiCard
                  index={1}
                  label="Gastos del mes"
                  value={formatAmount(summary.expense.currentMinor, currencyCode)}
                  icon={ArrowUpRight}
                  tone="expense"
                  delta={summary.expense.deltaPercent}
                  higherIsBetter={false}
                  caption={`Antes ${formatAmount(summary.expense.previousMinor, currencyCode)}`}
                />

                <KpiCard
                  index={2}
                  label="Ahorro neto"
                  value={formatAmount(summary.netSavings.currentMinor, currencyCode)}
                  icon={PiggyBank}
                  tone="savings"
                  delta={summary.netSavings.deltaPercent}
                  higherIsBetter
                  caption={`Antes ${formatAmount(summary.netSavings.previousMinor, currencyCode)}`}
                />

                <KpiCard
                  index={3}
                  label="Tasa de ahorro"
                  value={formatRate(summary.savingsRate.current)}
                  icon={Percent}
                  tone="savings"
                  delta={summary.savingsRate.deltaPoints}
                  deltaUnit="points"
                  higherIsBetter
                  caption={`Antes ${formatRate(summary.savingsRate.previous)}`}
                />
              </div>

              {/* Lado a lado solo desde 1280px: entre 1024 y 1279 la columna mide
                  ~620px y el donut con su leyenda no cabe en la mitad. */}
              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <DashboardPanel
                  index={5}
                  title="Ingresos vs. gastos"
                  description={`Últimos ${TREND_MONTHS} meses`}
                >
                  <IncomeExpenseChart trend={trend} currencyCode={currencyCode} />
                </DashboardPanel>

                <DashboardPanel index={6} title="Gasto por categoría" description={monthLabel}>
                  {categorySlices.length > 0 ? (
                    <CategoryDonut slices={categorySlices} currencyCode={currencyCode} />
                  ) : (
                    <PanelEmptyMessage>
                      No registraste gastos en {monthLabel}. Cuando lo hagas, verás aquí en qué se
                      va tu dinero.
                    </PanelEmptyMessage>
                  )}
                </DashboardPanel>
              </div>

              <DashboardPanel
                index={7}
                className="mt-4"
                title="Presupuestos"
                description={`${monthLabel} · en ${budgetCurrencyCode} · no cambia con el filtro de cuenta`}
                action={
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {addBudgetButton}
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/budgets?month=${monthKey}`}>Ver todos</Link>
                    </Button>
                  </div>
                }
              >
                <div className="flex flex-col gap-4">
                  {/* Dos monedas posibles en el mismo panel: la alerta global sale
                      del resumen en pantalla y va en su moneda; las de cada
                      presupuesto van en la de los presupuestos. */}
                  <BudgetAlerts
                    items={[]}
                    globalAlert={globalBudgetAlert}
                    currencyCode={currencyCode}
                    linkToMonth={monthKey}
                  />
                  <BudgetAlerts
                    items={budgetedItems}
                    globalAlert={null}
                    currencyCode={budgetCurrencyCode}
                    linkToMonth={monthKey}
                  />

                  {budgetedItems.length > 0 ? (
                    <BudgetCategoryGrid
                      items={budgetedItems}
                      currencyCode={budgetCurrencyCode}
                      onEdit={setEditingBudget}
                      isSubmitting={saveBudget.isPending}
                    />
                  ) : (
                    <PanelEmptyMessage>
                      <span className="flex flex-col items-center gap-3">
                        <span>
                          Todavía no tienes presupuestos en {monthLabel}. Agrega uno para ver cuánto
                          te queda en cada categoría.
                        </span>
                        {addBudgetButton}
                      </span>
                    </PanelEmptyMessage>
                  )}
                </div>
              </DashboardPanel>
            </>
          )}
        </div>
      </div>

      {/* Por debajo de 1024px el alta vive aquí, al alcance del pulgar. */}
      <Button
        type="button"
        onClick={() => setFormOpen(true)}
        aria-label="Registrar movimiento"
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg lg:hidden"
      >
        <Plus className="size-6" aria-hidden="true" />
      </Button>

      <Dialog open={isFormOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo movimiento</DialogTitle>
          </DialogHeader>
          <TransactionForm
            accounts={accounts}
            categories={categories}
            currencyCode={currencyCode}
            onSubmit={handleSubmit}
            submitLabel="Registrar movimiento"
            isSubmitting={createTransaction.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingBudget !== null}
        onOpenChange={(open) => !open && setEditingBudget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Presupuesto de {editingBudget?.categoryName}</DialogTitle>
          </DialogHeader>
          {editingBudget && (
            <BudgetForm
              key={editingBudget.categoryId}
              monthKey={monthKey}
              // Un 0 explícito llega con `budgetMinor` nulo pero con origen: el
              // campo tiene que abrir con 0, no vacío.
              defaultAmountMinor={
                editingBudget.progress.budgetMinor ??
                (hasBudgetThisMonth(editingBudget.progress) ? 0 : undefined)
              }
              allowTemplate={!isPastMonth}
              amountInputVariant="symbol"
              isSubmitting={saveBudget.isPending}
              onSubmit={handleEditBudget}
            />
          )}
        </DialogContent>
      </Dialog>

      <AddBudgetDialog
        open={isAddBudgetOpen}
        onOpenChange={setAddBudgetOpen}
        categories={unbudgetedCategories}
        monthKey={monthKey}
        allowTemplate={!isPastMonth}
        onCreateCategory={handleCreateCategory}
        onSaveBudget={(category, values) => saveBudgetFor(category.id, values)}
        isCreatingCategory={createCategory.isPending}
        isSavingBudget={saveBudget.isPending}
      />
    </div>
  )
}
