import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, PiggyBank, Percent, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAccounts } from '@/features/accounts/hooks'
import { useCategories } from '@/features/categories/hooks'
import { BalanceHeroCard } from '@/features/dashboard/components/balance-hero-card'
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
import { RecentTransactions } from '@/features/dashboard/components/recent-transactions'
import { useAllTransactions } from '@/features/dashboard/hooks'
import {
  buildCategoryBreakdown,
  buildDashboardSummary,
  buildMonthlyTrend,
  buildRecentTransactions,
} from '@/features/dashboard/summary'
import { TransactionForm } from '@/features/transactions/components/transaction-form'
import { useCreateTransaction } from '@/features/transactions/hooks'
import type { TransactionFormValues } from '@/features/transactions/schemas'
import { formatAmount } from '@/lib/currency'
import { currentMonthKey, formatLongDate, formatMonthLabel, monthRange } from '@/lib/dates'

const TREND_MONTHS = 6

const percentFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

function formatRate(rate: number | null): string {
  return rate === null ? 'Sin ingresos' : `${percentFormatter.format(rate)} %`
}

export default function Dashboard() {
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [isFormOpen, setFormOpen] = useState(false)

  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const {
    data: transactions = [],
    isPending,
    isError,
    refetch,
  } = useAllTransactions()

  const createTransaction = useCreateTransaction()

  // El MVP no convierte divisas, así que se usa la moneda de la primera cuenta
  // como moneda de presentación (mismo criterio que /transactions).
  const currencyCode = accounts[0]?.currency_code ?? 'COP'

  const scope = useMemo(
    () => ({ accounts, transactions, monthKey, accountId }),
    [accounts, transactions, monthKey, accountId],
  )

  const summary = useMemo(() => buildDashboardSummary(scope), [scope])
  const trend = useMemo(() => buildMonthlyTrend(scope, TREND_MONTHS), [scope])
  const categorySlices = useMemo(
    () => buildCategoryBreakdown({ ...scope, categories }),
    [scope, categories],
  )
  const recent = useMemo(() => buildRecentTransactions(scope), [scope])

  const accountsById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const toolbarAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        ...account,
        name: account.is_archived ? `${account.name} (archivada)` : account.name,
      })),
    [accounts],
  )

  const selectedAccount = accountId ? accountsById.get(accountId) : undefined
  const scopeLabel = selectedAccount?.name ?? 'Todas las cuentas'
  const monthLabel = formatMonthLabel(monthKey)
  const asOfLabel = `Al ${formatLongDate(monthRange(monthKey).end)}`

  async function handleSubmit(values: TransactionFormValues) {
    try {
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
      setFormOpen(false)
    } catch (error) {
      toast.error('No se pudo guardar el movimiento', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground first-letter:uppercase">{monthLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DashboardToolbar
            monthKey={monthKey}
            onMonthChange={setMonthKey}
            accounts={toolbarAccounts}
            accountId={accountId}
            onAccountChange={setAccountId}
          />
          <Button
            type="button"
            className="hidden h-10 sm:inline-flex"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
            Registrar movimiento
          </Button>
        </div>
      </div>

      {isPending && <DashboardSkeleton />}

      {!isPending && isError && <DashboardError onRetry={() => void refetch()} />}

      {!isPending && !isError && transactions.length === 0 && (
        <DashboardEmptyState onCreate={() => setFormOpen(true)} />
      )}

      {!isPending && !isError && transactions.length > 0 && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <BalanceHeroCard
              className="sm:col-span-2 lg:row-span-2"
              balance={summary.balance}
              currencyCode={currencyCode}
              scopeLabel={scopeLabel}
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
                  No registraste gastos en {monthLabel}. Cuando lo hagas, verás aquí en qué se va tu
                  dinero.
                </PanelEmptyMessage>
              )}
            </DashboardPanel>
          </div>

          <DashboardPanel
            index={7}
            className="mt-4"
            title="Últimos movimientos"
            description={monthLabel}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/transactions">Ver todos</Link>
              </Button>
            }
          >
            {recent.length > 0 ? (
              <RecentTransactions
                transactions={recent}
                accountsById={accountsById}
                categoriesById={categoriesById}
                fallbackCurrency={currencyCode}
              />
            ) : (
              <PanelEmptyMessage>
                Sin movimientos en {monthLabel}. Usa el selector de mes para revisar otro período.
              </PanelEmptyMessage>
            )}
          </DashboardPanel>
        </>
      )}

      {/* En móvil el botón principal vive al alcance del pulgar. */}
      <Button
        type="button"
        onClick={() => setFormOpen(true)}
        aria-label="Registrar movimiento"
        className="fixed bottom-6 right-6 z-40 size-14 rounded-full shadow-lg sm:hidden"
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
    </div>
  )
}
