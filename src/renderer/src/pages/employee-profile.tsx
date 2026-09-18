import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, CreditCard, Settings, Target, TrendingUp } from 'lucide-react'
import { CardsChart } from '@/components/cards-chart'
import { EmployeeDialog } from '@/components/employee-dialog'
import { MetricCard } from '@/components/metric-card'
import { initials } from '@/lib/identity'
import { formatBRLFromCents, formatCount, formatDate, formatDateTime } from '@/lib/format'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import type { EmployeeProfile, StoreOption } from '../../../shared/operations'

type EmployeeProfilePageProps = {
  employeeId: string
  storeId?: string | null
  onBack: () => void
}

function shortDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export function EmployeeProfilePage({ employeeId, storeId = null, onBack }: EmployeeProfilePageProps) {
  const [data, setData] = useState<EmployeeProfile | null>(null)
  const [stores, setStores] = useState<StoreOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const mobile = isMobileShell()

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([operations().getEmployee(employeeId, storeId), operations().listStores()])
      .then(([profile, storeList]) => {
        if (!active) return
        setData(profile)
        setStores(storeList)
        setError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setError(operationError(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [employeeId, storeId])

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-6 h-8 w-40 animate-pulse rounded-full bg-white/5" />
        <div className={mobile ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-4 gap-3'}>
          <div className="h-28 animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-28 animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-28 animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-28 animate-pulse rounded-[16px] bg-white/4" />
        </div>
        <div className="mt-3 min-h-[260px] flex-1 animate-pulse rounded-[16px] bg-white/4" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-2 text-[13px] text-[#F0EFEC]/40">
          <ArrowLeft className="size-3.5" />
          Funcionários
        </button>
        <div className="rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error ?? 'Funcionário não encontrado.'}
        </div>
      </div>
    )
  }

  const { employee, metrics } = data
  const lastHint = metrics.lastCardAt
    ? mobile
      ? `Último ${shortDateTime(metrics.lastCardAt)}`
      : `Último em ${formatDateTime(metrics.lastCardAt)}`
    : 'Sem cartão hoje'
  const monthHint = mobile
    ? `Histórico ${formatCount(metrics.cardsTotal)}`
    : `Total histórico: ${formatCount(metrics.cardsTotal)}`
  const projectionHint = mobile ? 'Ritmo do mês' : metrics.projectionLabel
  const goalHint = metrics.firstCardAt
    ? mobile
      ? `Desde ${formatDate(metrics.firstCardAt)}`
      : `Primeiro cartão em ${formatDate(metrics.firstCardAt)}`
    : 'Sem histórico de cartões'

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', mobile && 'pb-16')}>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex min-h-10 items-center gap-2 text-[13px] text-[#F0EFEC]/38 transition-colors hover:text-[#F0EFEC]/60"
      >
        <ArrowLeft className="size-3.5" />
        Funcionários
      </button>

      <header className={mobile ? 'mb-4 flex items-start gap-3' : 'mb-6 flex items-start justify-between gap-4'}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[#F0EFEC]/60',
              mobile ? 'size-11 text-[14px]' : 'size-12 text-[15px]'
            )}
          >
            {initials(employee.name)}
          </span>
          <div className="min-w-0">
            <h1 className={cn('truncate text-[#F0EFEC]/90', mobile ? 'text-[20px]' : 'text-[22px]')}>
              {employee.name}
            </h1>
            <p className={cn('mt-1 text-[#F0EFEC]/38', mobile ? 'text-[12px] leading-snug' : 'text-[13px]')}>
              {mobile ? (
                <>
                  <span className="block truncate">
                    {employee.flowRoleLabel} · {employee.storeName}
                  </span>
                  <span className="mt-0.5 block truncate">{employee.cpfMasked ?? 'CPF não cadastrado'}</span>
                </>
              ) : (
                `${employee.flowRoleLabel} · ${employee.storeName} · ${employee.cpfMasked ?? 'CPF não cadastrado'}`
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-8 shrink-0 items-center gap-2 rounded-[8px] border border-white/[0.08] px-3 text-[13px] text-[#F0EFEC]/60 hover:bg-white/[0.04]"
        >
          <Settings className="size-3.5" strokeWidth={1.7} />
          Editar
        </button>
      </header>

      <div className={mobile ? 'grid grid-cols-2 gap-2.5' : 'grid grid-cols-4 gap-3'}>
        <MetricCard
          compact={mobile}
          label={mobile ? 'Hoje' : 'Cartões hoje'}
          value={metrics.cardsToday}
          hint={lastHint}
          icon={<CreditCard className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          compact={mobile}
          label={mobile ? 'No mês' : 'Cartões no mês'}
          value={metrics.cardsThisMonth}
          hint={monthHint}
          icon={<TrendingUp className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          compact={mobile}
          label={mobile ? 'Projeção' : 'Projeção do mês'}
          value={metrics.projectedMonth ?? 0}
          empty={metrics.projectedMonth === null}
          hint={projectionHint}
          icon={<Target className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          compact={mobile}
          label={mobile ? 'Meta' : 'Meta da unidade'}
          value={metrics.storeMonthGoal ?? 0}
          empty={metrics.storeMonthGoal === null}
          hint={goalHint}
          icon={<CalendarDays className="size-4" strokeWidth={1.7} />}
        />
      </div>

      <section
        className={cn(
          'mt-3 rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]',
          mobile ? 'px-4 py-3.5' : 'px-5 py-4'
        )}
      >
        <div className={mobile ? 'mb-3' : 'mb-4'}>
          <h2 className="text-[15px] text-[#F0EFEC]/82">Evolução em 12 meses</h2>
          <p className="mt-1 text-[12px] text-[#F0EFEC]/35">Cartões deste funcionário no Card+.</p>
        </div>
        <CardsChart data={data.months} showGoal={false} height={mobile ? 168 : 280} />
      </section>

      <section className="mt-3 rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
        <div className={cn('flex items-center justify-between', mobile ? 'px-4 py-3.5' : 'px-5 py-4')}>
          <h2 className="text-[15px] text-[#F0EFEC]/82">Cartões recentes</h2>
          <span className="text-[12px] text-[#F0EFEC]/32">{data.recentCards.length} registros</span>
        </div>
        {data.recentCards.length === 0 ? (
          <p className={cn('pb-5 text-[13px] text-[#F0EFEC]/35', mobile ? 'px-4' : 'px-5')}>
            Este funcionário ainda não registrou cartões.
          </p>
        ) : mobile ? (
          <div className="pb-1">
            {data.recentCards.map((card) => (
              <div key={card.id} className="border-t border-white/[0.035] px-4 py-3">
                <p className="truncate text-[13px] text-[#F0EFEC]/80">{card.clientName}</p>
                <p className="mt-1 flex items-center justify-between gap-3 text-[12px] text-[#F0EFEC]/42">
                  <span>
                    {formatBRLFromCents(card.amountInCents)}
                    <span className="text-[#F0EFEC]/28"> · </span>
                    {card.activated ? 'Ativado' : 'Pendente'}
                  </span>
                  <span className="shrink-0 text-[#F0EFEC]/32">{shortDateTime(card.createdAt)}</span>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
              <tr className="border-t border-white/[0.04]">
                <th className="px-5 py-2.5 font-medium">Cliente</th>
                <th className="px-3 py-2.5 font-medium">Valor</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {data.recentCards.map((card) => (
                <tr key={card.id} className="border-t border-white/[0.035] text-[#F0EFEC]/68">
                  <td className="px-5 py-3">{card.clientName}</td>
                  <td className="px-3 py-3">{formatBRLFromCents(card.amountInCents)}</td>
                  <td className="px-3 py-3 text-[#F0EFEC]/45">{card.activated ? 'Ativado' : 'Pendente'}</td>
                  <td className="px-5 py-3 text-[#F0EFEC]/40">{formatDateTime(card.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <EmployeeDialog
        open={editing}
        mode="edit"
        employee={employee}
        stores={stores}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setData((current) => (current ? { ...current, employee: saved } : current))
        }}
      />
    </div>
  )
}
