import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, CreditCard, Settings, Target, TrendingUp } from 'lucide-react'
import { CardsChart } from '@/components/cards-chart'
import { EmployeeDialog } from '@/components/employee-dialog'
import { MetricCard } from '@/components/metric-card'
import { initials } from '@/lib/identity'
import { formatBRLFromCents, formatCount, formatDate, formatDateTime } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import type { EmployeeProfile, StoreOption } from '../../../shared/operations'

type EmployeeProfilePageProps = {
  employeeId: string
  storeId?: string | null
  onBack: () => void
}

export function EmployeeProfilePage({ employeeId, storeId = null, onBack }: EmployeeProfilePageProps) {
  const [data, setData] = useState<EmployeeProfile | null>(null)
  const [stores, setStores] = useState<StoreOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

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
        <div className="grid grid-cols-4 gap-3">
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-2 text-[13px] text-[#F0EFEC]/38 transition-colors hover:text-[#F0EFEC]/60"
      >
        <ArrowLeft className="size-3.5" />
        Funcionários
      </button>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex size-12 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[15px] text-[#F0EFEC]/60">
            {initials(employee.name)}
          </span>
          <div>
            <h1 className="text-[22px] text-[#F0EFEC]/90">{employee.name}</h1>
            <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
              {employee.flowRoleLabel} · {employee.storeName} · {employee.cpfMasked ?? 'CPF não cadastrado'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-8 items-center gap-2 rounded-[8px] border border-white/[0.08] px-3 text-[13px] text-[#F0EFEC]/60 hover:bg-white/[0.04]"
        >
          <Settings className="size-3.5" strokeWidth={1.7} />
          Editar
        </button>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label="Cartões hoje"
          value={metrics.cardsToday}
          hint={metrics.lastCardAt ? `Último em ${formatDateTime(metrics.lastCardAt)}` : 'Sem cartão hoje'}
          icon={<CreditCard className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Cartões no mês"
          value={metrics.cardsThisMonth}
          hint={`Total histórico: ${formatCount(metrics.cardsTotal)}`}
          icon={<TrendingUp className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Projeção do mês"
          value={metrics.projectedMonth ?? 0}
          empty={metrics.projectedMonth === null}
          hint={metrics.projectionLabel}
          icon={<Target className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Meta da unidade"
          value={metrics.storeMonthGoal ?? 0}
          empty={metrics.storeMonthGoal === null}
          hint={
            metrics.firstCardAt
              ? `Primeiro cartão em ${formatDate(metrics.firstCardAt)}`
              : 'Sem histórico de cartões'
          }
          icon={<CalendarDays className="size-4" strokeWidth={1.7} />}
        />
      </div>

      <section className="mt-3 rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
        <div className="mb-4">
          <h2 className="text-[15px] text-[#F0EFEC]/82">Evolução em 12 meses</h2>
          <p className="mt-1 text-[12px] text-[#F0EFEC]/35">Cartões deste funcionário no Card+.</p>
        </div>
        <CardsChart data={data.months} showGoal={false} />
      </section>

      <section className="mt-3 rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-[15px] text-[#F0EFEC]/82">Cartões recentes</h2>
          <span className="text-[12px] text-[#F0EFEC]/32">{data.recentCards.length} registros</span>
        </div>
        {data.recentCards.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-[#F0EFEC]/35">Este funcionário ainda não registrou cartões.</p>
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
