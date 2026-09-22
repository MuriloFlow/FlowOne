import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock3, GripVertical, ImageDown, MapPin, Plus, Share2, UserRound, X } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { ScheduleHoursDialog } from '@/components/schedule-hours-dialog'
import { WeekSwitcher } from '@/components/week-switcher'
import { Input } from '@/components/ui/input'
import { refreshAuthUser } from '@/lib/auth'
import { currentDateKey, formatDateKey, mondayOf } from '@/lib/format'
import { operationError, operations } from '@/lib/operations'
import { exportScheduleImage, renderScheduleImage } from '@/lib/schedule-export'
import { ExportSuccessSheet } from '@/components/export-success-sheet'
import { isMobileShell } from '@/lib/is-mobile-shell'
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
  const [exporting, setExporting] = useState(false)
  const [shareReady, setShareReady] = useState<{
    token: string
    blob: Blob
    fileName: string
    title: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [overSlot, setOverSlot] = useState<string | null>(null)
  const [overPool, setOverPool] = useState(false)
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [pickerSlot, setPickerSlot] = useState<{ id: string; title: string; assignedIds: string[] } | null>(null)
  const mobile = isMobileShell()

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

  useEffect(() => {
    if (!board) return
    const today = currentDateKey()
    setDayKey((current) => {
      if (current && board.days.some((day) => day.dateKey === current)) return current
      if (board.days.some((day) => day.dateKey === today)) return today
      return board.days[0]?.dateKey ?? null
    })
  }, [board])

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

  const teamRoster = useMemo(
    () =>
      classifiedPeople
        .filter((person) => person.team === team)
        .sort((left, right) => Number(Boolean(right.isSelf)) - Number(Boolean(left.isSelf))),
    [classifiedPeople, team]
  )

  const teamPeople = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return teamRoster
    return teamRoster.filter((person) =>
      `${person.name} ${person.cardplusRole} ${person.roleLabel}`.toLowerCase().includes(term)
    )
  }, [query, teamRoster])

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

      <header className={mobile ? 'mb-4' : 'mb-4 flex flex-wrap items-end justify-between gap-3'}>
        <div className={mobile ? 'mb-3' : undefined}>
          <h1 className="text-[22px] text-[#F0EFEC]/88">Escalas</h1>
          <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
            {mobile
              ? board?.storeName ?? 'Unidade'
              : `${board?.storeName ?? 'Unidade'} · ${scheduleExportLabel(team)}. Arraste a equipe; a próxima semana copia sozinha.`}
          </p>
        </div>
        {mobile ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5">
            <WeekSwitcher compact value={weekStart} onChange={setWeekStart} />
            <button
              type="button"
              onClick={() => setHoursOpen(true)}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-[8px] border border-white/[0.07] px-2.5 text-[12px] text-[#F0EFEC]/70"
            >
              <Clock3 className="size-3.5 shrink-0" />
              Horários
            </button>
            <button
              type="button"
              disabled={!board}
              onClick={() => {
                setExportDateKey(null)
                setExportOpen(true)
              }}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-[8px] bg-[#F0EFEC] px-2.5 text-[12px] text-[#111111] disabled:opacity-40"
            >
              <Share2 className="size-3.5 shrink-0" />
              Compartilhar
            </button>
          </div>
        ) : (
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
              Exportar
            </button>
          </div>
        )}
      </header>

      <div className={mobile ? 'mb-3 flex gap-1 overflow-x-auto pb-0.5' : 'mb-3 flex flex-wrap gap-1'}>
        {SCHEDULE_TEAMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTeam(item.id)
              setQuery('')
            }}
            className={cn(
              'h-8 shrink-0 rounded-[8px] px-3 text-[12px]',
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

      {board?.rolledFromWeek && !mobile ? (
        <p className="mb-3 text-[12px] text-[#F0EFEC]/36">
          Semana montada automaticamente a partir de {formatDateKey(board.rolledFromWeek)}. Arraste para ajustar.
        </p>
      ) : null}

      {board ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {mobile ? null : (
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
              <p className="shrink-0 text-[12px] text-[#F0EFEC]/40">Equipe desta escala</p>
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
          )}

          <div
            className={cn(
              'min-h-0 min-w-0 flex-1 overflow-auto rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]',
              mobile && 'min-h-[360px]'
            )}
          >
            {mobile ? (
              <div className="flex gap-1 overflow-x-auto border-b border-white/[0.045] px-2 py-2">
                {board.days.map((day) => {
                  const active = (dayKey ?? board.days[0]?.dateKey) === day.dateKey
                  const today = day.dateKey === currentDateKey()
                  return (
                    <button
                      key={day.dateKey}
                      type="button"
                      onClick={() => setDayKey(day.dateKey)}
                      className={cn(
                        'flex min-w-[44px] flex-1 flex-col items-center rounded-[10px] px-1 py-1.5',
                        active ? 'bg-white/[0.1] text-[#F0EFEC]/85' : 'text-[#F0EFEC]/40'
                      )}
                    >
                      <span className="text-[10px] tracking-wide uppercase">{day.shortLabel}</span>
                      <span className="mt-0.5 text-[13px]">{formatDateKey(day.dateKey).slice(0, 5)}</span>
                      {today ? <span className="mt-0.5 size-1 rounded-full bg-[#F0EFEC]/50" /> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
            <div className={mobile ? 'grid grid-cols-1' : 'grid min-w-[980px] grid-cols-7'}>
              {(mobile
                ? board.days.filter((day) => day.dateKey === (dayKey ?? board.days[0]?.dateKey))
                : board.days
              ).map((day) => {
                const daySlots = scheduleSlotsForTeam(day.slots, team)
                const overlaps = overlappingAssignmentIds(
                  daySlots.map((slot) => ({
                    ...slot,
                    assignments: slot.assignments.filter((item) => teamIds.has(item.collaboratorId))
                  }))
                )
                return (
                <section key={day.dateKey} className="border-l border-white/[0.04] first:border-l-0">
                  {mobile ? null : (
                    <header className="border-b border-white/[0.045] px-3 py-3">
                      <p className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">{day.shortLabel}</p>
                      <p className="mt-0.5 text-[14px] text-[#F0EFEC]/78">{formatDateKey(day.dateKey).slice(0, 5)}</p>
                    </header>
                  )}
                  <div className={mobile ? 'space-y-2 p-3' : 'space-y-2 p-2'}>
                    {daySlots.map((slot) => {
                      const slotAssignments = slot.assignments.filter((item) => teamIds.has(item.collaboratorId))
                      return (
                      <DropSlot
                        key={slot.id}
                        title={slot.label}
                        hint={`${formatClock(slot.startMinutes)} – ${formatClock(slot.endMinutes)}`}
                        band={bandLabel(slot.band)}
                        assignments={slotAssignments}
                        overlapIds={overlaps}
                        active={overSlot === slot.id}
                        disabled={!board.canEdit}
                        compact={mobile}
                        onAdd={
                          mobile && board.canEdit
                            ? () =>
                                setPickerSlot({
                                  id: slot.id,
                                  title: slot.label,
                                  assignedIds: slotAssignments.map((item) => item.collaboratorId)
                                })
                            : undefined
                        }
                        onRemove={
                          mobile && board.canEdit
                            ? (assignment) =>
                                void dropOnPool({
                                  kind: 'shift',
                                  assignmentId: assignment.id,
                                  collaboratorId: assignment.collaboratorId
                                })
                            : undefined
                        }
                        onDragOver={() => setOverSlot(slot.id)}
                        onDragLeave={() => setOverSlot((current) => (current === slot.id ? null : current))}
                        onDrop={(payload) => {
                          setOverSlot(null)
                          void dropOnSlot(slot.id, payload)
                        }}
                      />
                      )
                    })}
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

      {mobile && pickerSlot && board ? (
        <PersonPickerSheet
          slotTitle={pickerSlot.title}
          people={teamRoster}
          assignedIds={new Set(pickerSlot.assignedIds)}
          onClose={() => setPickerSlot(null)}
          onPick={(person) => {
            void dropOnSlot(pickerSlot.id, { kind: 'person', id: person.id })
            setPickerSlot(null)
          }}
        />
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
        title={mobile ? 'Compartilhar escala' : 'Exportar'}
        description={
          mobile
            ? 'Abre o compartilhamento do celular com a imagem pronta — WhatsApp, Telegram etc. Semana inteira ou só um dia.'
            : 'Imagem clara para imprimir. Semana inteira ou só um dia. Cada horário fica na própria linha.'
        }
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
                disabled={!board || exporting}
                onClick={() => {
                  if (!board || exporting) return
                  setExporting(true)
                  setError(null)
                  void (async () => {
                    if (mobile) {
                      // Mobile: gera a imagem, mostra a tela de sucesso e abre o
                      // compartilhamento nativo do celular em seguida.
                      const prepared = await renderScheduleImage(board, item.id, { dateKey: exportDateKey })
                      setExportOpen(false)
                      setShareReady({
                        token: `${item.id}-${exportDateKey ?? 'semana'}-${Date.now()}`,
                        blob: prepared.blob,
                        fileName: prepared.filename,
                        title: prepared.title
                      })
                      return
                    }
                    await exportScheduleImage(board, item.id, { dateKey: exportDateKey })
                    setExportOpen(false)
                  })()
                    .catch((exportError) => {
                      const message = operationError(exportError)
                      if (/share canceled|sharing canceled|cancelad/i.test(message)) {
                        setError(null)
                        return
                      }
                      setError(message)
                    })
                    .finally(() => setExporting(false))
                }}
                className="flex h-11 w-full items-center justify-between rounded-[10px] border border-white/[0.06] px-3 text-left hover:bg-white/[0.04] disabled:opacity-45"
              >
                <span>
                  <span className="block text-[13px] text-[#F0EFEC]/78">
                    {exporting ? 'Gerando imagem da escala…' : `Escala de ${item.exportLabel}`}
                  </span>
                  <span className="block text-[11px] text-[#F0EFEC]/32">
                    {exportDateKey
                      ? `Só ${weekdayName(board?.days.find((day) => day.dateKey === exportDateKey)?.weekday ?? 1)}`
                      : 'Semana inteira'}
                    {mobile ? ' · compartilhar direto no WhatsApp' : ' · imagem clara para imprimir'}
                  </span>
                </span>
                {mobile ? (
                  <Share2 className="size-3.5 text-[#F0EFEC]/28" />
                ) : (
                  <ImageDown className="size-3.5 text-[#F0EFEC]/28" />
                )}
              </button>
            ))}
          </div>
        </div>
      </Dialog>

      <ExportSuccessSheet
        open={Boolean(shareReady)}
        kind="image"
        title="Escala gerada!"
        subtitle="A imagem ficou pronta. Escolha para quem enviar — WhatsApp, Telegram, e-mail…"
        fileName={shareReady?.fileName ?? ''}
        shareTitle={shareReady?.title ?? 'Escala'}
        autoShare
        autoShareKey={shareReady?.token ?? ''}
        getBlob={() => shareReady?.blob ?? null}
        onClose={() => setShareReady(null)}
      />
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

function PersonChip({
  person,
  disabled,
  compact = false
}: {
  person: SchedulePerson
  disabled: boolean
  compact?: boolean
}) {
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
        compact ? 'min-w-[136px] flex-1' : 'min-w-[148px]',
        disabled ? 'opacity-50' : 'cursor-grab active:cursor-grabbing hover:bg-white/[0.05]'
      )}
    >
      {compact ? null : <GripVertical className="size-3 shrink-0 text-[#F0EFEC]/22" />}
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
  compact = false,
  onAdd,
  onRemove,
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
  compact?: boolean
  onAdd?: () => void
  onRemove?: (assignment: ScheduleAssignment) => void
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
        'rounded-[12px] border px-2 py-2 transition-colors',
        compact ? 'min-h-[72px]' : 'min-h-[92px]',
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
            draggable={!disabled && !onRemove}
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
              'flex items-center justify-between rounded-[8px] px-2 py-1.5',
              overlapIds.has(item.id) ? 'bg-amber-500/16' : 'bg-[#F0EFEC]/8'
            )}
          >
            <span className="truncate text-[12px] text-[#F0EFEC]/82">{item.shortName}</span>
            <span className="flex shrink-0 items-center gap-1.5 pl-2">
              <span className="text-[10px] text-[#F0EFEC]/32">
                {overlapIds.has(item.id) ? 'Divergência' : (item.note ?? hint.split(' – ')[0])}
              </span>
              {item.absenceKind ? <AbsenceDot kind={item.absenceKind} /> : null}
              {onRemove ? (
                <button
                  type="button"
                  aria-label={`Remover ${item.shortName}`}
                  onClick={() => onRemove(item)}
                  className="flex size-6 items-center justify-center rounded-[6px] text-[#F0EFEC]/30 hover:bg-white/[0.06] hover:text-[#F0EFEC]/70"
                >
                  <X className="size-3.5" strokeWidth={1.8} />
                </button>
              ) : null}
            </span>
          </div>
        ))}
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-white/[0.08] text-[12px] text-[#F0EFEC]/45"
          >
            <Plus className="size-3.5" strokeWidth={1.8} />
            Adicionar
          </button>
        ) : assignments.length === 0 ? (
          <p className="flex items-center gap-1 pt-1 text-[11px] text-[#F0EFEC]/22">
            <UserRound className="size-3" />
            Solte aqui
          </p>
        ) : null}
      </div>
    </div>
  )
}

function PersonPickerSheet({
  slotTitle,
  people,
  assignedIds,
  onClose,
  onPick
}: {
  slotTitle: string
  people: SchedulePerson[]
  assignedIds: Set<string>
  onClose: () => void
  onPick: (person: SchedulePerson) => void
}) {
  const [term, setTerm] = useState('')
  const filtered = people.filter((person) => {
    if (assignedIds.has(person.id)) return false
    const needle = term.trim().toLowerCase()
    if (!needle) return true
    return `${person.name} ${person.cardplusRole} ${person.roleLabel}`.toLowerCase().includes(needle)
  })

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[380]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button type="button" aria-label="Fechar equipe" className="absolute inset-0 bg-black/55" onClick={onClose} />
        <motion.div
          initial={{ y: 48 }}
          animate={{ y: 0 }}
          exit={{ y: 48 }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="absolute inset-x-0 bottom-0 flex max-h-[78vh] flex-col rounded-t-[20px] bg-[#151515] px-3 pt-3 pb-[var(--flow-safe-bottom)]"
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/12" />
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="min-w-0">
              <p className="text-[14px] text-[#F0EFEC]/80">Adicionar</p>
              <p className="mt-0.5 truncate text-[12px] text-[#F0EFEC]/38">{slotTitle}</p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="flex size-9 items-center justify-center text-[#F0EFEC]/50"
            >
              <X className="size-4" />
            </button>
          </div>
          <label className="mb-2 flex h-10 items-center gap-2 rounded-[10px] bg-[#111111] px-3">
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Buscar funcionário"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[#F0EFEC]/80 outline-none placeholder:text-[#F0EFEC]/28"
            />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {filtered.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => onPick(person)}
                className="flex min-h-14 w-full items-center gap-3 border-t border-white/[0.04] px-1 py-2.5 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[12px] text-[#F0EFEC]/55">
                  {person.shortName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-[#F0EFEC]/85">{person.name}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[#F0EFEC]/38">
                    {person.isSelf ? 'Você' : person.cardplusRole.trim() || person.roleLabel}
                  </span>
                </span>
              </button>
            ))}
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-[13px] text-[#F0EFEC]/38">
                {people.length === 0
                  ? 'Ninguém neste time.'
                  : assignedIds.size === people.length
                    ? 'Todo mundo já está neste horário.'
                    : 'Ninguém com esse nome.'}
              </p>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

function AbsenceDot({ kind }: { kind: AttendanceKind }) {
  const label = attendanceKindLabel(kind)
  const tone = attendanceKindTone(kind)
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        'inline-block size-2 shrink-0 rounded-full',
        tone === 'blue' ? 'bg-[#3B82F6]' : tone === 'yellow' ? 'bg-[#EAB308]' : 'bg-[#EF4444]'
      )}
    />
  )
}
