import { useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, CreditCard, Pencil, Trash2 } from 'lucide-react'
import { CardDialog } from '@/components/card-dialog'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { MetricCard } from '@/components/metric-card'
import { formatBRLFromCents, formatCount, formatDateKey, currentMonthKey } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import type { CardRecord, CardsBoard, StoreOption } from '../../../shared/operations'

type CardsPageProps = {
  storeId?: string | null
}

type StatusFilter = 'all' | 'pending' | 'activated' | 'idle'

export function CardsPage({ storeId = null }: CardsPageProps) {
  const [board, setBoard] = useState<CardsBoard | null>(null)
  const [stores, setStores] = useState<StoreOption[]>([])
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'transfer' | null>(null)
  const [selected, setSelected] = useState<CardRecord | null>(null)
  const [removing, setRemoving] = useState<CardRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([operations().getCardsBoard(monthKey, storeId), operations().listStores()])
      .then(([payload, storeList]) => {
        if (!active) return
        setBoard(payload)
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
  }, [monthKey, storeId])

  const records = useMemo(() => {
    const list = board?.records ?? []
    const term = query.trim().toLowerCase()
    return list.filter((card) => {
      if (status === 'pending' && card.activated) return false
      if (status === 'activated' && !card.activated) return false
      if (status === 'idle' && !(card.activated && card.amountUsedInCents === 0 && card.amountInCents > 0)) {
        return false
      }
      if (!term) return true
      return [card.clientName, card.operatorName, card.storeName]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [board, query, status])

  async function reload(): Promise<void> {
    const payload = await operations().getCardsBoard(monthKey, storeId)
    setBoard(payload)
  }

  async function confirmDelete(): Promise<void> {
    if (!removing) return
    setDeleting(true)
    try {
      await operations().deleteCard(removing.id)
      setBoard((current) =>
        current
          ? {
              ...current,
              records: current.records.filter((item) => item.id !== removing.id),
              cardsThisMonth: Math.max(0, current.cardsThisMonth - 1),
              cardsTotal: Math.max(0, current.cardsTotal - 1)
            }
          : current
      )
      setRemoving(null)
      void reload()
    } catch (deleteError) {
      setError(operationError(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  if (loading && !board) {
    return (
      <div className="flex flex-col">
        <div className="mb-6 h-8 w-40 animate-pulse rounded-full bg-white/5" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] text-[#F0EFEC]/88">Cartões</h1>
          <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
            Registros, limite e status direto do Card+. O mês já abre no atual.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelected(null)
            setDialogMode('create')
          }}
          className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
        >
          Novo cartão
        </button>
      </header>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      {board ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <MetricCard
              label="Cartões do dia"
              value={board.cardsToday}
              goal={board.todayGoal}
              hint={board.todayGoal === null ? 'Sem meta do dia no Card+' : 'Progresso da meta diária'}
              icon={<CreditCard className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              label="Cartões do mês"
              value={board.cardsThisMonth}
              goal={board.monthGoal}
              hint={board.monthGoal === null ? 'Sem meta mensal no Card+' : 'Progresso da meta mensal'}
              icon={<CreditCard className="size-4" strokeWidth={1.7} />}
            />
            <MetricCard
              label="Total registrado"
              value={board.cardsTotal}
              hint={`${formatCount(board.pendingCount)} pendentes · ${formatCount(board.activatedCount)} ativados`}
              icon={<CreditCard className="size-4" strokeWidth={1.7} />}
            />
          </div>

          <div className="mt-3 grid grid-cols-4 gap-3">
            <MiniStat label="Pendentes" value={formatCount(board.pendingCount)} />
            <MiniStat label="Ativados" value={formatCount(board.activatedCount)} />
            <MiniStat
              label="Limite parado"
              value={formatCount(board.idleActivatedCount)}
              hint="Ativado sem gasto"
            />
            <MiniStat
              label="Limite disponível"
              value={formatBRLFromCents(board.availableCents)}
              hint={`${formatBRLFromCents(board.usedCents)} de ${formatBRLFromCents(board.limitCents)}`}
            />
          </div>

          <section className="mt-3 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <h2 className="text-[15px] text-[#F0EFEC]/82">Dias registrados</h2>
                <p className="mt-1 text-[12px] text-[#F0EFEC]/35">
                  Só os dias do mês que já têm cartão no Card+.
                </p>
              </div>
              <Input
                type="month"
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
                className="h-8 w-[160px] rounded-[8px] border-white/[0.06] bg-transparent text-[13px]"
              />
            </div>
            {board.days.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-[#F0EFEC]/35">Nenhum cartão neste mês.</p>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                  <tr className="border-t border-white/[0.04]">
                    <th className="px-5 py-2.5 font-medium">Dia</th>
                    <th className="px-3 py-2.5 font-medium">Cartões</th>
                    <th className="px-3 py-2.5 font-medium">Pendentes</th>
                    <th className="px-3 py-2.5 font-medium">Ativados</th>
                    <th className="px-5 py-2.5 font-medium">Digitações</th>
                  </tr>
                </thead>
                <tbody>
                  {board.days.map((day) => (
                    <tr key={day.dateKey} className="border-t border-white/[0.035] text-[#F0EFEC]/68">
                      <td className="px-5 py-3">{formatDateKey(day.dateKey)}</td>
                      <td className="px-3 py-3">{formatCount(day.cards)}</td>
                      <td className="px-3 py-3">{formatCount(day.pending)}</td>
                      <td className="px-3 py-3">{formatCount(day.activated)}</td>
                      <td className="px-5 py-3">{formatCount(day.digitacoes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="mt-3 mb-8 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar cliente, funcionário ou unidade"
                  className="h-8 w-[260px] rounded-[8px] border-white/[0.06] bg-transparent text-[13px]"
                />
                <Chip active={status === 'all'} onClick={() => setStatus('all')}>
                  Todos
                </Chip>
                <Chip active={status === 'pending'} onClick={() => setStatus('pending')}>
                  Pendentes
                </Chip>
                <Chip active={status === 'activated'} onClick={() => setStatus('activated')}>
                  Ativados
                </Chip>
                <Chip active={status === 'idle'} onClick={() => setStatus('idle')}>
                  Limite parado
                </Chip>
              </div>
              <span className="text-[12px] text-[#F0EFEC]/32">
                {formatCount(records.length)} {records.length === 1 ? 'cartão' : 'cartões'}
              </span>
            </div>
            {records.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-[#F0EFEC]/35">Nenhum cartão neste filtro.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-[#1A1A1A] text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                    <tr className="border-y border-white/[0.04]">
                      <th className="px-5 py-2.5 font-medium">Cliente</th>
                      <th className="px-3 py-2.5 font-medium">Funcionário</th>
                      <th className="px-3 py-2.5 font-medium">Status</th>
                      <th className="px-3 py-2.5 font-medium">Limite</th>
                      <th className="px-3 py-2.5 font-medium">Gasto</th>
                      <th className="px-3 py-2.5 font-medium">Disponível</th>
                      <th className="px-3 py-2.5 font-medium">Dia</th>
                      <th className="w-[120px] px-4 py-2.5 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((card) => (
                      <tr key={card.id} className="border-t border-white/[0.03] text-[#F0EFEC]/68 hover:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <p>{card.clientName}</p>
                          <p className="text-[11px] text-[#F0EFEC]/32">{card.storeName}</p>
                        </td>
                        <td className="px-3 py-3">{card.operatorName}</td>
                        <td className="px-3 py-3">
                          <StatusBadge card={card} />
                        </td>
                        <td className="px-3 py-3">{formatBRLFromCents(card.amountInCents)}</td>
                        <td className="px-3 py-3">{formatBRLFromCents(card.amountUsedInCents)}</td>
                        <td className="px-3 py-3">{formatBRLFromCents(card.availableInCents)}</td>
                        <td className="px-3 py-3 text-[#F0EFEC]/45">{formatDateKey(card.dateKey)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <IconButton
                              label={card.activated ? 'Marcar pendente' : 'Ativar'}
                              onClick={() => {
                                void operations()
                                  .updateCard({
                                    id: card.id,
                                    storeId: card.storeId,
                                    collaboratorId: card.collaboratorId,
                                    clientName: card.clientName,
                                    amountInCents: card.amountInCents,
                                    amountUsedInCents: card.amountUsedInCents,
                                    activated: !card.activated,
                                    dateKey: card.dateKey
                                  })
                                  .then(() => reload())
                                  .catch((toggleError) => setError(operationError(toggleError)))
                              }}
                            >
                              {card.activated ? 'Pend.' : 'Ativar'}
                            </IconButton>
                            <IconButton
                              label="Editar"
                              onClick={() => {
                                setSelected(card)
                                setDialogMode('edit')
                              }}
                            >
                              <Pencil className="size-3.5" strokeWidth={1.7} />
                            </IconButton>
                            <IconButton
                              label="Transferir"
                              onClick={() => {
                                setSelected(card)
                                setDialogMode('transfer')
                              }}
                            >
                              <ArrowRightLeft className="size-3.5" strokeWidth={1.7} />
                            </IconButton>
                            <IconButton label="Excluir" onClick={() => setRemoving(card)}>
                              <Trash2 className="size-3.5" strokeWidth={1.7} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      <CardDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'create'}
        card={selected}
        stores={stores}
        people={board?.people ?? []}
        defaultStoreId={storeId ?? selected?.storeId}
        onClose={() => {
          setDialogMode(null)
          setSelected(null)
        }}
        onSaved={() => {
          void reload()
        }}
      />

      <Dialog
        open={Boolean(removing)}
        title="Excluir cartão"
        description="O registro some do Card+. Essa ação não dá para desfazer por aqui."
        onClose={() => setRemoving(null)}
      >
        <div className="px-5 pb-5">
          <p className="text-[13px] text-[#F0EFEC]/55">
            {removing ? `${removing.clientName} · ${removing.operatorName}` : ''}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRemoving(null)}
              className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void confirmDelete()}
              className="h-8 rounded-[8px] bg-red-400/90 px-3.5 text-[13px] text-[#111111]"
            >
              Excluir
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-4 py-3">
      <p className="text-[12px] text-[#F0EFEC]/38">{label}</p>
      <p className="mt-1 text-[18px] tracking-tight text-[#F0EFEC]/86">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[#F0EFEC]/30">{hint}</p> : null}
    </article>
  )
}

function Chip({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 rounded-[8px] px-2.5 text-[12px]',
        active ? 'bg-white/[0.08] text-[#F0EFEC]/80' : 'text-[#F0EFEC]/40 hover:bg-white/[0.04]'
      )}
    >
      {children}
    </button>
  )
}

function IconButton({
  label,
  children,
  onClick
}: {
  label: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="flex h-8 min-w-8 items-center justify-center rounded-[8px] px-1.5 text-[11px] text-[#F0EFEC]/38 hover:bg-white/[0.05] hover:text-[#F0EFEC]/75"
    >
      {children}
    </button>
  )
}

function StatusBadge({ card }: { card: CardRecord }) {
  if (!card.activated) {
    return <span className="rounded-full bg-amber-300/10 px-2 py-0.5 text-[11px] text-amber-200/80">Pendente</span>
  }
  if (card.activatedLater) {
    return <span className="rounded-full bg-sky-300/10 px-2 py-0.5 text-[11px] text-sky-200/75">Ativado depois</span>
  }
  return <span className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-[11px] text-emerald-200/80">Ativado</span>
}
