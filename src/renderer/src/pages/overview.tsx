import { useEffect, useState } from 'react'
import { Activity, Banknote, CreditCard, Gauge, Percent, Users } from 'lucide-react'
import { CardsChart } from '@/components/cards-chart'
import { MetricCard } from '@/components/metric-card'
import { ValuePending } from '@/components/value-pending'
import { formatBRLFromCents, formatCount, formatDateTime, formatPercent, greetingFor } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import type { AuthUser } from '@/lib/auth'
import type { OverviewMetrics } from '../../../shared/operations'

type OverviewPageProps = {
  user: AuthUser
  storeId?: string | null
}

export function OverviewPage({ user, storeId = null }: OverviewPageProps) {
  const [data, setData] = useState<OverviewMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    void operations()
      .getOverview(storeId)
      .then((payload: OverviewMetrics) => {
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

  return (
    <div className="flex flex-col">
      <header className="mb-6">
        <h1 className="text-[26px] leading-tight text-[#F0EFEC]/90">{greetingFor(user.displayName)}</h1>
        <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
          {storeId
            ? 'Recorte rápido da unidade: cartão, venda, fluxo e ritmo.'
            : 'Recorte rápido da operação: cartão, venda, fluxo e ritmo.'}
        </p>
      </header>

      {error ? (
        <div className="rounded-[16px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      {loading || !data ? (
        <OverviewSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              label="Cartões do dia"
              value={data.cardsToday}
              goal={data.todayGoal}
              hint={data.todayGoal === null ? 'Sem meta do dia no Card+' : 'Meta do dia'}
              icon={<CreditCard className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              label="Cartões do mês"
              value={data.cardsThisMonth}
              goal={data.monthGoal}
              hint={
                data.monthGoal === null
                  ? 'Sem meta mensal no Card+'
                  : data.remainingToMonthGoal === 0
                    ? 'Meta do mês atingida'
                    : `Faltam ${formatCount(data.remainingToMonthGoal ?? 0)}`
              }
              icon={<CreditCard className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              label="Valor de venda do dia"
              value={data.saleTodayCents ?? 0}
              money
              empty={data.saleTodayCents === null}
              hint={
                data.saleTodayCents === null
                  ? 'Nenhuma venda do dia no Card+'
                  : `${formatCount(data.storeCount)} ${data.storeCount === 1 ? 'unidade' : 'unidades'}`
              }
              icon={<Banknote className="size-4" strokeWidth={1.7} />}
            />
          </div>

          <div className="mt-3 grid grid-cols-4 gap-3">
            <MetricCard
              compact
              percent
              label="Aproveitamento"
              value={data.aproveitamentoPct ?? 0}
              empty={data.aproveitamentoPct === null}
              hint={`${formatCount(data.digitacoesMonth)} digitações · ${formatCount(data.clientesMonth)} clientes`}
              icon={<Percent className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              compact
              label="Fluxo de clientes"
              value={data.customerFlowMonth ?? 0}
              empty={data.customerFlowMonth === null}
              hint="Soma do mês no Card+"
              icon={<Users className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              compact
              percent
              label="Tx. aprovação mês"
              value={data.approvalRatePct ?? 0}
              empty={data.approvalRatePct === null}
              hint={`${formatCount(data.cardsThisMonth)} cartões / ${formatCount(data.digitacoesMonth)} digitações`}
              icon={<Activity className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              compact
              label="Ritmo"
              value={data.pacePerDay ?? 0}
              empty={data.pacePerDay === null}
              suffix="/dia"
              hint={`${formatCount(data.workingDaysMonth)} dias úteis, sem domingo`}
              icon={<Gauge className="size-4" strokeWidth={1.7} />}
            />
          </div>

          {data.remainingToMonthGoal !== null || data.pendingCardsThisMonth > 0 ? (
            <p className="mt-3 text-[12px] text-[#F0EFEC]/36">
              {data.remainingToMonthGoal === null
                ? ''
                : data.remainingToMonthGoal === 0
                  ? 'Meta mensal batida. '
                  : `Faltam ${formatCount(data.remainingToMonthGoal)} cartões para a meta. `}
              {data.pendingCardsThisMonth > 0
                ? `${formatCount(data.pendingCardsThisMonth)} ainda pendentes de ativar.`
                : 'Nenhum cartão pendente neste mês.'}
            </p>
          ) : null}

          <div className="mt-3 grid shrink-0 grid-cols-[minmax(0,1fr)_280px] items-stretch gap-3">
            <section className="overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[15px] text-[#F0EFEC]/82">Cartões dos últimos 12 meses</h2>
                  <p className="mt-1 text-[12px] text-[#F0EFEC]/35">
                    Ritmo mensal comparado à meta cadastrada no Card+.
                  </p>
                </div>
                <div className="flex items-center gap-4 pt-1 text-[11px] text-[#F0EFEC]/40">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-[#8B8DFF]" />
                    Cartões
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-[#34D399]" />
                    Meta
                  </span>
                </div>
              </div>
              <CardsChart data={data.months} />
            </section>

            <aside className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
              <h2 className="text-[15px] text-[#F0EFEC]/82">Operação</h2>
              <p className="mt-1 text-[12px] text-[#F0EFEC]/35">Equipe, unidades e conversão do mês.</p>
              <div className="mt-5 space-y-4">
                <AsideRow label="Unidades" value={formatCount(data.storeCount)} />
                <AsideRow label="Funcionários ativos" value={formatCount(data.employeeCount)} />
                <AsideRow label="Digitações hoje" value={formatCount(data.digitacoesToday)} />
                <AsideRow label="Aproveitamento" value={formatPercent(data.aproveitamentoPct)} />
              </div>
            </aside>
          </div>

          <section className="mt-3 shrink-0 rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-[15px] text-[#F0EFEC]/82">Movimento recente</h2>
              <span className="text-[12px] text-[#F0EFEC]/32">{data.recentCards.length} cartões</span>
            </div>
            {data.recentCards.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-[#F0EFEC]/35">Nenhum cartão registrado ainda.</p>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                  <tr className="border-t border-white/[0.04]">
                    <th className="px-5 py-2.5 font-medium">Funcionário</th>
                    <th className="px-3 py-2.5 font-medium">Cliente</th>
                    <th className="px-3 py-2.5 font-medium">Unidade</th>
                    <th className="px-3 py-2.5 font-medium">Valor</th>
                    <th className="px-5 py-2.5 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentCards.map((card) => (
                    <tr key={card.id} className="border-t border-white/[0.035] text-[#F0EFEC]/68">
                      <td className="px-5 py-3">{card.operatorName}</td>
                      <td className="px-3 py-3">{card.clientName}</td>
                      <td className="px-3 py-3 text-[#F0EFEC]/45">{card.storeName}</td>
                      <td className="px-3 py-3">{formatBRLFromCents(card.amountInCents)}</td>
                      <td className="px-5 py-3 text-[#F0EFEC]/40">{formatDateTime(card.createdAt)}</td>
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

function OverviewSkeleton() {
  return (
    <div className="grid flex-1 grid-rows-[auto_1fr] gap-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="h-[96px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[96px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[96px] animate-pulse rounded-[16px] bg-white/4" />
        <div className="h-[96px] animate-pulse rounded-[16px] bg-white/4" />
      </div>
      <div className="min-h-[280px] animate-pulse rounded-[16px] bg-white/4" />
    </div>
  )
}
