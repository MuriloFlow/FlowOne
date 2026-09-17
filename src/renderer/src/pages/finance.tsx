import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Banknote, ChevronRight, History, Percent, Target, TrendingUp } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { MetricCard } from '@/components/metric-card'
import { MonthSwitcher } from '@/components/month-switcher'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { ValuePending } from '@/components/value-pending'
import { SalesChart } from '@/components/sales-chart'
import {
  currentDateKey,
  currentMonthKey,
  formatBRLFromCents,
  formatBRLInput,
  formatCount,
  formatDateKey,
  formatPercent,
  isSunday,
  parseBRLToCents,
  parseOptionalBRLToCents,
  parseOptionalNumber,
  percentDelta,
  weekdayLabel,
  weekdayLong
} from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import type { FinanceDayRow, FinanceMetrics, FinanceStoreDayRow, StoreOption } from '../../../shared/operations'

type FinancePageProps = {
  storeId?: string | null
}

const ease = [0.22, 1, 0.36, 1] as const

function dayIsEmpty(day: FinanceDayRow): boolean {
  return day.saleCents === null && day.goalCents === null && day.lastYearCents === null && day.pu === null
}

function signedTone(delta: number | null): 'up' | 'down' | 'neutral' {
  if (delta === null || delta === 0) return 'neutral'
  return delta > 0 ? 'up' : 'down'
}

function formatSignedBRL(cents: number): string {
  const formatted = formatBRLFromCents(Math.abs(cents))
  if (cents > 0) return `+${formatted}`
  if (cents < 0) return `−${formatted}`
  return formatted
}

