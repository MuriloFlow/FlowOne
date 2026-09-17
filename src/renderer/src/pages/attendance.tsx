import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, ChevronDown, ChevronRight, ClipboardPlus, MapPin, Pencil, Trash2, UsersRound } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { MetricCard } from '@/components/metric-card'
import { MonthSwitcher } from '@/components/month-switcher'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  currentDateKey,
  currentMonthKey,
  formatCount,
  formatDateKey,
  isSunday,
  weekdayLabel,
  weekdayLong
} from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import {
  TEAM_HEADCOUNT_ROLES,
  attendanceKindLabel,
  attendanceKindTone,
  attendanceStoreFunctionLabel,
  type AttendanceBoard,
  type AttendanceDayRow,
  type AttendanceEvent,
  type AttendanceKind,
  type AttendancePerson,
  type TeamHeadcountRole,
  type TeamHeadcountRow
} from '../../../shared/attendance'

type AttendancePageProps = {
  storeId?: string | null
}

const ease = [0.22, 1, 0.36, 1] as const

const FORM_KIND_OPTIONS = [
  { value: 'ATESTADO', label: 'Atestado' },
  { value: 'FALTA_JUSTIFICADA', label: 'Falta justificada' },
  { value: 'FALTA', label: 'Falta' },
  { value: 'BANCO_HORAS', label: 'Banco de horas' }
]

function padQuota(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0')
}

function toneClass(kind: AttendanceKind, justified?: boolean): string {
  const tone = attendanceKindTone(kind, justified)
  if (tone === 'blue') return 'bg-[#3B82F6]/16 text-[#93C5FD]'
  if (tone === 'yellow') return 'bg-[#EAB308]/16 text-[#FDE68A]'
  return 'bg-red-500/14 text-red-300/85'
}

function toneDot(kind: AttendanceKind, justified?: boolean): string {
  const tone = attendanceKindTone(kind, justified)
  if (tone === 'blue') return 'bg-[#3B82F6]'
  if (tone === 'yellow') return 'bg-[#EAB308]'
  return 'bg-[#EF4444]'
}

