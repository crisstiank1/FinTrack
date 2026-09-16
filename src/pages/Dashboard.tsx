import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Percent, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccounts } from '@/features/accounts/hooks'
import { selectBudgetCategories } from '@/features/budgets/categories'
import { BudgetAlerts, type BudgetAlertItem } from '@/features/budgets/components/budget-alerts'
import { BudgetError } from '@/features/budgets/errors'
import { useBudgetProgress, useBudgets, useSaveBudget } from '@/features/budgets/hooks'
import { buildGlobalBudgetAlert } from '@/features/budgets/progress'
import { useCategories } from '@/features/categories/hooks'
import { BalanceHeroCard } from '@/features/dashboard/components/balance-hero-card'
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
import { RecentTransactions } from '@/features/dashboard/components/recent-transactions'
import { useAllTransactions } from '@/features/dashboard/hooks'
import {
  buildCategoryBreakdown,
  buildCurrencyBalances,
  buildDashboardSummary,
  buildMonthlyTrend,
  buildRecentTransactions,
} from '@/features/dashboard/summary'
import { usePrimaryCurrency } from '@/features/profile/hooks'
import { TransactionForm } from '@/features/transactions/components/transaction-form'
import { useCreateTransaction, useUpdateTransaction } from '@/features/transactions/hooks'
import type { TransactionFormValues } from '@/features/transactions/schemas'
import { formatAmount, resolvePresentationCurrency, sortCurrencyCodes } from '@/lib/currency'
import { currentMonthKey, formatLongDate, formatMonthLabel, monthRange } from '@/lib/dates'
import type { Tables } from '@/types/database.types'

const TREND_MONTHS = 6