function formatSignedPercent(value: number): string {
  const formatted = `${Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  if (value > 0) return `+${formatted}`
  if (value < 0) return `−${formatted}`
  return formatted
}

function ratioPct(value: number, goal: number): number | null {
  if (goal <= 0) return null
  return Number(((value / goal) * 100).toFixed(1))
}

function financeMiniStats(data: FinanceMetrics, today: string) {
  const goal = data.monthSalesGoalCents
  const sales = data.salesThisMonthCents
  const completedPct = goal !== null ? ratioPct(sales, goal) : null
  const monthDelta = goal !== null && goal > 0 ? sales - goal : null
  const monthDeltaPct = goal !== null ? ratioPct(sales - goal, goal) : null

  const isCurrentMonth = data.monthKey === today.slice(0, 7)
  const elapsedDays = (isCurrentMonth ? data.days.filter((day) => day.dateKey <= today) : data.days).length
  const todayRow = data.days.find((day) => day.dateKey === today) ?? null
  const todaySale = data.saleTodayCents ?? todayRow?.saleCents ?? null
  const todayGoal = todayRow?.goalCents ?? null

  let daySale: number | null = null
  let dayGoal: number | null = null
  let dayScope: 'today' | 'month' = 'today'

  if (isCurrentMonth && todayGoal !== null && todayGoal > 0) {
    daySale = todaySale
    dayGoal = todayGoal
  } else {
    const rows = (isCurrentMonth ? data.days.filter((day) => day.dateKey <= today) : data.days).filter(
      (day) => day.goalCents !== null && day.goalCents > 0
    )
    if (rows.length > 0) {
      daySale = rows.reduce((sum, day) => sum + (day.saleCents ?? 0), 0)
      dayGoal = rows.reduce((sum, day) => sum + (day.goalCents ?? 0), 0)
      dayScope = 'month'
    }
  }

  const dayDelta = daySale !== null && dayGoal !== null && dayGoal > 0 ? daySale - dayGoal : null
  const dayDeltaPct = dayGoal !== null && daySale !== null ? ratioPct(daySale - dayGoal, dayGoal) : null
  const projectionCents = elapsedDays > 0 ? Math.round((sales / elapsedDays) * data.days.length) : null
  const projectionDelta =
    projectionCents !== null && goal !== null && goal > 0 ? projectionCents - goal : null
  const projectionDeltaPct =
    projectionCents !== null && goal !== null ? ratioPct(projectionCents - goal, goal) : null

  return {
    completedPct,
    monthDelta,
    monthDeltaPct,
    daySale,
    dayGoal,
    dayDelta,
    dayDeltaPct,
    dayScope,
    isCurrentMonth,
    elapsedDays,
    projectionCents,
    projectionDelta,
    projectionDeltaPct
  }
}

export function FinancePage({ storeId = null }: FinancePageProps) {
  const today = currentDateKey()
  const [data, setData] = useState<FinanceMetrics | null>(null)
  const [stores, setStores] = useState<StoreOption[]>([])
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    setSelectedDate(null)
  }, [storeId, monthKey])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([operations().getFinance(storeId, monthKey), operations().listStores()])
      .then(([payload, storeList]) => {
        if (!active) return
        setData(payload)
        setStores(storeList)
        setError(null)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(operationError(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [storeId, monthKey])

  const dayRow = data?.days.find((item) => item.dateKey === selectedDate) ?? null
  const dayStoreRows = useMemo(() => {
    if (!selectedDate || !data) return []
    return data.storeDays.filter((row) => row.dateKey === selectedDate)
  }, [data, selectedDate])

  async function reload(): Promise<void> {
    const payload = await operations().getFinance(storeId, monthKey)
    setData(payload)
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col">
        <div className="mb-6 h-8 w-40 animate-pulse rounded-full bg-white/5" />
        <FinanceSkeleton />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {selectedDate && dayRow ? (
          <motion.div
            key={`day:${selectedDate}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease }}
          >
            <DayDesk
              day={dayRow}
              storeRows={dayStoreRows}
              storeName={data?.storeName ?? null}
              onBack={() => setSelectedDate(null)}
              onRegister={() => setDialogOpen(true)}
            />
          </motion.div>
        ) : data ? (
          <motion.div
            key={`month:${monthKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease }}
          >
            <MonthDesk
              data={data}
              monthKey={monthKey}
              today={today}
              onMonthKey={setMonthKey}
              onOpenDay={setSelectedDate}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <DayDialog
        open={dialogOpen}
        dateKey={selectedDate}
        stores={stores}
        storeDays={data?.storeDays ?? []}
        defaultStoreId={storeId}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          void reload()
        }}
      />
    </div>
  )
}

function MonthDesk({
  data,
  monthKey,
  today,
  onMonthKey,
  onOpenDay
}: {
  data: FinanceMetrics
  monthKey: string
  today: string
  onMonthKey: (value: string) => void
  onOpenDay: (dateKey: string) => void
}) {
  const delta = percentDelta(data.salesThisMonthCents, data.salesLastMonthCents)
  const monthHint =
    data.monthSalesGoalCents === null
      ? 'Sem meta de valor no Card+'
      : data.remainingToMonthSalesGoalCents === 0
        ? 'Meta de valor do mês atingida'
        : `Faltam ${formatBRLFromCents(data.remainingToMonthSalesGoalCents ?? 0)} para a meta`
  const puHint =
    data.puAverage === null
      ? 'Nenhum PU registrado neste mês'
      : `Média de ${formatCount(data.puRegisteredDays)} ${data.puRegisteredDays === 1 ? 'dia' : 'dias'} com PU`
  const mini = financeMiniStats(data, today)
  const completedHint =
    data.monthSalesGoalCents === null
      ? 'Sem meta de valor no Card+'
      : mini.completedPct === null
        ? 'Meta zerada — sem divisão'
        : mini.completedPct >= 100
          ? 'Meta de valor concluída'
          : `Faltam ${formatPercent(Math.max(0, 100 - mini.completedPct)) ?? '—'} da meta`
  const monthDeltaHint =
    data.monthSalesGoalCents === null
      ? 'Sem meta de valor no Card+'
      : mini.monthDelta === null || mini.monthDeltaPct === null
        ? 'Meta zerada — sem divisão'
        : mini.monthDelta === 0
          ? 'Na meta do mês'
          : mini.monthDelta > 0
            ? `${formatSignedPercent(mini.monthDeltaPct)} acima da meta`
            : `${formatSignedPercent(mini.monthDeltaPct)} abaixo da meta`
  const dayHint =
    mini.dayGoal === null
      ? 'Sem meta do dia neste recorte'
      : mini.daySale === null
        ? 'Nenhuma venda do dia registrada'
        : mini.dayDelta === null || mini.dayDeltaPct === null
          ? 'Meta do dia zerada — sem divisão'
          : mini.dayScope === 'today'
            ? mini.dayDelta >= 0
              ? `${formatSignedPercent(mini.dayDeltaPct)} · base do dia batida`
              : `${formatSignedPercent(mini.dayDeltaPct)} · abaixo da base`
            : `${formatSignedPercent(mini.dayDeltaPct)} · soma das metas do dia`
  const projectionHint =
    mini.projectionCents === null
      ? 'Sem dias para projetar'
      : data.monthSalesGoalCents === null
        ? mini.isCurrentMonth
          ? `Ritmo de ${formatCount(mini.elapsedDays)} ${mini.elapsedDays === 1 ? 'dia' : 'dias'}`
          : 'Mês encerrado · sem meta de valor'
        : mini.projectionDeltaPct === null
          ? 'Meta zerada — sem divisão'
          : `${formatSignedPercent(mini.projectionDeltaPct)} vs meta no ritmo atual`

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[22px] text-[#F0EFEC]/88">Financeiro</h1>
        <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
          {data.storeName
            ? `Venda, meta do dia, last year e PU de ${data.storeName}. Clique no dia para registrar.`
            : 'Clique no dia para ver e registrar venda, meta, last year e PU daquela data.'}
        </p>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Venda do dia"
          value={data.saleTodayCents ?? 0}
          money
          empty={data.saleTodayCents === null}
          hint={
            data.saleTodayCents === null
              ? 'Nenhuma venda do dia registrada no Card+'
              : `${formatCount(data.storeCount)} ${data.storeCount === 1 ? 'unidade' : 'unidades'}`
          }
          icon={<Banknote className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Venda no mês"
          value={data.salesThisMonthCents}
          money
          hint={
            delta === null
              ? `${formatBRLFromCents(data.salesLastMonthCents)} no mês anterior`
              : `${delta > 0 ? '+' : ''}${delta}% vs mês anterior`
          }
          icon={<TrendingUp className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Meta de valor"
          value={data.monthSalesGoalCents ?? 0}
          money
          empty={data.monthSalesGoalCents === null}
          hint={monthHint}
          icon={
            data.monthSalesGoalCents === null ? (
              <AlertTriangle className="size-4" strokeWidth={1.7} />
            ) : (
              <Target className="size-4" strokeWidth={1.7} />
            )
          }
        />
        <MetricCard
          percent
          label="Média do PU"
          value={data.puAverage ?? 0}
          empty={data.puAverage === null}
          hint={puHint}
          icon={<Percent className="size-4" strokeWidth={1.7} />}
        />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-3">
        <MiniStat
          label="% concluído"
          value={mini.completedPct === null ? '—' : formatPercent(mini.completedPct) ?? '—'}
          hint={completedHint}
          tone={mini.completedPct === null ? 'neutral' : mini.completedPct >= 100 ? 'up' : 'down'}
        />
        <MiniStat
          label="Vs meta do mês"
          value={mini.monthDelta === null ? '—' : formatSignedBRL(mini.monthDelta)}
          hint={monthDeltaHint}
          tone={signedTone(mini.monthDelta)}
        />
        <MiniStat
          label={mini.dayScope === 'today' ? 'Vs meta do dia' : 'Vs metas do dia'}
          value={mini.dayDelta === null ? '—' : formatSignedBRL(mini.dayDelta)}
          hint={dayHint}
          tone={signedTone(mini.dayDelta)}
        />
        <MiniStat
          label="Projeção do mês"
          value={mini.projectionCents === null ? '—' : formatBRLFromCents(mini.projectionCents)}
          hint={projectionHint}
          tone={signedTone(mini.projectionDelta)}
        />
      </div>

      <div className="mt-3 grid shrink-0 grid-cols-[minmax(0,1fr)_280px] items-stretch gap-3">
        <section className="overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] text-[#F0EFEC]/82">Vendas dos últimos 12 meses</h2>
              <p className="mt-1 text-[12px] text-[#F0EFEC]/35">
                Venda registrada comparada à meta de valor do Card+.
              </p>
            </div>
            <div className="flex items-center gap-4 pt-1 text-[11px] text-[#F0EFEC]/40">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#8B8DFF]" />
                Venda
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#34D399]" />
                Meta
              </span>
            </div>
          </div>
          <SalesChart data={data.months} />
        </section>

        <aside className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
          <h2 className="text-[15px] text-[#F0EFEC]/82">Mês atual</h2>
          <p className="mt-1 text-[12px] text-[#F0EFEC]/35">Resumo do valor cadastrado no Card+ e do PU no FLOW.</p>
          <div className="mt-5 space-y-4">
            <AsideRow label="Unidades" value={formatCount(data.storeCount)} />
            <AsideRow label="Dias com venda" value={formatCount(data.registeredDaysThisMonth)} />
            <AsideRow
              label="Média do PU"
              value={data.puAverage === null ? null : formatPercent(data.puAverage)}
            />
            <AsideRow
              label="Meta restante"
              value={
                data.remainingToMonthSalesGoalCents === null
                  ? null
                  : formatBRLFromCents(data.remainingToMonthSalesGoalCents)
              }
            />
          </div>
        </aside>
      </div>

      <section className="mt-3 mb-8 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-[15px] text-[#F0EFEC]/82">Dias do mês</h2>
            <p className="mt-1 text-[12px] text-[#F0EFEC]/35">Todos os dias, com venda, meta, last year e PU.</p>
          </div>
          <MonthSwitcher value={monthKey} onChange={onMonthKey} />
        </div>
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
            <tr className="border-t border-white/[0.04]">
              <th className="px-5 py-2.5 font-medium">Dia</th>
              <th className="px-3 py-2.5 font-medium">Venda</th>
              <th className="px-3 py-2.5 font-medium">Meta</th>
              <th className="px-3 py-2.5 font-medium">Last Year</th>
              <th className="px-3 py-2.5 font-medium">PU</th>
              <th className="px-5 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.days.map((day) => {
              const sunday = isSunday(day.dateKey)
              const todayRow = day.dateKey === today
              return (
                <tr
                  key={day.dateKey}
                  onClick={() => onOpenDay(day.dateKey)}
                  className={cn(
                    'cursor-pointer border-t border-white/[0.035] transition-colors hover:bg-white/[0.035]',
                    todayRow ? 'bg-white/[0.03]' : null,
                    sunday ? 'text-[#F0EFEC]/36' : 'text-[#F0EFEC]/72'
                  )}
                >
                  <td className="px-5 py-3">
                    <p className="flex items-center gap-2">
                      <span className="capitalize">{weekdayLabel(day.dateKey)}</span>
                      <span>{formatDateKey(day.dateKey)}</span>
                      {todayRow ? (
                        <span className="rounded-full bg-[#F0EFEC]/10 px-1.5 py-0.5 text-[10px] tracking-wide text-[#F0EFEC]/55 uppercase">
                          Hoje
                        </span>
                      ) : null}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <MoneyCell cents={day.saleCents} />
                  </td>
                  <td className="px-3 py-3">
                    <MoneyCell cents={day.goalCents} />
                  </td>
                  <td className="px-3 py-3">
                    <MoneyCell cents={day.lastYearCents} />
                  </td>
                  <td className="px-3 py-3">
                    <PuCell pu={day.pu} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ChevronRight className="ml-auto size-3.5 text-[#F0EFEC]/22" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </>
  )
}

function DayDesk({
  day,
  storeRows,
  storeName,
  onBack,
  onRegister
}: {
  day: FinanceDayRow
  storeRows: FinanceStoreDayRow[]
  storeName: string | null
  onBack: () => void
  onRegister: () => void
}) {
  const empty = dayIsEmpty(day)

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-[13px] text-[#F0EFEC]/40 hover:text-[#F0EFEC]/70"
      >
        <ArrowLeft className="size-3.5" />
        Dias do mês
      </button>

      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[12px] text-[#F0EFEC]/35">Financeiro · {formatDateKey(day.dateKey)}</p>
          <h1 className="mt-1 text-[22px] capitalize text-[#F0EFEC]/88">{weekdayLong(day.dateKey)}</h1>
        </div>
        <button
          type="button"
          onClick={onRegister}
          className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
        >
          {empty ? 'Registrar o dia' : 'Atualizar o dia'}
        </button>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Venda do dia"
          value={day.saleCents ?? 0}
          money
          empty={day.saleCents === null}
          hint={
            day.saleCents === null
              ? 'Nenhuma venda deste dia no Card+'
              : storeName
                ? `Registrada em ${storeName}`
                : 'Registrada no Card+'
          }
          icon={<Banknote className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Meta do dia"
          value={day.goalCents ?? 0}
          money
          empty={day.goalCents === null}
          hint={day.goalCents === null ? 'Sem meta de valor neste dia' : 'Meta de venda desta data'}
          icon={<Target className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Last Year"
          value={day.lastYearCents ?? 0}
          money
          empty={day.lastYearCents === null}
          hint={day.lastYearCents === null ? 'Sem last year neste dia' : 'Venda da mesma data no ano anterior'}
          icon={<History className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          percent
          label="PU"
          value={day.pu ?? 0}
          empty={day.pu === null}
          hint={day.pu === null ? 'Sem PU neste dia' : 'PU / mix de peças no caixa'}
          icon={<Percent className="size-4" strokeWidth={1.7} />}
        />
      </div>

      <section className="mt-3 mb-8 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
        {empty ? (
          <EmptyState
            icon={<Banknote className="size-6" strokeWidth={1.6} />}
            title="Nada registrado neste dia"
            description="Registre a venda, a meta do dia, o last year e o PU. A venda entra no Card+; meta, last year e PU ficam no FLOW."
            actionLabel="Registrar o dia"
            onAction={onRegister}
          />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-[#1A1A1A] text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                <tr className="border-y border-white/[0.04]">
                  <th className="px-5 py-2.5 font-medium">Unidade</th>
                  <th className="px-3 py-2.5 font-medium">Venda</th>
                  <th className="px-3 py-2.5 font-medium">Meta</th>
                  <th className="px-3 py-2.5 font-medium">Last Year</th>
                  <th className="px-5 py-2.5 font-medium">PU</th>
                </tr>
              </thead>
              <tbody>
                {storeRows.map((row) => (
                  <tr key={`${row.dateKey}:${row.storeId}`} className="border-t border-white/[0.03] text-[#F0EFEC]/68">
                    <td className="px-5 py-3">{row.storeName}</td>
                    <td className="px-3 py-3">
                      <MoneyCell cents={row.saleCents} />
                    </td>
                    <td className="px-3 py-3">
                      <MoneyCell cents={row.goalCents} />
                    </td>
                    <td className="px-3 py-3">
                      <MoneyCell cents={row.lastYearCents} />
                    </td>
                    <td className="px-5 py-3">
                      <PuCell pu={row.pu} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function DayDialog({
  open,
  dateKey,
  stores,
  storeDays,
  defaultStoreId,
  onClose,
  onSaved
}: {
  open: boolean
  dateKey: string | null
  stores: StoreOption[]
  storeDays: FinanceStoreDayRow[]
  defaultStoreId?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [storeId, setStoreId] = useState('')
  const [amountText, setAmountText] = useState('')
  const [goalText, setGoalText] = useState('')
  const [lastYearText, setLastYearText] = useState('')
  const [puText, setPuText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setStoreId(defaultStoreId || stores[0]?.id || '')
  }, [open, defaultStoreId, stores])

  useEffect(() => {
    if (!open || !dateKey) return
    const row = storeDays.find((item) => item.dateKey === dateKey && item.storeId === storeId)
    setAmountText(row?.saleCents != null && row.saleCents > 0 ? formatBRLInput(row.saleCents) : '')
    setGoalText(row?.goalCents != null ? formatBRLInput(row.goalCents) : '')
    setLastYearText(row?.lastYearCents != null ? formatBRLInput(row.lastYearCents) : '')
    setPuText(row?.pu != null ? String(row.pu).replace('.', ',') : '')
  }, [open, dateKey, storeId, storeDays])

  async function submit(): Promise<void> {
    if (!dateKey || !storeId) return
    const pu = parseOptionalNumber(puText)
    if (puText.trim() && pu === null) {
      setError('PU inválido.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await operations().upsertFinanceDay({
        storeId,
        dateKey,
        amountInCents: parseBRLToCents(amountText),
        goalCents: parseOptionalBRLToCents(goalText),
        lastYearCents: parseOptionalBRLToCents(lastYearText),
        pu
      })
      onSaved()
      onClose()
    } catch (saveError) {
      setError(operationError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      title="Registrar o dia"
      description="A venda entra no Card+. Meta do dia, last year e PU ficam no FLOW desta unidade."
      onClose={onClose}
    >
      <div className="space-y-3.5 px-5 pb-5">
        {defaultStoreId ? null : (
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#F0EFEC]/45">Unidade</Label>
            <Select
              value={storeId}
              options={stores.map((store) => ({ value: store.id, label: store.name }))}
              placeholder="Selecionar unidade"
              onChange={setStoreId}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">Valor vendido</Label>
          <Input
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            placeholder="0,00"
            className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">Meta do dia</Label>
          <Input
            value={goalText}
            onChange={(event) => setGoalText(event.target.value)}
            placeholder="0,00"
            className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">Last Year</Label>
          <Input
            value={lastYearText}
            onChange={(event) => setLastYearText(event.target.value)}
            placeholder="0,00"
            className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">PU</Label>
          <Input
            value={puText}
            onChange={(event) => setPuText(event.target.value)}
            placeholder="30"
            className="h-9 rounded-[10px] border-white/[0.08] bg-white/[0.03] text-[13px]"
          />
          <p className="text-[12px] text-[#F0EFEC]/35">PU / mix de peças no caixa. Ex.: 30.</p>
        </div>
        {dateKey ? <p className="text-[12px] text-[#F0EFEC]/35">{weekdayLong(dateKey)}</p> : null}
        {error ? <p className="text-[12px] text-red-400/80">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 hover:bg-white/[0.04]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !storeId || !dateKey}
            onClick={() => void submit()}
            className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111] disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function MoneyCell({ cents }: { cents: number | null }) {
  if (cents === null) return <span className="text-[#F0EFEC]/28">—</span>
  return <>{formatBRLFromCents(cents)}</>
}

function PuCell({ pu }: { pu: number | null }) {
  if (pu === null) return <span className="text-[#F0EFEC]/28">—</span>
  return <>{formatPercent(pu)}</>
}

function AsideRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 last:border-0">
      <span className="text-[13px] text-[#F0EFEC]/40">{label}</span>
      {value === null ? (
        <ValuePending size="sm" />
      ) : (
        <span className="text-[13px] text-[#F0EFEC]/78">{value}</span>
      )}
    </div>
  )
}

function MiniStat({
  label,
  value,
  hint,
  tone = 'neutral'
}: {
  label: string
  value: string
  hint?: string
  tone?: 'up' | 'down' | 'neutral'
}) {
  return (
    <article className="flex h-full min-h-[92px] flex-col rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-4 py-3">
      <p className="text-[12px] text-[#F0EFEC]/38">{label}</p>
      <p
        className={cn(
          'mt-1 text-[18px] tracking-tight',
          tone === 'up' ? 'text-[#34D399]' : tone === 'down' ? 'text-red-300/85' : 'text-[#F0EFEC]/86'
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-auto pt-2 text-[11px] leading-snug text-[#F0EFEC]/30">{hint}</p> : null}
    </article>
  )
}

function FinanceSkeleton() {
  return (
    <div className="grid flex-1 grid-rows-[auto_1fr] gap-3">
      <div className="grid grid-cols-4 gap-3">
        <div className="h-[148px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[148px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[148px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[148px] animate-pulse rounded-[16px] bg-white/4" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="h-[92px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[92px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[92px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[92px] animate-pulse rounded-[16px] bg-white/4" />
      </div>
      <div className="min-h-[280px] animate-pulse rounded-[16px] bg-white/4" />
    </div>
  )
}