export function AttendancePage({ storeId = null }: AttendancePageProps) {
  const today = currentDateKey()
  const [board, setBoard] = useState<AttendanceBoard | null>(null)
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [quadroOpen, setQuadroOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [editing, setEditing] = useState<AttendanceEvent | null>(null)
  const [removing, setRemoving] = useState<AttendanceEvent | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setSelectedDate(null)
  }, [storeId, monthKey])

  useEffect(() => {
    if (!storeId) {
      setBoard(null)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void operations()
      .getAttendanceBoard(storeId, monthKey)
      .then((payload) => {
        if (!active) return
        setBoard(payload)
        setError(null)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(operationError(loadError))
        setBoard(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [storeId, monthKey])

  const dayRow = board?.days.find((item) => item.dateKey === selectedDate) ?? null
  const dayEvents = useMemo(() => {
    if (!selectedDate || !board) return []
    return board.events.filter((event) => event.dateKey === selectedDate)
  }, [board, selectedDate])

  async function reload(): Promise<void> {
    if (!storeId) return
    const payload = await operations().getAttendanceBoard(storeId, monthKey)
    setBoard(payload)
  }

  async function confirmDelete(): Promise<void> {
    if (!removing || !board) return
    setDeleting(true)
    try {
      await operations().deleteAttendanceEvent(removing.id, board.storeId)
      setRemoving(null)
      await reload()
    } catch (deleteError) {
      setError(operationError(deleteError))
    } finally {
      setDeleting(false)
    }
  }

  if (!storeId) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
        <MapPin className="mb-3 size-6 text-[#F0EFEC]/28" />
        <h1 className="text-[18px] text-[#F0EFEC]/78">Escolha uma unidade</h1>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-[#F0EFEC]/36">
          O quadro e as ocorrências são por loja e por dia. Selecione a unidade no topo.
        </p>
      </div>
    )
  }

  if (loading && !board) {
    return (
      <div className="flex flex-col">
        <div className="mb-6 h-8 w-52 animate-pulse rounded-full bg-white/5" />
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
      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      {board?.tableMissing ? (
        <div className="mb-4 rounded-[12px] border border-amber-400/15 bg-amber-400/8 px-4 py-3 text-[13px] text-amber-200/80">
          Rode o SQL 0012_flow_attendance.sql no Supabase do FLOW. Se o 0012 antigo já rodou, use
          0013_flow_attendance_daily_headcount.sql.
        </div>
      ) : null}

      <AnimatePresence mode="wait">
        {selectedDate && dayRow && board ? (
          <motion.div
            key={`day:${selectedDate}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease }}
          >
            <DayDesk
              day={dayRow}
              events={dayEvents}
              board={board}
              onBack={() => setSelectedDate(null)}
              onOpenQuadro={() => setQuadroOpen(true)}
              onCreateEvent={() => {
                setEditing(null)
                setEventOpen(true)
              }}
              onEdit={(event) => {
                setEditing(event)
                setEventOpen(true)
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
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      {board && selectedDate && dayRow ? (
        <QuadroDialog
          open={quadroOpen}
          dateKey={selectedDate}
          board={board}
          day={dayRow}
          onClose={() => setQuadroOpen(false)}
          onSaved={() => {
            void reload()
          }}
        />
      ) : null}

      {board ? (
        <EventDialog
          open={eventOpen}
          dateKey={selectedDate}
          board={board}
          event={editing}
          onClose={() => {
            setEventOpen(false)
            setEditing(null)
          }}
          onSaved={() => {
            void reload()
          }}
        />
      ) : null}

      <Dialog
        open={Boolean(removing)}
        title="Remover registro"
        description="A ocorrência some deste dia. Dá para lançar de novo depois."
        onClose={() => setRemoving(null)}
      >
        <div className="px-5 pb-5">
          <p className="text-[13px] text-[#F0EFEC]/55">
            {removing ? `${removing.name} · ${attendanceKindLabel(removing.kind, removing.justified)}` : ''}
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
              Remover
            </button>
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
  onOpenDay
}: {
  board: AttendanceBoard
  monthKey: string
  today: string
  onMonthKey: (value: string) => void
  onOpenDay: (dateKey: string) => void
}) {
  const filledDays = board.days.filter((day) => day.headcountFilled).length
  const atestados = board.events.filter((event) => event.kind === 'ATESTADO').length
  const faltas = board.events.filter(
    (event) => event.kind === 'FALTA' || event.kind === 'FALTA_JUSTIFICADA'
  ).length

  return (
    <>
      <header className="mb-5">
        <h1 className="text-[22px] text-[#F0EFEC]/88">Atestados e Equipe</h1>
        <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
          Clique no dia de {board.storeName} para registrar o quadro e as ocorrências.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Dias com quadro"
          value={filledDays}
          hint="Quantos dias deste mês já têm o quadro preenchido"
          icon={<UsersRound className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Atestados no mês"
          value={atestados}
          hint="Lançados neste mês nesta unidade"
          icon={<ClipboardPlus className="size-4" strokeWidth={1.7} />}
        />
        <MetricCard
          label="Faltas no mês"
          value={faltas}
          hint="Justificadas ou não"
          icon={<ClipboardPlus className="size-4" strokeWidth={1.7} />}
        />
      </div>

      <section className="mt-3 mb-8 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-[15px] text-[#F0EFEC]/82">Dias do mês</h2>
            <p className="mt-1 text-[12px] text-[#F0EFEC]/35">Todos os dias. Clique para abrir o dia.</p>
          </div>
          <MonthSwitcher value={monthKey} onChange={onMonthKey} />
        </div>
        <table className="w-full text-left text-[13px]">
          <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
            <tr className="border-t border-white/[0.04]">
              <th className="px-5 py-2.5 font-medium">Dia</th>
              <th className="px-3 py-2.5 font-medium">Quadro</th>
              <th className="px-3 py-2.5 font-medium">Atestados</th>
              <th className="px-3 py-2.5 font-medium">Faltas</th>
              <th className="px-3 py-2.5 font-medium">Banco</th>
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
                  <td className="px-3 py-3">{day.headcountFilled ? 'Sim' : '—'}</td>
                  <td className="px-3 py-3">{formatCount(day.atestadoCount)}</td>
                  <td className="px-3 py-3">{formatCount(day.faltaCount)}</td>
                  <td className="px-3 py-3">{formatCount(day.bancoCount)}</td>
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
  events,
  board,
  onBack,
  onOpenQuadro,
  onCreateEvent,
  onEdit,
  onRemove
}: {
  day: AttendanceDayRow
  events: AttendanceEvent[]
  board: AttendanceBoard
  onBack: () => void
  onOpenQuadro: () => void
  onCreateEvent: () => void
  onEdit: (event: AttendanceEvent) => void
  onRemove: (event: AttendanceEvent) => void
}) {
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
          <p className="text-[12px] text-[#F0EFEC]/35">
            Atestados e Equipe · {formatDateKey(day.dateKey)}
          </p>
          <h1 className="mt-1 text-[22px] capitalize text-[#F0EFEC]/88">{weekdayLong(day.dateKey)}</h1>
        </div>
        {board.canEdit ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onOpenQuadro}
              className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
            >
              {day.headcountFilled ? 'Atualizar quadro' : 'Registrar quadro'}
            </button>
            <button
              type="button"
              onClick={onCreateEvent}
              className="h-8 rounded-[8px] border border-white/[0.08] bg-white/[0.05] px-3.5 text-[13px] text-[#F0EFEC]/82"
            >
              Registrar ocorrência
            </button>
          </div>
        ) : null}
      </header>

      <QuadroReadout rows={day.headcount} filled={day.headcountFilled} />

      <section className="mt-3 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
        {events.length === 0 ? (
          <EmptyState
            icon={<ClipboardPlus className="size-6" strokeWidth={1.6} />}
            title="Nenhuma ocorrência neste dia"
            description="Registre atestado, falta, falta justificada ou banco de horas com o nome de quem está no cadastro da loja."
            actionLabel={board.canEdit ? 'Registrar ocorrência' : 'Voltar aos dias'}
            onAction={board.canEdit ? onCreateEvent : onBack}
          />
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
              <tr className="border-b border-white/[0.04]">
                <th className="px-5 py-2.5 font-medium">Colaborador</th>
                <th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">Observação</th>
                <th className="px-3 py-2.5 font-medium">Quem lançou</th>
                <th className="px-5 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t border-white/[0.035] text-[#F0EFEC]/72">
                  <td className="px-5 py-3">{event.name}</td>
                  <td className="px-3 py-3">
                    <KindChip kind={event.kind} justified={event.justified} />
                  </td>
                  <td className="px-3 py-3 text-[#F0EFEC]/48">{event.note || '—'}</td>
                  <td className="px-3 py-3 text-[#F0EFEC]/48">{event.createdByName || '—'}</td>
                  <td className="px-5 py-3">
                    {board.canEdit ? (
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          aria-label="Editar"
                          onClick={() => onEdit(event)}
                          className="flex size-7 items-center justify-center rounded-[8px] text-[#F0EFEC]/35 hover:bg-white/[0.05] hover:text-[#F0EFEC]/70"
                        >
                          <Pencil className="size-3.5" strokeWidth={1.7} />
                        </button>
                        <button
                          type="button"
                          aria-label="Remover"
                          onClick={() => onRemove(event)}
                          className="flex size-7 items-center justify-center rounded-[8px] text-[#F0EFEC]/35 hover:bg-white/[0.05] hover:text-red-300/80"
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.7} />
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  )
}

function QuadroReadout({ rows, filled }: { rows: TeamHeadcountRow[]; filled: boolean }) {
  return (
    <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
      <p className="text-[11px] tracking-wide text-[#F0EFEC]/38 uppercase">
        Quadro fixo trabalhado do dia
      </p>
      {!filled ? (
        <p className="mt-1 text-[12px] text-[#F0EFEC]/35">Nenhum quadro neste dia. Os números ficam zerados até você registrar.</p>
      ) : null}
      <div className="mt-3 grid grid-cols-5 gap-3">
        {rows.map((row) => (
          <article key={row.roleKey} className="rounded-[12px] border border-white/[0.05] bg-white/[0.02] px-3 py-3">
            <p className="text-[10px] tracking-wide text-[#F0EFEC]/38 uppercase">{row.label}</p>
            <p className="mt-1 text-[22px] tracking-tight text-[#F0EFEC]/88">{padQuota(row.count)}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function KindChip({ kind, justified }: { kind: AttendanceKind; justified: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]', toneClass(kind, justified))}>
      <span className={cn('size-2 shrink-0 rounded-full', toneDot(kind, justified))} />
      {attendanceKindLabel(kind, justified)}
    </span>
  )
}

function QuadroDialog({
  open,
  dateKey,
  board,
  day,
  onClose,
  onSaved
}: {
  open: boolean
  dateKey: string
  board: AttendanceBoard
  day: AttendanceDayRow
  onClose: () => void
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<Record<TeamHeadcountRole, string>>(() =>
    Object.fromEntries(TEAM_HEADCOUNT_ROLES.map((role) => [role.id, '0'])) as Record<
      TeamHeadcountRole,
      string
    >
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const quotaKey = day.headcount.map((row) => `${row.roleKey}:${row.count}`).join('|')

  useEffect(() => {
    if (!open) return
    setError(null)
    setDraft(
      Object.fromEntries(day.headcount.map((row) => [row.roleKey, String(row.count)])) as Record<
        TeamHeadcountRole,
        string
      >
    )
  }, [open, dateKey, quotaKey, day.headcount])

  async function save(): Promise<void> {
    if (!board.canEdit) return
    setSaving(true)
    try {
      await operations().upsertTeamHeadcount({
        storeId: board.storeId,
        dateKey,
        counts: TEAM_HEADCOUNT_ROLES.map((role) => ({
          roleKey: role.id,
          count: Number(draft[role.id] || 0)
        }))
      })
      onClose()
      onSaved()
    } catch (saveError) {
      setError(operationError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      title="Quadro do dia"
      description={`${weekdayLong(dateKey)} · só a quantidade de cada cargo neste dia. Sem nomes.`}
      onClose={onClose}
    >
      <div className="space-y-4 px-5 pb-5">
        {error ? (
          <p className="rounded-[10px] border border-red-500/15 bg-red-500/8 px-3 py-2 text-[12px] text-red-300/80">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3">
          {TEAM_HEADCOUNT_ROLES.map((role) => (
            <label key={role.id} className="flex items-center justify-between gap-3">
              <span className="text-[12px] tracking-wide text-[#F0EFEC]/55 uppercase">{role.label}</span>
              <Input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={3}
                value={draft[role.id] ?? '0'}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [role.id]: event.target.value.replace(/\D/g, '').slice(0, 3)
                  }))
                }
                className="h-9 w-24 border-white/[0.08] bg-transparent text-right text-[16px] tracking-tight text-[#F0EFEC]/88"
              />
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
          >
            {saving ? 'Salvando…' : 'Salvar quadro'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function personOptionLabel(person: AttendancePerson): string {
  const role = attendanceStoreFunctionLabel(person.roleLabel)
  return role ? `${person.name} · ${role}` : person.name
}

function PersonPicker({
  people,
  value,
  enabled,
  onChange
}: {
  people: AttendancePerson[]
  value: string
  enabled: boolean
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const [coords, setCoords] = useState<{
    left: number
    width: number
    maxHeight: number
    top?: number
    bottom?: number
  } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = people.find((person) => person.id === value)
  const selectedLabel = selected ? personOptionLabel(selected) : ''

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term || query === selectedLabel) return people
    return people.filter((person) => personOptionLabel(person).toLowerCase().includes(term))
  }, [people, query, selectedLabel])

  function measure(): void {
    const input = inputRef.current
    if (!input) return
    const rect = input.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 12
    const spaceAbove = rect.top - 12
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow
    const maxHeight = Math.max(120, Math.min(280, openUp ? spaceAbove : spaceBelow))
    setCoords({
      left: rect.left,
      width: rect.width,
      maxHeight,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 })
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, filtered.length])

  useEffect(() => {
    const index = filtered.findIndex((person) => person.id === value)
    setHighlight(index >= 0 ? index : 0)
  }, [filtered, value])

  useEffect(() => {
    if (!enabled) {
      setOpen(false)
      setQuery('')
      return
    }
    if (open) return
    setQuery(selectedLabel)
  }, [enabled, open, selectedLabel])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  useEffect(() => {
    if (!open) return
    const node = menuRef.current?.querySelector(`[data-picker-index="${highlight}"]`)
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' })
  }, [highlight, open, filtered])

  function choose(person: AttendancePerson): void {
    onChange(person.id)
    setQuery(personOptionLabel(person))
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlight((current) => Math.min(Math.max(filtered.length - 1, 0), current + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setHighlight((current) => Math.max(0, current - 1))
      return
    }
    if (event.key === 'Enter' && open) {
      const person = filtered[highlight]
      if (!person) return
      event.preventDefault()
      choose(person)
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          value={query}
          placeholder="Buscar por nome"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onFocus={(event) => {
            setOpen(true)
            event.currentTarget.select()
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-[10px] border border-white/[0.08] bg-white/[0.03] pr-9 pl-3 text-[13px] text-[#F0EFEC]/80 outline-none placeholder:text-[#F0EFEC]/28 focus:border-white/16"
        />
        <ChevronDown
          className={cn(
            'pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-[#F0EFEC]/30 transition-transform',
            open && 'rotate-180'
          )}
        />
      </div>
      {createPortal(
        <AnimatePresence>
          {open && coords ? (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: coords.bottom === undefined ? 4 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: coords.bottom === undefined ? 4 : -4 }}
              transition={{ duration: 0.14 }}
              role="listbox"
              style={{
                position: 'fixed',
                left: coords.left,
                width: coords.width,
                top: coords.top,
                bottom: coords.bottom,
                maxHeight: coords.maxHeight,
                zIndex: 70
              }}
              className="overflow-auto rounded-[12px] border border-white/[0.08] bg-[#1A1A1A] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.45)]"
            >
              {filtered.length === 0 ? (
                <p className="px-2.5 py-2 text-[13px] text-[#F0EFEC]/38">Ninguém encontrado</p>
              ) : (
                filtered.map((person, index) => {
                  const active = person.id === value
                  const highlighted = index === highlight
                  return (
                    <button
                      key={person.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      data-picker-index={index}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => choose(person)}
                      className={cn(
                        'flex h-8 w-full items-center justify-between rounded-[8px] px-2.5 text-left text-[13px]',
                        highlighted || active
                          ? 'bg-white/[0.06] text-[#F0EFEC]/85'
                          : 'text-[#F0EFEC]/62 hover:bg-white/[0.04] hover:text-[#F0EFEC]/80'
                      )}
                    >
                      <span className="truncate">{personOptionLabel(person)}</span>
                      {active ? <Check className="size-3.5 text-[#F0EFEC]/45" /> : null}
                    </button>
                  )
                })
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

function EventDialog({
  open,
  dateKey,
  board,
  event,
  onClose,
  onSaved
}: {
  open: boolean
  dateKey: string | null
  board: AttendanceBoard
  event: AttendanceEvent | null
  onClose: () => void
  onSaved: () => void
}) {
  const [collaboratorId, setCollaboratorId] = useState('')
  const [formKind, setFormKind] = useState<AttendanceKind>('ATESTADO')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCollaboratorId(event?.collaboratorId ?? '')
    setFormKind(event?.kind ?? 'ATESTADO')
    setNote(event?.note ?? '')
    setError(null)
  }, [open, event])

  async function save(): Promise<void> {
    if (!dateKey) return
    if (!collaboratorId) {
      setError('Escolha o colaborador.')
      return
    }
    setSaving(true)
    try {
      await operations().upsertAttendanceEvent({
        id: event?.id,
        storeId: board.storeId,
        dateKey,
        collaboratorId,
        kind: formKind,
        note
      })
      onClose()
      onSaved()
    } catch (saveError) {
      setError(operationError(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      title={event ? 'Editar ocorrência' : 'Registrar ocorrência'}
      description={
        dateKey
          ? `${weekdayLong(dateKey)} · escolha quem está no cadastro da loja e o tipo.`
          : 'Escolha o colaborador e o tipo.'
      }
      onClose={onClose}
    >
      <div className="space-y-4 px-5 pb-5">
        {error ? (
          <p className="rounded-[10px] border border-red-500/15 bg-red-500/8 px-3 py-2 text-[12px] text-red-300/80">
            {error}
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">Colaborador</Label>
          <PersonPicker
            people={board.people}
            value={collaboratorId}
            enabled={open}
            onChange={setCollaboratorId}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">Tipo</Label>
          <Select
            value={formKind}
            options={FORM_KIND_OPTIONS}
            onChange={(value) => setFormKind(value as AttendanceKind)}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px] text-[#F0EFEC]/45">Observação</Label>
          <textarea
            value={note}
            maxLength={280}
            rows={3}
            placeholder="Por que faltou, número do atestado, banco de horas, etc."
            onChange={(event) => setNote(event.target.value)}
            className="w-full resize-none rounded-[10px] border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] text-[#F0EFEC]/80 outline-none placeholder:text-[#F0EFEC]/28 focus:border-white/16"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45">
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
