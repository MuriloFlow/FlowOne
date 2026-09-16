import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Banknote, Bus, Utensils } from 'lucide-react'
import { AnimatedMoney } from '@/components/animated-number'
import { MoneyCell } from '@/components/money-cell'
import { initials } from '@/lib/identity'
import { formatBRLFromCents } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import {
  formatVoucherWeekLabel,
  msUntilNextVoucherReset,
  type VoucherBoard,
  type VoucherRow,
  type VoucherStatus
} from '../../../shared/vouchers'

type VouchersPageProps = {
  storeId?: string | null
}

export function VouchersPage({ storeId = null }: VouchersPageProps) {
  const [board, setBoard] = useState<VoucherBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load(): Promise<VoucherBoard> {
    const next = await operations().listVouchers(storeId)
    setBoard(next)
    setError(null)
    return next
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    void load()
      .catch((loadError: unknown) => {
        if (active) setError(operationError(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [storeId])

  useEffect(() => {
    let timer = 0
    const arm = () => {
      timer = window.setTimeout(() => {
        void load().catch((loadError: unknown) => setError(operationError(loadError)))
        arm()
      }, msUntilNextVoucherReset())
    }
    arm()
    return () => window.clearTimeout(timer)
  }, [storeId])

  function applyLocal(
    row: VoucherRow,
    next: { lunchCents?: number; transportCents?: number; status?: VoucherStatus }
  ): void {
    setBoard((current) => {
      if (!current) return current
      const groups = current.groups.map((group) => ({
        ...group,
        rows: group.rows.map((item) => {
          if (item.collaboratorId !== row.collaboratorId) return item
          const lunchCents = next.lunchCents ?? item.lunchCents
          const transportCents = next.transportCents ?? item.transportCents
          return {
            ...item,
            lunchCents,
            transportCents,
            dayTotalCents: lunchCents + transportCents,
            status: next.status ?? item.status
          }
        })
      }))
      const rows = groups.flatMap((group) => group.rows)
      return {
        ...current,
        groups,
        lunchTotalCents: rows.reduce((total, item) => total + item.lunchCents, 0),
        transportTotalCents: rows.reduce((total, item) => total + item.transportCents, 0),
        grandTotalCents: rows.reduce((total, item) => total + item.dayTotalCents, 0)
      }
    })
  }

  async function patch(
    row: VoucherRow,
    next: { lunchCents?: number; transportCents?: number; status?: VoucherStatus }
  ): Promise<void> {
    const previous = board
    applyLocal(row, next)
    setBusyId(row.collaboratorId)
    try {
      await operations().updateVoucher({
        collaboratorId: row.collaboratorId,
        ...next
      })
      setError(null)
    } catch (patchError) {
      setBoard(previous)
      setError(operationError(patchError))
      throw patchError
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col">
        <div className="mb-6 h-8 w-56 animate-pulse rounded-full bg-white/5" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
        </div>
        <div className="mt-4 min-h-[280px] animate-pulse rounded-[16px] bg-white/4" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <header className="mb-6">
        <h1 className="text-[22px] text-[#F0EFEC]/88">Vales e pagamentos</h1>
        <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
          {storeId
            ? 'Vales somente da unidade selecionada.'
            : 'Vale-almoço e vale-transporte por funcionário.'}{' '}
          Status pago volta para pendente todo domingo à 00:00.
          {board ? (
            <span className="text-[#F0EFEC]/28"> Semana {formatVoucherWeekLabel(board.periodKey)}.</span>
          ) : null}
        </p>
      </header>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <MoneyCard
          label="Total vale-almoço"
          cents={board?.lunchTotalCents ?? 0}
          hint="Soma de todos os funcionários visíveis"
          icon={<Utensils className="size-4" strokeWidth={1.7} />}
        />
        <MoneyCard
          label="Total vale-transporte"
          cents={board?.transportTotalCents ?? 0}
          hint="Soma de todos os funcionários visíveis"
          icon={<Bus className="size-4" strokeWidth={1.7} />}
        />
        <MoneyCard
          label="Total geral"
          cents={board?.grandTotalCents ?? 0}
          hint="Almoço + transporte"
          icon={<Banknote className="size-4" strokeWidth={1.7} />}
        />
      </div>

      {!board || board.groups.length === 0 ? (
        <div className="mt-16 flex flex-1 flex-col items-center justify-center text-center">
          <h2 className="text-[16px] text-[#F0EFEC]/78">Nenhum funcionário nesta unidade</h2>
          <p className="mt-2 max-w-sm text-[13px] text-[#F0EFEC]/38">
            Os vales acompanham o cadastro do Card+. Cadastre o funcionário para lançar os valores.
          </p>
        </div>
      ) : (
        <div className="mt-4 mb-[4.5rem] space-y-3">
          {board.groups.map((group) => (
            <section key={group.id} className="overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
              <div className="flex items-center justify-between px-5 py-3">
                <h2 className="text-[13px] tracking-wide text-[#F0EFEC]/45 uppercase">{group.label}</h2>
                <span className="text-[12px] text-[#F0EFEC]/28">
                  {group.rows.length} {group.rows.length === 1 ? 'funcionário' : 'funcionários'}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                    <tr className="border-y border-white/[0.04]">
                      <th className="px-5 py-2.5 font-medium">Funcionário</th>
                      <th className="px-3 py-2.5 font-medium">CPF</th>
                      <th className="px-3 py-2.5 font-medium">Vale-almoço</th>
                      <th className="px-3 py-2.5 font-medium">Vale-transporte</th>
                      <th className="px-3 py-2.5 font-medium">Total do dia</th>
                      <th className="px-5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr
                        key={row.collaboratorId}
                        className="border-t border-white/[0.03] text-[13px] transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[11px] text-[#F0EFEC]/55">
                              {initials(row.name)}
                            </span>
                            <span>
                              <span className="block text-[#F0EFEC]/82">{row.name}</span>
                              <span className="mt-0.5 block text-[11px] text-[#F0EFEC]/32">
                                {storeId ? row.roleLabel : `${row.roleLabel} · ${row.storeName}`}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[#F0EFEC]/55">
                          {row.cpfMasked ?? <span className="text-[#F0EFEC]/28">Não cadastrado</span>}
                        </td>
                        <td className="px-3 py-3">
                          <MoneyCell
                            cents={row.lunchCents}
                            onSave={(lunchCents) => patch(row, { lunchCents })}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <MoneyCell
                            cents={row.transportCents}
                            onSave={(transportCents) => patch(row, { transportCents })}
                          />
                        </td>
                        <td className="px-3 py-3 text-[#F0EFEC]/78">{formatBRLFromCents(row.dayTotalCents)}</td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            disabled={busyId === row.collaboratorId}
                            onClick={() =>
                              void patch(row, { status: row.status === 'PAGO' ? 'PENDENTE' : 'PAGO' })
                            }
                            className={cn(
                              'inline-flex h-7 items-center rounded-full px-2.5 text-[12px] transition-colors disabled:opacity-50',
                              row.status === 'PAGO'
                                ? 'bg-[#34D399]/12 text-[#34D399]'
                                : 'bg-[#F0EFEC]/6 text-[#F0EFEC]/50 hover:bg-[#F0EFEC]/10'
                            )}
                          >
                            {row.status === 'PAGO' ? 'Pago' : 'Pendente'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function MoneyCard({
  label,
  cents,
  hint,
  icon
}: {
  label: string
  cents: number
  hint: string
  icon: ReactNode
}) {
  return (
    <article className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
      <div className="mb-5 flex items-start justify-between gap-3">
        <p className="text-[13px] text-[#F0EFEC]/42">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-full bg-white/[0.04] text-[#F0EFEC]/35">
          {icon}
        </span>
      </div>
      <p className="text-[28px] leading-none tracking-tight text-[#F0EFEC]/92">
        <AnimatedMoney cents={cents} />
      </p>
      <p className="mt-3 text-[12px] text-[#F0EFEC]/32">{hint}</p>
    </article>
  )
}
