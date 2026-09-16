import { useEffect, useState } from 'react'
import { AlertTriangle, Banknote, Target, TrendingUp } from 'lucide-react'
import { MetricCard } from '@/components/metric-card'
import { ValuePending } from '@/components/value-pending'
import { SalesChart } from '@/components/sales-chart'
import { formatBRLFromCents, formatCount, formatDateKey, percentDelta } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import type { FinanceMetrics } from '../../../shared/operations'

type FinancePageProps = {
  storeId?: string | null
}

export function FinancePage({ storeId = null }: FinancePageProps) {
  const [data, setData] = useState<FinanceMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    void operations()
      .getFinance(storeId)
      .then((payload: FinanceMetrics) => {
        if (!active) return
        setData(payload)
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
  }, [storeId])

  const delta = data ? percentDelta(data.salesThisMonthCents, data.salesLastMonthCents) : null
  const monthHint = !data
    ? 'Carregando'
    : data.monthSalesGoalCents === null
      ? 'Sem meta de valor no Card+'
      : data.remainingToMonthSalesGoalCents === 0
        ? 'Meta de valor do mês atingida'
        : `Faltam ${formatBRLFromCents(data.remainingToMonthSalesGoalCents ?? 0)} para a meta`

  return (
    <div className="flex flex-col">
      <header className="mb-6">
        <h1 className="text-[26px] leading-tight text-[#F0EFEC]/90">Financeiro</h1>
        <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
          {storeId
            ? 'Meta de valor e vendas do dia registradas no Card+, somente da unidade selecionada.'
            : 'Meta de valor e vendas do dia registradas no Card+.'}
        </p>
      </header>

      {error ? (
        <div className="rounded-[16px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      {loading || !data ? (
        <FinanceSkeleton />
      ) : (
        <>
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
                <AsideRow
                  label="Dias com venda"
                  value={formatCount(data.registeredDaysThisMonth)}
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

          <section className="mt-3 shrink-0 rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[15px] text-[#F0EFEC]/82">Vendas do mês</h2>
              <span className="text-[12px] text-[#F0EFEC]/32">{data.recentSales.length} registros</span>
            </div>
            {data.recentSales.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-[#F0EFEC]/35">
                Nenhuma venda do dia registrada neste mês.
              </p>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                  <tr className="border-t border-white/[0.04]">
                    <th className="px-5 py-2.5 font-medium">Data</th>
                    <th className="px-3 py-2.5 font-medium">Unidade</th>
                    <th className="px-5 py-2.5 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.map((sale) => (
                    <tr
                      key={`${sale.dateKey}:${sale.storeId}`}
                      className="border-t border-white/[0.035] text-[#F0EFEC]/68"
                    >
                      <td className="px-5 py-3">{formatDateKey(sale.dateKey)}</td>
                      <td className="px-3 py-3 text-[#F0EFEC]/45">{sale.storeName}</td>
                      <td className="px-5 py-3">{formatBRLFromCents(sale.amountInCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
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
        <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
      </div>
      <div className="min-h-[280px] animate-pulse rounded-[16px] bg-white/4" />
    </div>
  )
}
