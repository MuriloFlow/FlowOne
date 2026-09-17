import { useEffect, useMemo, useState } from 'react'
import { Clock3, GripVertical, ImageDown, MapPin, UserRound } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { ScheduleHoursDialog } from '@/components/schedule-hours-dialog'
import { WeekSwitcher } from '@/components/week-switcher'
import { Input } from '@/components/ui/input'
import { refreshAuthUser } from '@/lib/auth'
import { currentDateKey, formatDateKey, mondayOf } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import { exportScheduleImage } from '@/lib/schedule-export'
import { cn } from '@/lib/utils'
import {
  SCHEDULE_TEAMS,
  bandLabel,
  formatClock,
  overlappingAssignmentIds,
  resolveSchedulePersonTeam,
  scheduleExportLabel,
  scheduleSlotsForTeam,
  weekdayName,
  type ScheduleAssignment,
  type ScheduleBoard,
  type SchedulePerson,
  type ScheduleTeam
} from '../../../shared/schedules'
import { attendanceKindLabel, attendanceKindTone, type AttendanceKind } from '../../../shared/attendance'

type SchedulesPageProps = {
  storeId?: string | null
}

type DragPayload =
  | { kind: 'person'; id: string }
  | { kind: 'shift'; assignmentId: string; collaboratorId: string }

const DRAG_MIME = 'application/x-flow-schedule'

