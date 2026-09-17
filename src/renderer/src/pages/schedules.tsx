import { useEffect, useMemo, useState } from 'react'
import { Clock3, GripVertical, ImageDown, MapPin, UserRound } from 'lucide-react'
import { ScheduleHoursDialog } from '@/components/schedule-hours-dialog'
import { WeekSwitcher } from '@/components/week-switcher'
import { Input } from '@/components/ui/input'
import { currentDateKey, formatDateKey, mondayOf } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import { exportScheduleImage } from '@/lib/schedule-export'
import { cn } from '@/lib/utils'
import {
  bandLabel,
  formatClock,
  type ScheduleAssignment,
  type ScheduleBoard,
  type SchedulePerson
} from '../../../shared/schedules'

type SchedulesPageProps = {
  storeId?: string | null
}

type DragPayload =
  | { kind: 'person'; id: string }
  | { kind: 'shift'; assignmentId: string; collaboratorId: string }

const DRAG_MIME = 'application/x-flow-schedule'

export function SchedulesPage({ storeId = null }: SchedulesPageProps) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(currentDateKey()))
  const [board, setBoard] = useState<ScheduleBoard | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoursOpen, setHoursOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [overSlot, setOverSlot] = useState<string | null>(null)
  const [overPool, setOverPool] = useState(false)

  useEffect(() => {
    if (!storeId) {
      setBoard(null)
      return
    }
    let active = true
    setLoading(true)
    void operations()
      .getScheduleBoard(storeId, weekStart)
      .then((payload) => {
        if (!active) return
        setBoard(payload)
        setWeekStart(payload.weekStart)
        setError(null)
      })
      .catch((loadError) => {
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
  }, [storeId, weekStart])

  const people = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (board?.people ?? []).filter((person) => {
      if (!term) return true
      return `${person.name} ${person.roleLabel}`.toLowerCase().includes(term)
    })
  }, [board, query])

  async function reload(): Promise<void> {
    if (!storeId) return
    const payload = await operations().getScheduleBoard(storeId, weekStart)
    setBoard(payload)
  }

  async function dropOnSlot(slotId: string, payload: DragPayload): Promise<void> {
    if (!board?.canEdit) return
    try {
      await operations().upsertScheduleAssignment({
        id: payload.kind === 'shift' ? payload.assignmentId : undefined,
        storeId: board.storeId,
        weekStart: board.weekStart,
        slotId,
        collaboratorId: payload.kind === 'person' ? payload.id : payload.collaboratorId
      })
      await reload()
    } catch (dropError) {
      setError(operationError(dropError))
    }
  }

  async function dropOnPool(payload: DragPayload): Promise<void> {
    if (!board?.canEdit || payload.kind !== 'shift') return
    try {
      await operations().deleteScheduleAssignment(payload.assignmentId, board.storeId)
      await reload()
    } catch (dropError) {
      setError(operationError(dropError))
    }
  }

  if (!storeId) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-white/[0.04] text-[#F0EFEC]/32">
          <MapPin className="size-6" strokeWidth={1.6} />
        </div>
        <h2 className="text-[15px] text-[#F0EFEC]/78">Escolha uma unidade</h2>
        <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-[#F0EFEC]/38">
          A escala é por loja. Selecione a unidade no seletor para montar a semana.
        </p>
      </div>
    )
  }

  if (loading && !board) {
    return (
      <div className="flex flex-col">
        <div className="mb-6 h-8 w-40 animate-pulse rounded-full bg-white/5" />
        <div className="h-[420px] animate-pulse rounded-[16px] bg-white/4" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] text-[#F0EFEC]/88">Escalas</h1>
          <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
            {board?.storeName ?? 'Unidade'} · arraste a equipe para o horário. A próxima semana copia sozinha.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WeekSwitcher value={weekStart} onChange={setWeekStart} />
          <button
            type="button"
            onClick={() => setHoursOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-white/[0.07] px-2.5 text-[12px] text-[#F0EFEC]/55"
          >
            <Clock3 className="size-3.5" />
            Horários
          </button>
          <button
            type="button"
            disabled={!board}
            onClick={() => board && void exportScheduleImage(board)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[#F0EFEC] px-2.5 text-[12px] text-[#111111]"
          >
            <ImageDown className="size-3.5" />
            Imagem para o Zap
          </button>
        </div>
      </header>

      {board?.rolledFromWeek ? (
        <p className="mb-3 text-[12px] text-[#F0EFEC]/36">
          Semana montada automaticamente a partir de {formatDateKey(board.rolledFromWeek)}. Arraste para ajustar.
        </p>
      ) : null}

      {board ? (
        <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] gap-3">
          <aside
            onDragOver={(event) => {
              event.preventDefault()
              setOverPool(true)
            }}
            onDragLeave={() => setOverPool(false)}
            onDrop={(event) => {
              event.preventDefault()
              setOverPool(false)
              const payload = readDrag(event)
              if (payload) void dropOnPool(payload)
            }}
            className={cn(
              'flex min-h-0 flex-col rounded-[16px] border bg-[#1A1A1A] p-3',
              overPool ? 'border-[#8B8DFF]/40' : 'border-white/[0.045]'
            )}
          >
            <p className="text-[12px] text-[#F0EFEC]/40">Equipe</p>
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar"
              className="mt-2 h-8 rounded-[8px] border-white/[0.06] bg-transparent text-[13px]"
            />
            <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-auto pr-1">
              {people.map((person) => (
                <PersonChip key={person.id} person={person} disabled={!board.canEdit} />
              ))}
              {people.length === 0 ? (
                <p className="px-1 py-6 text-center text-[12px] text-[#F0EFEC]/32">Ninguém nesta unidade.</p>
              ) : null}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#F0EFEC]/28">
              Solte aqui para tirar da escala. Uma pessoa pode entrar em vários dias.
            </p>
          </aside>

          <div className="min-w-0 overflow-auto rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
            <div className="grid min-w-[920px] grid-cols-7">
              {board.days.map((day) => (
                <section key={day.dateKey} className="border-l border-white/[0.04] first:border-l-0">
                  <header className="border-b border-white/[0.045] px-3 py-3">
                    <p className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">{day.shortLabel}</p>
                    <p className="mt-0.5 text-[14px] text-[#F0EFEC]/78">{formatDateKey(day.dateKey).slice(0, 5)}</p>
                  </header>
                  <div className="space-y-2 p-2">
                    {day.slots.map((slot) => (
                      <DropSlot
                        key={slot.id}
                        title={slot.label}
                        hint={`${formatClock(slot.startMinutes)} – ${formatClock(slot.endMinutes)}`}
                        band={bandLabel(slot.band)}
                        assignments={slot.assignments}
                        active={overSlot === slot.id}
                        disabled={!board.canEdit}
                        onDragOver={() => setOverSlot(slot.id)}
                        onDragLeave={() => setOverSlot((current) => (current === slot.id ? null : current))}
                        onDrop={(payload) => {
                          setOverSlot(null)
                          void dropOnSlot(slot.id, payload)
                        }}
                      />
                    ))}
                    {day.slots.length === 0 ? (
                      <p className="px-2 py-6 text-center text-[12px] text-[#F0EFEC]/28">Sem horário neste dia.</p>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {board ? (
        <ScheduleHoursDialog
          open={hoursOpen}
          storeId={board.storeId}
          slots={board.days.flatMap((day) => day.slots)}
          saving={saving}
          onClose={() => setHoursOpen(false)}
          onSave={async (slots) => {
            setSaving(true)
            try {
              await operations().saveScheduleSlots(board.storeId, slots)
              setHoursOpen(false)
              await reload()
            } catch (saveError) {
              setError(operationError(saveError))
            } finally {
              setSaving(false)
            }
          }}
          onReset={async () => {
            setSaving(true)
            try {
              await operations().resetScheduleSlots(board.storeId)
              setHoursOpen(false)
              await reload()
            } catch (resetError) {
              setError(operationError(resetError))
            } finally {
              setSaving(false)
            }
          }}
        />
      ) : null}
    </div>
  )
}

function readDrag(event: React.DragEvent): DragPayload | null {
  try {
    const raw = event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain')
    const parsed = JSON.parse(raw) as DragPayload
    if (parsed.kind === 'person' || parsed.kind === 'shift') return parsed
  } catch {
    return null
  }
  return null
}

function PersonChip({ person, disabled }: { person: SchedulePerson; disabled: boolean }) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'person', id: person.id } satisfies DragPayload))
        event.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'person', id: person.id }))
        event.dataTransfer.effectAllowed = 'copyMove'
      }}
      className={cn(
        'flex items-center gap-2 rounded-[10px] border border-white/[0.05] bg-white/[0.03] px-2 py-1.5',
        disabled ? 'opacity-50' : 'cursor-grab active:cursor-grabbing hover:bg-white/[0.05]'
      )}
    >
      <GripVertical className="size-3 text-[#F0EFEC]/22" />
      <span className="flex size-6 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[10px] text-[#F0EFEC]/50">
        {person.shortName.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-[#F0EFEC]/78">{person.shortName}</span>
        <span className="block truncate text-[10px] text-[#F0EFEC]/32">{person.roleLabel}</span>
      </span>
    </div>
  )
}

function DropSlot({
  title,
  hint,
  band,
  assignments,
  active,
  disabled,
  onDragOver,
  onDragLeave,
  onDrop
}: {
  title: string
  hint: string
  band: string
  assignments: ScheduleAssignment[]
  active: boolean
  disabled: boolean
  onDragOver: () => void
  onDragLeave: () => void
  onDrop: (payload: DragPayload) => void
}) {
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver()
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => {
        event.preventDefault()
        const payload = readDrag(event)
        if (payload) onDrop(payload)
      }}
      className={cn(
        'min-h-[92px] rounded-[12px] border px-2 py-2 transition-colors',
        active ? 'border-[#8B8DFF]/45 bg-[#8B8DFF]/8' : 'border-white/[0.05] bg-white/[0.02]'
      )}
    >
      <p className="text-[10px] tracking-wide text-[#F0EFEC]/30 uppercase">{band}</p>
      <p className="text-[12px] text-[#F0EFEC]/70">{title}</p>
      <p className="text-[10px] text-[#F0EFEC]/32">{hint}</p>
      <div className="mt-2 space-y-1">
        {assignments.map((item) => (
          <div
            key={item.id}
            draggable={!disabled}
            onDragStart={(event) => {
              const payload: DragPayload = {
                kind: 'shift',
                assignmentId: item.id,
                collaboratorId: item.collaboratorId
              }
              event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
              event.dataTransfer.setData('text/plain', JSON.stringify(payload))
              event.dataTransfer.effectAllowed = 'move'
            }}
            className="flex items-center justify-between rounded-[8px] bg-[#F0EFEC]/8 px-2 py-1"
          >
            <span className="truncate text-[12px] text-[#F0EFEC]/82">{item.shortName}</span>
            <span className="text-[10px] text-[#F0EFEC]/32">{item.note ?? hint.split(' – ')[0]}</span>
          </div>
        ))}
        {assignments.length === 0 ? (
          <p className="flex items-center gap-1 pt-1 text-[11px] text-[#F0EFEC]/22">
            <UserRound className="size-3" />
            Solte aqui
          </p>
        ) : null}
      </div>
    </div>
  )
}
