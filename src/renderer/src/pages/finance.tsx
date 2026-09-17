import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Banknote, ChevronRight, Target, TrendingUp } from 'lucide-react'
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
  isSunday,
  parseBRLToCents,
  percentDelta,
  weekdayLabel,
  weekdayLong
} from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import type { FinanceDayRow, FinanceMetrics, StoreOption } from '../../../shared/operations'

type FinancePageProps = {
  storeId?: string | null
}

const ease = [0.22, 1, 0.36, 1] as const

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
  const daySales = useMemo(() => {
    if (!selectedDate || !data) return []
    return data.recentSales.filter((sale) => sale.dateKey === selectedDate)
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
              sales={daySales}
              storeName={data?.storeName ?? null}
              monthGoalCents={data?.monthSalesGoalCents ?? null}
              remainingCents={data?.remainingToMonthSalesGoalCents ?? null}
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

      <SaleDialog
        open={dialogOpen}
        dateKey={selectedDate}
        stores={stores}
        defaultStoreId={storeId}
        initialCents={dayRow?.saleCents ?? 0}
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

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[22px] text-[#F0EFEC]/88">Financeiro</h1>
        <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
          {data.storeName
            ? `Vendas e meta de valor de ${data.storeName}. Clique no dia para registrar.`
            : 'Clique no dia para ver e registrar a venda daquela data no Card+.'}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
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
          <p className="mt-1 text-[12px] text-[#F0EFEC]/35">Resumo do valor cadastrado no Card+.</p>
          <div className="mt-5 space-y-4">
            <AsideRow label="Unidades" value={formatCount(data.storeCount)} />
            <AsideRow label="Dias com venda" value={formatCount(data.registeredDaysThisMonth)} />
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
            <p className="mt-1 text-[12px] text-[#F0EFEC]/35">Todos os dias, mesmo com venda zerada.</p>
          </div>
          <MonthSwitcher value={monthKey} onChange={onMonthKey} />
        </div>
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
            <tr className="border-t border-white/[0.04]">
              <th className="px-5 py-2.5 font-medium">Dia</th>
              <th className="px-3 py-2.5 font-medium">Venda</th>
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
                    {day.saleCents === null ? (
                      <span className="text-[#F0EFEC]/28">—</span>
                    ) : (
                      formatBRLFromCents(day.saleCents)
                    )}
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
  sales,
  storeName,
  monthGoalCents,
  remainingCents,
  onBack,
  onRegister
}: {
  day: FinanceDayRow
  sales: FinanceMetrics['recentSales']
  storeName: string | null
  monthGoalCents: number | null
  remainingCents: number | null
  onBack: () => void
  onRegister: () => void
}) {
  const empty = day.saleCents === null

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
          {empty ? 'Registrar venda' : 'Atualizar venda'}
        </button>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Venda do dia"
          value={day.saleCents ?? 0}
          money
          empty={empty}
          hint={empty ? 'Nenhuma venda deste dia no Card+' : storeName ? `Registrada em ${storeName}` : 'Registrada no Card+'}
          icon={<Banknote className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Registros"
          value={sales.length}
          hint={sales.length === 1 ? 'Uma unidade neste dia' : 'Unidades com venda neste dia'}
          icon={<Banknote className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Meta restante no mês"
          value={remainingCents ?? 0}
          money
          empty={monthGoalCents === null}
          hint={monthGoalCents === null ? 'Sem meta de valor no Card+' : 'Para a meta mensal de valor'}
          icon={<Target className="size-4" strokeWidth={1.7} />}
        />
      </div>

      <section className="mt-3 mb-8 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
        {empty ? (
          <EmptyState
            icon={<Banknote className="size-6" strokeWidth={1.6} />}
            title="Nenhuma venda neste dia"
            description="Registre o valor vendido. Ele entra no Card+ como venda do dia desta unidade."
            actionLabel="Registrar venda do dia"
            onAction={onRegister}
          />
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="sticky top-0 bg-[#1A1A1A] text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                <tr className="border-y border-white/[0.04]">
                  <th className="px-5 py-2.5 font-medium">Unidade</th>
                  <th className="px-5 py-2.5 font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={`${sale.dateKey}:${sale.storeId}`} className="border-t border-white/[0.03] text-[#F0EFEC]/68">
                    <td className="px-5 py-3">{sale.storeName}</td>
                    <td className="px-5 py-3">{formatBRLFromCents(sale.amountInCents)}</td>
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

function SaleDialog({
  open,
  dateKey,
  stores,
  defaultStoreId,
  initialCents,
  onClose,
  onSaved
}: {
  open: boolean
  dateKey: string | null
  stores: StoreOption[]
  defaultStoreId?: string | null
  initialCents: number
  onClose: () => void
  onSaved: () => void
}) {
  const [storeId, setStoreId] = useState('')
  const [amountText, setAmountText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSaving(false)
    setStoreId(defaultStoreId || stores[0]?.id || '')
    setAmountText(initialCents > 0 ? formatBRLInput(initialCents) : '')
  }, [open, defaultStoreId, stores, initialCents])

  async function submit(): Promise<void> {
    if (!dateKey || !storeId) return
    setSaving(true)
    setError(null)
    try {
      await operations().upsertDailySale({
        storeId,
        dateKey,
        amountInCents: parseBRLToCents(amountText)
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
      title="Registrar venda do dia"
      description="O valor entra no Card+ como venda do dia desta unidade, em centavos."
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
        {dateKey ? (
          <p className="text-[12px] text-[#F0EFEC]/35">{weekdayLong(dateKey)}</p>
        ) : null}
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

function FinanceSkeleton() {
  return (
    <div className="grid flex-1 grid-rows-[auto_1fr] gap-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="h-[148px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[148px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[148px] animate-pulse rounded-[16px] bg-white/4" />
      </div>
      <div className="min-h-[280px] animate-pulse rounded-[16px] bg-white/4" />
    </div>
  )
}