export function SchedulesPage({ storeId = null }: SchedulesPageProps) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(currentDateKey()))
  const [team, setTeam] = useState<ScheduleTeam>('OPERACAO')
  const [board, setBoard] = useState<ScheduleBoard | null>(null)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hoursOpen, setHoursOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportDateKey, setExportDateKey] = useState<string | null>(null)
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
        if (payload.weekStart !== weekStart) setWeekStart(payload.weekStart)
        setError(null)
        if (payload.actorOperator?.included) void refreshAuthUser()
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

  const classifiedPeople = useMemo(
    () =>
      (board?.people ?? [])
        .map((person) => ({
          ...person,
          team: resolveSchedulePersonTeam(person)
        }))
        .filter((person): person is SchedulePerson => Boolean(person.team)),
    [board]
  )

  const teamPeople = useMemo(() => {
    const term = query.trim().toLowerCase()
    return classifiedPeople
      .filter((person) => {
        if (person.team !== team) return false
        if (!term) return true
        return `${person.name} ${person.cardplusRole} ${person.roleLabel}`.toLowerCase().includes(term)
      })
      .sort((left, right) => Number(Boolean(right.isSelf)) - Number(Boolean(left.isSelf)))
  }, [classifiedPeople, query, team])

  const teamIds = useMemo(
    () => new Set(classifiedPeople.filter((person) => person.team === team).map((person) => person.id)),
    [classifiedPeople, team]
  )
  const hourSlots = useMemo(
    () => scheduleSlotsForTeam(board?.days.flatMap((day) => day.slots) ?? [], team),
    [board, team]
  )
  const teamCounts = useMemo(() => {
    const counts = Object.fromEntries(SCHEDULE_TEAMS.map((item) => [item.id, 0])) as Record<ScheduleTeam, number>
    for (const person of classifiedPeople) counts[person.team] += 1
    return counts
  }, [classifiedPeople])

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

      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] text-[#F0EFEC]/88">Escalas</h1>
          <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
            {board?.storeName ?? 'Unidade'} · {scheduleExportLabel(team)}. Arraste a equipe; a próxima semana copia sozinha.
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
            onClick={() => {
              setExportDateKey(null)
              setExportOpen(true)
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[#F0EFEC] px-2.5 text-[12px] text-[#111111]"
          >
            <ImageDown className="size-3.5" />
            Exportar planilha
          </button>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap gap-1">
        {SCHEDULE_TEAMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTeam(item.id)
              setQuery('')
            }}
            className={cn(
              'h-8 rounded-[8px] px-3 text-[12px]',
              team === item.id
                ? 'bg-white/[0.1] text-[#F0EFEC]/85'
                : 'text-[#F0EFEC]/40 hover:bg-white/[0.04]'
            )}
          >
            {item.label}
            {teamCounts[item.id] ? <span className="ml-1.5 text-[#F0EFEC]/32">{teamCounts[item.id]}</span> : null}
          </button>
        ))}
      </div>

      {board?.actorOperator ? (
        <p className="mb-3 text-[12px] text-[#F0EFEC]/36">
          {board.actorOperator.included
            ? `${board.actorOperator.name} entra no Time operacional desta loja, inclusive no fim de semana. TI da rede vira Funcionario Operacional aqui sem perder o acesso do painel.`
            : `Logado como ${board.actorOperator.email || board.actorOperator.name}. Não achei um colaborador correspondente na rede para entrar na operação.`}
        </p>
      ) : null}

      {board?.rolledFromWeek ? (
        <p className="mb-3 text-[12px] text-[#F0EFEC]/36">
          Semana montada automaticamente a partir de {formatDateKey(board.rolledFromWeek)}. Arraste para ajustar.
        </p>
      ) : null}

      {board ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div
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
              'shrink-0 rounded-[16px] border px-3 py-2.5',
              overPool ? 'border-[#8B8DFF]/40 bg-[#8B8DFF]/6' : 'border-white/[0.045] bg-[#1A1A1A]'
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[12px] text-[#F0EFEC]/40">Equipe desta escala</p>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar"
                className="h-8 w-[180px] rounded-[8px] border-white/[0.06] bg-transparent text-[13px]"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {teamPeople.map((person) => (
                <PersonChip key={person.id} person={person} disabled={!board.canEdit} />
              ))}
              {teamPeople.length === 0 ? (
                <p className="py-2 text-[12px] text-[#F0EFEC]/32">Ninguém neste time.</p>
              ) : null}
            </div>
            <p className="mt-2 text-[11px] text-[#F0EFEC]/28">
              Solte um nome aqui para tirar da escala. A grade embaixo fica inteira, sem esmagar os dias.
            </p>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-auto rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
            <div className="grid min-w-[980px] grid-cols-7">
              {board.days.map((day) => {
                const daySlots = scheduleSlotsForTeam(day.slots, team)
                const overlaps = overlappingAssignmentIds(
                  daySlots.map((slot) => ({
                    ...slot,
                    assignments: slot.assignments.filter((item) => teamIds.has(item.collaboratorId))
                  }))
                )
                return (
                <section key={day.dateKey} className="border-l border-white/[0.04] first:border-l-0">
                  <header className="border-b border-white/[0.045] px-3 py-3">
                    <p className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">{day.shortLabel}</p>
                    <p className="mt-0.5 text-[14px] text-[#F0EFEC]/78">{formatDateKey(day.dateKey).slice(0, 5)}</p>
                  </header>
                  <div className="space-y-2 p-2">
                    {daySlots.map((slot) => (
                      <DropSlot
                        key={slot.id}
                        title={slot.label}
                        hint={`${formatClock(slot.startMinutes)} – ${formatClock(slot.endMinutes)}`}
                        band={bandLabel(slot.band)}
                        assignments={slot.assignments.filter((item) => teamIds.has(item.collaboratorId))}
                        overlapIds={overlaps}
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
                    {daySlots.length === 0 ? (
                      <p className="px-2 py-6 text-center text-[12px] text-[#F0EFEC]/28">Sem horário neste dia.</p>
                    ) : null}
                  </div>
                </section>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {board ? (
        <ScheduleHoursDialog
          open={hoursOpen}
          storeId={board.storeId}
          team={team}
          teamLabel={scheduleExportLabel(team)}
          slots={hourSlots}
          saving={saving}
          onClose={() => setHoursOpen(false)}
          onSave={async (slots) => {
            setSaving(true)
            try {
              await operations().saveScheduleSlots(board.storeId, slots, team)
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
              await operations().resetScheduleSlots(board.storeId, team)
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

      <Dialog
        open={exportOpen}
        title="Exportar planilha"
        description="Imagem clara para imprimir. Semana inteira ou só um dia. Cada horário fica na própria linha."
        onClose={() => setExportOpen(false)}
      >
        <div className="space-y-4 px-5 pb-5">
          <div>
            <p className="mb-2 text-[12px] text-[#F0EFEC]/40">Período</p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setExportDateKey(null)}
                className={cn(
                  'h-8 rounded-[8px] px-2.5 text-[12px]',
                  exportDateKey == null
                    ? 'bg-white/[0.1] text-[#F0EFEC]/85'
                    : 'text-[#F0EFEC]/40 hover:bg-white/[0.04]'
                )}
              >
                Semana inteira
              </button>
              {(board?.days ?? []).map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => setExportDateKey(day.dateKey)}
                  className={cn(
                    'h-8 rounded-[8px] px-2.5 text-[12px]',
                    exportDateKey === day.dateKey
                      ? 'bg-white/[0.1] text-[#F0EFEC]/85'
                      : 'text-[#F0EFEC]/40 hover:bg-white/[0.04]'
                  )}
                >
                  {weekdayName(day.weekday)} {formatDateKey(day.dateKey).slice(0, 5)}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {SCHEDULE_TEAMS.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={!board}
                onClick={() => {
                  if (!board) return
                  void exportScheduleImage(board, item.id, { dateKey: exportDateKey })
                  setExportOpen(false)
                }}
                className="flex h-11 w-full items-center justify-between rounded-[10px] border border-white/[0.06] px-3 text-left hover:bg-white/[0.04]"
              >
                <span>
                  <span className="block text-[13px] text-[#F0EFEC]/78">Escala de {item.exportLabel}</span>
                  <span className="block text-[11px] text-[#F0EFEC]/32">
                    {exportDateKey
                      ? `Só ${weekdayName(board?.days.find((day) => day.dateKey === exportDateKey)?.weekday ?? 1)}`
                      : 'Semana inteira'}
                    {' · '}imagem clara para imprimir
                  </span>
                </span>
                <ImageDown className="size-3.5 text-[#F0EFEC]/28" />
              </button>
            ))}
          </div>
        </div>
      </Dialog>
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
        'flex min-w-[148px] items-center gap-2 rounded-[10px] border border-white/[0.05] bg-white/[0.03] px-2 py-1.5',
        disabled ? 'opacity-50' : 'cursor-grab active:cursor-grabbing hover:bg-white/[0.05]'
      )}
    >
      <GripVertical className="size-3 shrink-0 text-[#F0EFEC]/22" />
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[10px] text-[#F0EFEC]/50">
        {person.shortName.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-[#F0EFEC]/78">{person.shortName}</span>
        <span className="block truncate text-[10px] text-[#F0EFEC]/32">
          {person.isSelf ? 'Você' : person.cardplusRole.trim() || person.roleLabel}
        </span>
      </span>
    </div>
  )
}

function DropSlot({
  title,
  hint,
  band,
  assignments,
  overlapIds,
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
  overlapIds: Set<string>
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
            className={cn(
              'flex items-center justify-between rounded-[8px] px-2 py-1',
              overlapIds.has(item.id) ? 'bg-amber-500/16' : 'bg-[#F0EFEC]/8'
            )}
          >
            <span className="truncate text-[12px] text-[#F0EFEC]/82">{item.shortName}</span>
            <span className="flex shrink-0 items-center gap-1.5 pl-2">
              <span className="text-[10px] text-[#F0EFEC]/32">
                {overlapIds.has(item.id) ? 'Divergência' : (item.note ?? hint.split(' – ')[0])}
              </span>
              {item.absenceKind ? <AbsenceBadge kind={item.absenceKind} /> : null}
            </span>
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

function AbsenceBadge({ kind }: { kind: AttendanceKind }) {
  const label = attendanceKindLabel(kind)
  const tone = attendanceKindTone(kind)
  return (
    <span className="group/absence relative inline-flex shrink-0" title={label}>
      <span
        aria-label={label}
        className={cn(
          'flex size-4 items-center justify-center rounded-full text-[10px] font-semibold leading-none text-white',
          tone === 'blue'
            ? 'bg-[#3B82F6] shadow-[0_0_0_1px_rgba(59,130,246,0.28)]'
            : tone === 'yellow'
              ? 'bg-[#EAB308] shadow-[0_0_0_1px_rgba(234,179,8,0.28)]'
              : 'bg-[#EF4444] shadow-[0_0_0_1px_rgba(239,68,68,0.28)]'
        )}
      >
        !
      </span>
      <span className="pointer-events-none absolute top-1/2 left-full z-20 ml-1.5 -translate-y-1/2 rounded-[6px] bg-[#111111] px-1.5 py-0.5 text-[10px] whitespace-nowrap text-[#F0EFEC]/82 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.45)] ring-1 ring-white/10 transition-opacity duration-150 group-hover/absence:opacity-100">
        {label}
      </span>
    </span>
  )
}