/** Movimientos del mes que caben en la columna sin obligar a desplazarse mucho. */
const RECENT_LIMIT = 10

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
  /** Movimiento que se está editando desde la lista; `null` es alta. */
  const [editingTransaction, setEditingTransaction] = useState<Tables<'transactions'> | null>(null)

  const { data: accounts = [], isPending: accountsPending } = useAccounts()
  const { data: categories = [] } = useCategories()
  const {
    data: transactions = [],
    isPending: transactionsPending,
    isError,
    refetch,
  } = useAllTransactions()
  const primaryCurrency = usePrimaryCurrency()

  const createTransaction = useCreateTransaction()
  const updateTransaction = useUpdateTransaction()
  const saveBudget = useSaveBudget()

  // Sin cuentas ni moneda principal no se sabe en qué moneda presentar: se
  // espera en vez de mostrar un instante cifras en una moneda equivocada.
  // Si el perfil falla, `isPending` pasa a false y se usa la primera cuenta.
  const isPending = transactionsPending || accountsPending || primaryCurrency.isPending

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
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
  const recent = useMemo(() => buildRecentTransactions(scope, RECENT_LIMIT), [scope])
  // Chips del formulario rápido: las categorías que más ha usado el mes en
  // pantalla van primero, que es lo que hace corta la lista visible.
  const frequentCategoryIds = useMemo(() => {
    const uses = new Map<string, number>()
    for (const transaction of transactions) {
      if (!transaction.category_id) continue
      if (!transaction.transaction_date.startsWith(monthKey)) continue
      uses.set(transaction.category_id, (uses.get(transaction.category_id) ?? 0) + 1)
    }

    return [...uses.entries()].sort((a, b) => b[1] - a[1]).map(([categoryId]) => categoryId)
  }, [transactions, monthKey])

  const otherBalances = useMemo(
    () =>
      showsCurrencySplit
        ? buildCurrencyBalances(scope, primaryCurrency.data).filter(
            (balance) => balance.currencyCode !== currencyCode,
          )
        : [],
    [showsCurrencySplit, scope, primaryCurrency.data, currencyCode],
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

  /** Los mismos campos al crear y al editar: el formulario ya los validó. */
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

  function openCreateDialog() {
    setEditingTransaction(null)
    setFormOpen(true)
  }

  function closeMovementDialog() {
    setFormOpen(false)
    setEditingTransaction(null)
  }

  /**
   * Editar desde la lista del dashboard. Solo ingresos y gastos: una
   * transferencia son dos patas y se edita donde se ven las dos, en
   * `/transactions` o en el libro (M8).
   */
  function openEditDialog(transactionId: string) {
    const transaction = transactions.find((row) => row.id === transactionId)
    if (!transaction || transaction.type === 'transfer') return

    setEditingTransaction(transaction)
    setFormOpen(true)
  }

  async function handleSubmit(values: TransactionFormValues) {
    try {
      if (editingTransaction) {
        await updateTransaction.mutateAsync({
          id: editingTransaction.id,
          input: toTransactionInput(values),
        })
        toast.success('Movimiento actualizado')
      } else {
        await createTransaction.mutateAsync(toTransactionInput(values))
        toast.success('Movimiento registrado')
      }
      closeMovementDialog()
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

  async function handleBudgetSave(
    item: BudgetCategoryItem,
    { amount, scope }: { amount: number; scope: 'template' | 'exception' },
  ) {
    try {
      await saveBudget.mutateAsync({
        amountMinor: amount,
        intent: { kind: scope, categoryId: item.categoryId, monthKey },
      })
      toast.success('Presupuesto guardado')
    } catch (error) {
      if (error instanceof BudgetError && error.code === 'conflict') {
        // La lista ya se refrescó sola; no se reintenta ni se sobrescribe nada.
        toast.error('El presupuesto cambió en otra sesión', { description: error.message })
        return
      }

      toast.error('No se pudo guardar el presupuesto', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground first-letter:uppercase">
            {monthLabel}
          </p>
          {showsCurrencySplit && (
            <p className="mt-1 text-sm text-muted-foreground">
              Cifras en {currencyCode}. Tus cuentas en {joinCurrencyCodes(otherCurrencies)} no se
              suman: su saldo aparece aparte, sin convertir.
            </p>
          )}
        </div>
      </div>

      {/*
        Dos columnas a partir de 1024px: a la izquierda lo que se escribe —cargar
        un movimiento, elegir mes y cuenta—, a la derecha lo que se lee. Los
        movimientos del mes cierran la página a lo ancho: en una columna lateral
        quedaban estrechos y obligaban a truncar descripciones.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <aside className="mt-6 flex flex-col gap-4">
          {/* En móvil el alta vive en el botón flotante y su diálogo: un
              formulario aquí empujaría todas las cifras fuera de la pantalla. */}
          <DashboardPanel
            index={0}
            className="hidden sm:flex"
            title="Cargar movimiento"
            description="Se registra al instante"
          >
            <QuickTransactionForm
              accounts={accounts}
              categories={categories}
              currencyCode={currencyCode}
              frequentCategoryIds={frequentCategoryIds}
              onSubmit={handleQuickSubmit}
              isSubmitting={createTransaction.isPending}
            />
          </DashboardPanel>

          <DashboardPanel index={1} title="Mes y cuenta">
            <div className="flex flex-col gap-3">
              <DashboardToolbar
                monthKey={monthKey}
                onMonthChange={setMonthKey}
                accounts={toolbarAccounts}
                accountId={accountId}
                onAccountChange={setAccountId}
              />
              <Button
                type="button"
                variant="outline"
                className="hidden w-full sm:inline-flex"
                onClick={openCreateDialog}
              >
                <Plus className="size-4" aria-hidden="true" />
                Movimiento completo
              </Button>
            </div>
          </DashboardPanel>
        </aside>

        {/* `min-w-0`: sin él, una tabla o un gráfico ancho estiraría la columna
            central y desbordaría la rejilla. */}
        <div className="flex min-w-0 flex-col">
          {isPending && <DashboardSkeleton />}

          {!isPending && isError && <DashboardError onRetry={() => void refetch()} />}

          {!isPending && !isError && transactions.length === 0 && (
            <DashboardEmptyState onCreate={() => setFormOpen(true)} />
          )}

          {!isPending && !isError && transactions.length > 0 && (
            <>
              {/* Cuatro cifras en fila cuando la columna da de sí; antes, dos. */}
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <BalanceHeroCard
                  className="sm:col-span-2 xl:row-span-2"
                  balance={summary.balance}
                  currencyCode={currencyCode}
                  scopeLabel={scopeLabel}
                  otherBalances={otherBalances}
                  asOfLabel={asOfLabel}
                  trend={trend}
                />

                <KpiCard
                  index={1}
                  label="Ingresos del mes"
                  value={formatAmount(summary.income.currentMinor, currencyCode)}
                  icon={ArrowDownLeft}
                  tone="income"
                  delta={summary.income.deltaPercent}
                  higherIsBetter
                  caption={`Antes ${formatAmount(summary.income.previousMinor, currencyCode)}`}
                />

                <KpiCard
                  index={2}
                  label="Gastos del mes"
                  value={formatAmount(summary.expense.currentMinor, currencyCode)}
                  icon={ArrowUpRight}
                  tone="expense"
                  delta={summary.expense.deltaPercent}
                  higherIsBetter={false}
                  caption={`Antes ${formatAmount(summary.expense.previousMinor, currencyCode)}`}
                />

                <KpiCard
                  index={3}
                  label="Ahorro neto"
                  value={formatAmount(summary.netSavings.currentMinor, currencyCode)}
                  icon={PiggyBank}
                  tone="savings"
                  delta={summary.netSavings.deltaPercent}
                  higherIsBetter
                  caption={`Antes ${formatAmount(summary.netSavings.previousMinor, currencyCode)}`}
                />

                <KpiCard
                  index={4}
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

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
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
                description={`${monthLabel} · todas las cuentas`}
                action={
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/budgets?month=${monthKey}`}>Ver todos</Link>
                  </Button>
                }
              >
                {budgetAlertItems.length > 0 || globalBudgetAlert ? (
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
                      items={budgetAlertItems}
                      globalAlert={null}
                      currencyCode={budgetCurrencyCode}
                      linkToMonth={monthKey}
                    />

                    {budgetAlertItems.length > 0 && (
                      <BudgetCategoryGrid
                        items={budgetAlertItems}
                        currencyCode={budgetCurrencyCode}
                        monthKey={monthKey}
                        allowTemplate={!isPastMonth}
                        onSave={handleBudgetSave}
                        isSubmitting={saveBudget.isPending}
                      />
                    )}
                  </div>
                ) : (
                  <PanelEmptyMessage>
                    Todavía no repartes tu dinero en {monthLabel}. Crea una categoría de gasto y
                    aquí podrás ponerle presupuesto.
                  </PanelEmptyMessage>
                )}
              </DashboardPanel>
            </>
          )}
        </div>

        {/* Cierra la página a lo ancho, bajo las dos columnas. */}
        {!isPending && !isError && transactions.length > 0 && (
          <div className="min-w-0 lg:col-span-2">
            <DashboardPanel
              index={8}
              title="Últimos movimientos"
              description={monthLabel}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/transactions?month=${monthKey}`}>Ver todos</Link>
                </Button>
              }
            >
              {recent.length > 0 ? (
                <RecentTransactions
                  transactions={recent}
                  accountsById={accountsById}
                  categoriesById={categoriesById}
                  fallbackCurrency={currencyCode}
                  onEdit={openEditDialog}
                />
              ) : (
                <PanelEmptyMessage>
                  Sin movimientos en {monthLabel}. Usa el selector de mes para revisar otro período.
                </PanelEmptyMessage>
              )}
            </DashboardPanel>
          </div>
        )}
      </div>

      {/* En móvil el botón principal vive al alcance del pulgar. */}
      <Button
        type="button"
        onClick={openCreateDialog}
        aria-label="Registrar movimiento"
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg sm:hidden"
      >
        <Plus className="size-6" aria-hidden="true" />
      </Button>

      <Dialog open={isFormOpen} onOpenChange={(open) => !open && closeMovementDialog()}>
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
            onSubmit={handleSubmit}
            submitLabel={editingTransaction ? 'Guardar cambios' : 'Registrar movimiento'}
            isSubmitting={createTransaction.isPending || updateTransaction.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
