import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRightLeft, ChevronDown, ChevronRight, CreditCard, Pencil, Trash2 } from 'lucide-react'
import { CardDialog } from '@/components/card-dialog'
import { EmptyState } from '@/components/empty-state'
import { DangerConfirmButton } from '@/components/ui/danger-confirm-button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MetricCard } from '@/components/metric-card'
import { MonthSwitcher } from '@/components/month-switcher'
import {
  currentDateKey,
  currentMonthKey,
  formatBRLFromCents,
  formatCount,
  formatDateKey,
  isSunday,
  weekdayLabel,
  weekdayLong
} from '@/lib/format'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import type { CardDayRow, CardRecord, CardsBoard, StoreOption } from '../../../shared/operations'

type CardsPageProps = {
  storeId?: string | null
}

type StatusFilter = 'all' | 'pending' | 'activated' | 'idle'

const ease = [0.22, 1, 0.36, 1] as const

export function CardsPage({ storeId = null }: CardsPageProps) {
  const today = currentDateKey()
  const [board, setBoard] = useState<CardsBoard | null>(null)
  const [stores, setStores] = useState<StoreOption[]>([])
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'transfer' | null>(null)
  const [selected, setSelected] = useState<CardRecord | null>(null)
  const [removing, setRemoving] = useState<CardRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [invalidateOpen, setInvalidateOpen] = useState(false)

  useEffect(() => {
    setSelectedDate(null)
    setQuery('')
    setStatus('all')
  }, [storeId, monthKey])

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

  const dayRow = board?.days.find((item) => item.dateKey === selectedDate) ?? null
  const dayRecords = useMemo(() => {
    if (!selectedDate || !board) return []
    const term = query.trim().toLowerCase()
    return board.records.filter((card) => {
      if (card.dateKey !== selectedDate) return false
      if (status === 'pending' && card.activated) return false
      if (status === 'activated' && !card.activated) return false
      if (status === 'idle' && !(card.activated && card.amountUsedInCents === 0 && card.amountInCents > 0)) {
        return false
      }
      if (!term) return true
      return [card.clientName, card.operatorName, card.storeName].join(' ').toLowerCase().includes(term)
    })
  }, [board, selectedDate, query, status])

  async function reload(): Promise<void> {
    const payload = await operations().getCardsBoard(monthKey, storeId)
    setBoard(payload)
  }

  async function confirmDelete(): Promise<void> {
    if (!removing || deleting) return
    setDeleting(true)
    try {
      await operations().deleteCard(removing.id)
      setRemoving(null)
      await reload()
    } catch (deleteError) {
      setError(operationError(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  if (loading && !board) {
    const mobile = isMobileShell()
    return (
      <div className="flex flex-col">
        <div className="mb-6 h-8 w-40 animate-pulse rounded-full bg-white/5" />
        <div className={mobile ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-3 gap-3'}>
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
        </div>
        <div className={mobile ? 'mt-3 grid grid-cols-2 gap-3' : 'mt-3 grid grid-cols-4 gap-3'}>
          <div className="h-[92px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[92px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[92px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[92px] animate-pulse rounded-[16px] bg-white/4" />
        </div>
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
              records={dayRecords}
              query={query}
              status={status}
              onQuery={setQuery}
              onStatus={setStatus}
              onBack={() => {
                setSelectedDate(null)
                setQuery('')
                setStatus('all')
              }}
              onCreate={() => {
                setSelected(null)
                setDialogMode('create')
              }}
              onEdit={(card) => {
                setSelected(card)
                setDialogMode('edit')
              }}
              onTransfer={(card) => {
                setSelected(card)
                setDialogMode('transfer')
              }}
              onToggle={(card) => {
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
              onRemove={setRemoving}
            />
          </motion.div>
        ) : board ? (
          <motion.div
            key={`month:${monthKey}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease }}
          >
            <MonthDesk
              board={board}
              monthKey={monthKey}
              today={today}
              onMonthKey={setMonthKey}
              onOpenDay={setSelectedDate}
              onInvalidate={() => setInvalidateOpen(true)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <CardDialog
        open={dialogMode !== null}
        mode={dialogMode ?? 'create'}
        card={selected}
        stores={stores}
        people={board?.people ?? []}
        defaultStoreId={storeId ?? selected?.storeId}
        lockedDateKey={dialogMode === 'create' ? selectedDate : selected?.dateKey ?? selectedDate}
        onClose={() => {
          setDialogMode(null)
          setSelected(null)
        }}
        onSaved={() => {
          void reload()
        }}
      />

      <InvalidateCardsDialog
        open={invalidateOpen}
        board={board}
        onClose={() => setInvalidateOpen(false)}
        onSaved={(payload) => {
          setBoard(payload)
          setInvalidateOpen(false)
        }}
        onError={setError}
      />

      <Dialog
        open={Boolean(removing)}
        title="Excluir cartão"
        description="O registro some do Card+. Essa ação não dá para desfazer por aqui."
        onClose={() => {
          if (!deleting) setRemoving(null)
        }}
      >
        <div className="px-5 pb-5">
          <p className="text-[13px] text-[#F0EFEC]/55">
            {removing ? `${removing.clientName} · ${removing.operatorName}` : ''}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setRemoving(null)}
              className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 disabled:opacity-40"
            >
              Cancelar
            </button>
            <DangerConfirmButton loading={deleting} onClick={() => void confirmDelete()}>
              Excluir
            </DangerConfirmButton>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function MonthDesk({
  board,
  monthKey,
  today,
  onMonthKey,
  onOpenDay,
  onInvalidate
}: {
  board: CardsBoard
  monthKey: string
  today: string
  onMonthKey: (value: string) => void
  onOpenDay: (dateKey: string) => void
  onInvalidate: () => void
}) {
  const mobile = isMobileShell()
  const overlayHint =
    board.cardTotalOverride === null
      ? board.monthGoal === null
        ? mobile
          ? 'Sem meta no Card+'
          : 'Sem meta mensal no Card+'
        : mobile
          ? 'Progresso da meta'
          : 'Progresso da meta mensal'
      : mobile
        ? `${formatCount(board.cardsThisMonthRegistered)} lançados`
        : `${formatCount(board.cardsThisMonthRegistered)} lançados · total ajustado ${formatCount(board.cardsThisMonth)}`

  return (
    <>
      <header
        className={mobile ? 'mb-4 flex flex-col gap-3' : 'mb-5 flex items-start justify-between gap-4'}
      >
        <div className="min-w-0">
          <h1 className="text-[22px] text-[#F0EFEC]/88">Cartões</h1>
          <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
            {board.storeName
              ? mobile
                ? `Métricas de ${board.storeName}. Toque no dia para abrir.`
                : `Métricas e registros de ${board.storeName}. Clique no dia para ver e registrar.`
              : mobile
                ? 'Toque no dia para ver e registrar os cartões.'
                : 'Clique no dia para ver, editar e registrar os cartões daquela data.'}
          </p>
        </div>
        {board.canEdit ? <OptionsMenu onInvalidate={onInvalidate} /> : null}
      </header>

      <div className={mobile ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-3 gap-3'}>
        <MetricCard
          compact={mobile}
          label="Cartões do dia"
          value={board.cardsToday}
          goal={board.todayGoal}
          hint={board.todayGoal === null ? 'Sem meta do dia no Card+' : 'Progresso da meta diária'}
          icon={<CreditCard className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          compact={mobile}
          label="Cartões do mês"
          value={board.cardsThisMonth}
          goal={board.monthGoal}
          hint={overlayHint}
          icon={<CreditCard className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          compact={mobile}
          label="Total registrado"
          value={board.cardsTotal}
          hint={board.storeName ? `Histórico de ${board.storeName}` : 'Histórico de todas as unidades'}
          icon={<CreditCard className="size-4" strokeWidth={1.7} />}
        />
      </div>

      {board.cardTotalOverride !== null ? (
        <p className="mt-2 text-[12px] text-[#F0EFEC]/36">
          {formatCount(board.cardsThisMonthRegistered)} lançados · total ajustado {formatCount(board.cardsThisMonth)}.
          Os dias e os registros dos funcionários continuam intactos.
        </p>
      ) : null}

      <div className={mobile ? 'mt-3 grid grid-cols-2 gap-2.5' : 'mt-3 grid grid-cols-4 gap-3'}>
        <MiniStat label="Pendentes" value={formatCount(board.pendingCount)} hint="Neste mês" />
        <MiniStat label="Ativados" value={formatCount(board.activatedCount)} hint="Neste mês" />
        <MiniStat
          label="Limite parado"
          value={formatCount(board.idleActivatedCount)}
          hint={mobile ? 'Ativado sem gasto' : 'Ativado sem gasto neste mês'}
        />
        <MiniStat
          label="Limite disponível"
          value={formatBRLFromCents(board.availableCents)}
          hint={
            mobile
              ? `${formatBRLFromCents(board.usedCents)} / ${formatBRLFromCents(board.limitCents)}`
              : `${formatBRLFromCents(board.usedCents)} gastos de ${formatBRLFromCents(board.limitCents)}`
          }
        />
      </div>

      <section className={cn('mt-3 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]', mobile ? 'mb-16' : 'mb-8')}>
        <div
          className={
            mobile ? 'flex flex-col gap-3 px-4 py-4' : 'flex items-center justify-between px-5 py-4'
          }
        >
          <div>
            <h2 className="text-[15px] text-[#F0EFEC]/82">Dias do mês</h2>
            <p className="mt-1 text-[12px] text-[#F0EFEC]/35">
              {mobile ? 'Toque no dia para abrir.' : 'Todos os dias, mesmo com zero cartão.'}
            </p>
          </div>
          <MonthSwitcher value={monthKey} onChange={onMonthKey} />
        </div>
        {mobile ? (
          <div>
            {board.days.map((day) => {
              const sunday = isSunday(day.dateKey)
              const todayRow = day.dateKey === today
              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => onOpenDay(day.dateKey)}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 border-t border-white/[0.03] px-4 py-2.5 text-left',
                    todayRow ? 'bg-white/[0.03]' : null,
                    sunday ? 'text-[#F0EFEC]/36' : 'text-[#F0EFEC]/72'
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="capitalize text-[14px] text-[#F0EFEC]/85">{weekdayLabel(day.dateKey)}</span>
                      <span className="text-[13px] text-[#F0EFEC]/50">{formatDateKey(day.dateKey)}</span>
                      {todayRow ? (
                        <span className="rounded-full bg-[#F0EFEC]/10 px-1.5 py-0.5 text-[10px] tracking-wide text-[#F0EFEC]/55 uppercase">
                          Hoje
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-[#F0EFEC]/38">
                      {formatCount(day.cards)} cartões
                      {day.goal === null ? '' : ` · meta ${formatCount(day.goal)}`}
                      {` · ${formatCount(day.pending)} pend.`}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-[#F0EFEC]/28" strokeWidth={1.8} />
                </button>
              )
            })}
          </div>
        ) : (
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
            <tr className="border-t border-white/[0.04]">
              <th className="px-5 py-2.5 font-medium">Dia</th>
              <th className="px-3 py-2.5 font-medium">Cartões</th>
              <th className="px-3 py-2.5 font-medium">Meta</th>
              <th className="px-3 py-2.5 font-medium">Pendentes</th>
              <th className="px-3 py-2.5 font-medium">Ativados</th>
              <th className="px-3 py-2.5 font-medium">Digitações</th>
              <th className="px-5 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {board.days.map((day) => {
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
                  <td className="px-3 py-3">{formatCount(day.cards)}</td>
                  <td className="px-3 py-3 text-[#F0EFEC]/45">
                    {day.goal === null ? '—' : formatCount(day.goal)}
                  </td>
                  <td className="px-3 py-3">{formatCount(day.pending)}</td>
                  <td className="px-3 py-3">{formatCount(day.activated)}</td>
                  <td className="px-3 py-3">{formatCount(day.digitacoes)}</td>
                  <td className="px-5 py-3 text-right">
                    <ChevronRight className="ml-auto size-3.5 text-[#F0EFEC]/22" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        )}
      </section>
    </>
  )
}

function DayDesk({
  day,
  records,
  query,
  status,
  onQuery,
  onStatus,
  onBack,
  onCreate,
  onEdit,
  onTransfer,
  onToggle,
  onRemove
}: {
  day: CardDayRow
  records: CardRecord[]
  query: string
  status: StatusFilter
  onQuery: (value: string) => void
  onStatus: (value: StatusFilter) => void
  onBack: () => void
  onCreate: () => void
  onEdit: (card: CardRecord) => void
  onTransfer: (card: CardRecord) => void
  onToggle: (card: CardRecord) => void
  onRemove: (card: CardRecord) => void
}) {
  const idle = records.filter((card) => card.activated && card.amountUsedInCents === 0 && card.amountInCents > 0).length
  const available = Math.max(0, day.limitCents - day.usedCents)
  const mobile = isMobileShell()

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex min-h-10 items-center gap-2 text-[13px] text-[#F0EFEC]/40 hover:text-[#F0EFEC]/70"
      >
        <ArrowLeft className="size-3.5" />
        Dias do mês
      </button>

      <header
        className={mobile ? 'mb-4 flex flex-col gap-3' : 'mb-5 flex items-end justify-between gap-4'}
      >
        <div className="min-w-0">
          <p className="text-[12px] text-[#F0EFEC]/35">Cartões · {formatDateKey(day.dateKey)}</p>
          <h1 className={cn('mt-1 capitalize text-[#F0EFEC]/88', mobile ? 'text-[20px] leading-tight' : 'text-[22px]')}>
            {mobile
              ? `${weekdayLabel(day.dateKey)} · ${formatDateKey(day.dateKey)}`
              : weekdayLong(day.dateKey)}
          </h1>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className={
            mobile
              ? 'flex h-11 w-full shrink-0 items-center justify-center rounded-[10px] bg-[#F0EFEC] text-[14px] text-[#111111]'
              : 'h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]'
          }
        >
          Registrar neste dia
        </button>
      </header>

      <div className={mobile ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-3 gap-3'}>
        <MetricCard
          compact={mobile}
          label="Cartões do dia"
          value={day.cards}
          goal={day.goal}
          hint={day.goal === null ? (mobile ? 'Sem meta neste dia' : 'Sem meta deste dia no Card+') : 'Progresso da meta diária'}
          icon={<CreditCard className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          compact={mobile}
          label="Pendentes"
          value={day.pending}
          hint={
            mobile
              ? `${formatCount(day.activated)} ativ. · ${formatCount(idle)} parados`
              : `${formatCount(day.activated)} ativados · ${formatCount(idle)} parados`
          }
          icon={<CreditCard className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          compact={mobile}
          label="Limite disponível"
          value={available}
          money
          hint={
            mobile
              ? `${formatBRLFromCents(day.usedCents)} / ${formatBRLFromCents(day.limitCents)}`
              : `${formatBRLFromCents(day.usedCents)} gastos de ${formatBRLFromCents(day.limitCents)}`
          }
          icon={<CreditCard className="size-4" strokeWidth={1.7} />}
        />
      </div>

      <div className={mobile ? 'mt-3 grid grid-cols-2 gap-2.5' : 'mt-3 grid grid-cols-3 gap-3'}>
        <MiniStat label="Digitações" value={formatCount(day.digitacoes)} />
        <MiniStat label="Ativados" value={formatCount(day.activated)} />
        <div className={mobile ? 'col-span-2' : undefined}>
          <MiniStat
            label="Limite parado"
            value={formatCount(idle)}
            hint={mobile ? 'Ativado sem gasto' : 'Ativado sem gasto neste dia'}
          />
        </div>
      </div>

      <section className={cn('mt-3 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]', mobile ? 'mb-16' : 'mb-8')}>
        <div
          className={
            mobile
              ? 'flex flex-col gap-2 px-3 py-3'
              : 'flex flex-wrap items-center justify-between gap-3 px-4 py-3'
          }
        >
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={mobile ? 'Buscar cliente' : 'Buscar cliente ou funcionário'}
            className={
              mobile
                ? 'h-9 w-full rounded-[8px] border-white/[0.06] bg-transparent text-[13px]'
                : 'h-8 w-[240px] rounded-[8px] border-white/[0.06] bg-transparent text-[13px]'
            }
          />
          <div className={mobile ? '-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5' : 'flex flex-wrap items-center gap-2'}>
            <Chip active={status === 'all'} onClick={() => onStatus('all')}>
              Todos
            </Chip>
            <Chip active={status === 'pending'} onClick={() => onStatus('pending')}>
              Pendentes
            </Chip>
            <Chip active={status === 'activated'} onClick={() => onStatus('activated')}>
              Ativados
            </Chip>
            <Chip active={status === 'idle'} onClick={() => onStatus('idle')}>
              Limite parado
            </Chip>
            <span className="ml-auto shrink-0 self-center text-[12px] text-[#F0EFEC]/32">
              {formatCount(records.length)} {records.length === 1 ? 'cartão' : 'cartões'}
            </span>
          </div>
        </div>
        {records.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="size-6" strokeWidth={1.6} />}
            title="Nenhum cartão neste dia"
            description="Nada registrado nesta data. O primeiro cartão entra direto no Card+."
            actionLabel="Registrar o primeiro"
            onAction={onCreate}
          />
        ) : mobile ? (
          <div className="pb-1">
            {records.map((card) => (
              <div key={card.id} className="border-t border-white/[0.03] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-[#F0EFEC]/85">{card.clientName}</p>
                    <p className="mt-0.5 truncate text-[12px] text-[#F0EFEC]/38">
                      {card.operatorName}
                      {card.storeName ? ` · ${card.storeName}` : ''}
                    </p>
                  </div>
                  <StatusBadge card={card} />
                </div>
                <p className="mt-2 text-[12px] leading-snug text-[#F0EFEC]/42">
                  {formatBRLFromCents(card.amountInCents)}
                  <span className="text-[#F0EFEC]/24"> · </span>
                  gasto {formatBRLFromCents(card.amountUsedInCents)}
                  <span className="text-[#F0EFEC]/24"> · </span>
                  {formatBRLFromCents(card.availableInCents)}
                </p>
                <div className="mt-2 flex justify-end gap-1">
                  <IconButton
                    label={card.activated ? 'Marcar pendente' : 'Ativar'}
                    onClick={() => onToggle(card)}
                  >
                    {card.activated ? 'Pend.' : 'Ativar'}
                  </IconButton>
                  <IconButton label="Editar" onClick={() => onEdit(card)}>
                    <Pencil className="size-3.5" strokeWidth={1.7} />
                  </IconButton>
                  <IconButton label="Transferir" onClick={() => onTransfer(card)}>
                    <ArrowRightLeft className="size-3.5" strokeWidth={1.7} />
                  </IconButton>
                  <IconButton label="Excluir" onClick={() => onRemove(card)}>
                    <Trash2 className="size-3.5" strokeWidth={1.7} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
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
                  <th className="w-[132px] px-4 py-2.5 font-medium" />
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
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <IconButton
                          label={card.activated ? 'Marcar pendente' : 'Ativar'}
                          onClick={() => onToggle(card)}
                        >
                          {card.activated ? 'Pend.' : 'Ativar'}
                        </IconButton>
                        <IconButton label="Editar" onClick={() => onEdit(card)}>
                          <Pencil className="size-3.5" strokeWidth={1.7} />
                        </IconButton>
                        <IconButton label="Transferir" onClick={() => onTransfer(card)}>
                          <ArrowRightLeft className="size-3.5" strokeWidth={1.7} />
                        </IconButton>
                        <IconButton label="Excluir" onClick={() => onRemove(card)}>
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
  )
}

function OptionsMenu({ onInvalidate }: { onInvalidate: () => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const mobile = isMobileShell()

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <div ref={rootRef} className={cn('relative shrink-0', mobile && 'w-full')}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={
          mobile
            ? 'inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 text-[14px] text-[#F0EFEC]/70'
            : 'inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-[#F0EFEC]/70 hover:bg-white/[0.05] hover:text-[#F0EFEC]/88'
        }
      >
        Opções
        <ChevronDown className={cn('size-3.5 text-[#F0EFEC]/40 transition-transform', open ? 'rotate-180' : null)} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.14 }}
            className="absolute top-[calc(100%+6px)] right-0 z-20 min-w-[200px] rounded-[12px] border border-white/[0.08] bg-[#171717] p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onInvalidate()
              }}
              className="flex h-8 w-full items-center rounded-[8px] px-2.5 text-left text-[13px] text-[#F0EFEC]/72 hover:bg-white/[0.05] hover:text-[#F0EFEC]/90"
            >
              Invalidar cartões
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function InvalidateCardsDialog({
  open,
  board,
  onClose,
  onSaved,
  onError
}: {
  open: boolean
  board: CardsBoard | null
  onClose: () => void
  onSaved: (board: CardsBoard) => void
  onError: (message: string) => void
}) {
  const registered = board?.cardsThisMonthRegistered ?? 0
  const [total, setTotal] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !board) return
    setTotal(String(board.cardTotalOverride ?? ''))
  }, [open, board])

  async function save(next: number | null): Promise<void> {
    if (!board?.storeId) {
      onError('Escolha uma unidade no filtro para ajustar o total do mês.')
      return
    }
    setSaving(true)
    try {
      const payload = await operations().upsertCardMonthTotal({
        storeId: board.storeId,
        monthKey: board.monthKey,
        total: next
      })
      onSaved(payload)
    } catch (saveError) {
      onError(operationError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      title="Invalidar cartões"
      description="O sistema próprio da loja (não o FLOW nem o Card+) pode invalidar cartões. O FLOW guarda todos os lançamentos do dia."
      onClose={onClose}
    >
      <div className="px-5 pb-5">
        <p className="text-[13px] leading-relaxed text-[#F0EFEC]/55">
          Aqui você informa o <span className="text-[#F0EFEC]/78">total correto</span> e o FLOW só ajusta o
          total exibido em Cartões do mês. A tabela diária e os registros dos funcionários continuam iguais.
        </p>
        <p className="mt-3 text-[12px] text-[#F0EFEC]/38">
          Exemplo: 73 lançados, real 69. Neste mês há {formatCount(registered)}{' '}
          {registered === 1 ? 'lançamento' : 'lançamentos'}
          {board?.storeName ? ` em ${board.storeName}` : ''}.
        </p>
        {!board?.storeId ? (
          <p className="mt-3 rounded-[10px] border border-amber-400/15 bg-amber-400/8 px-3 py-2 text-[12px] text-amber-100/75">
            Escolha uma unidade no filtro da sidebar para gravar o ajuste.
          </p>
        ) : (
          <div className="mt-4">
            <Label htmlFor="card-total-override" className="text-[12px] text-[#F0EFEC]/55">
              Total correto do mês
            </Label>
            <Input
              id="card-total-override"
              inputMode="numeric"
              value={total}
              onChange={(event) => setTotal(event.target.value.replace(/[^\d]/g, ''))}
              placeholder={String(registered)}
              className="mt-1.5 h-9 rounded-[8px] border-white/[0.08] bg-transparent text-[13px]"
            />
          </div>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          {board && board.cardTotalOverride !== null ? (
            <button
              type="button"
              disabled={saving || !board.storeId}
              onClick={() => void save(null)}
              className="mr-auto h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45 hover:text-[#F0EFEC]/70"
            >
              Voltar ao lançado
            </button>
          ) : null}
          <button type="button" onClick={onClose} className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !board?.storeId || total.trim() === ''}
            onClick={() => void save(Number(total))}
            className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111] disabled:opacity-40"
          >
            Salvar
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const mobile = isMobileShell()
  return (
    <article
      className={cn(
        'flex h-full min-w-0 flex-col rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]',
        mobile ? 'min-h-[88px] px-3.5 py-3' : 'min-h-[92px] px-4 py-3'
      )}
    >
      <p className="text-[12px] leading-snug text-[#F0EFEC]/38">{label}</p>
      <p
        className={cn(
          'mt-1 tracking-tight break-words text-[#F0EFEC]/86',
          mobile ? 'text-[16px] leading-snug' : 'text-[18px]'
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className={cn('mt-auto pt-2 leading-snug text-[#F0EFEC]/30', mobile ? 'line-clamp-2 text-[11px]' : 'text-[11px]')}>
          {hint}
        </p>
      ) : null}
    </article>
  )
}

function Chip({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 shrink-0 whitespace-nowrap rounded-[8px] px-2.5 text-[12px]',
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
