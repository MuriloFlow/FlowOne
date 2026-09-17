import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  formatClock,
  parseClockOrNull,
  scheduleSlotBaseCode,
  weekdayName,
  withTeamSlotCode,
  type ScheduleBand,
  type ScheduleSlot,
  type ScheduleSlotWrite,
  type ScheduleTeam,
  type ScheduleWeekday
} from '../../../shared/schedules'
import { SCHEDULE_BANDS, SCHEDULE_WEEKDAYS, bandLabel } from '../../../shared/schedules'

type HoursDialogProps = {
  open: boolean
  storeId: string
  team: ScheduleTeam
  teamLabel: string
  slots: ScheduleSlot[]
  saving: boolean
  onClose: () => void
  onSave: (slots: ScheduleSlotWrite[]) => Promise<void>
  onReset: () => Promise<void>
}

function ClockField({
  minutes,
  onCommit,
  className
}: {
  minutes: number
  onCommit: (minutes: number) => void
  className?: string
}) {
  const [text, setText] = useState(() => formatClock(minutes))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) setText(formatClock(minutes))
  }, [minutes])

  function commit(raw: string): void {
    const next = parseClockOrNull(raw)
    if (next == null) {
      setText(formatClock(minutes))
      return
    }
    onCommit(next)
    setText(formatClock(next))
  }

  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      maxLength={5}
      placeholder="8:30"
      value={text}
      onFocus={(event) => {
        focusedRef.current = true
        event.target.select()
      }}
      onChange={(event) => setText(event.target.value.replace(/[^\d:hH.,]/g, '').slice(0, 5))}
      onBlur={() => {
        focusedRef.current = false
        commit(text)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className={className}
    />
  )
}

export function ScheduleHoursDialog({ open, team, teamLabel, slots, saving, onClose, onSave, onReset }: HoursDialogProps) {
  const [weekday, setWeekday] = useState<ScheduleWeekday>(1)
  const [draft, setDraft] = useState<ScheduleSlotWrite[]>([])
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(slots.map((slot) => ({ ...slot })))
      setWeekday(1)
    }
    wasOpen.current = open
  }, [open, slots])

  const all = draft
  const current = useMemo(() => {
    return all.filter((slot) => slot.weekday === weekday).sort((left, right) => left.sortOrder - right.sortOrder)
  }, [all, weekday])

  function mutate(next: ScheduleSlotWrite[]): void {
    setDraft(next)
  }

  function update(index: number, patch: Partial<ScheduleSlotWrite>): void {
    const focused = current[index]
    if (!focused) return
    mutate(
      all.map((slot) =>
        slot === focused ||
        (slot.weekday === focused.weekday &&
          slot.code === focused.code &&
          slot.sortOrder === focused.sortOrder &&
          slot.id === focused.id)
          ? { ...slot, ...patch }
          : slot
      )
    )
  }

  function addSlot(): void {
    const list = [...all]
    const same = list.filter((slot) => slot.weekday === weekday)
    const used = new Set(same.map((slot) => slot.code))
    let n = same.length + 1
    let code = withTeamSlotCode(team, `H${n}`)
    while (used.has(code)) {
      n += 1
      code = withTeamSlotCode(team, `H${n}`)
    }
    list.push({
      weekday,
      band: 'ABERTURA',
      code,
      label: 'Abertura',
      startMinutes: 500,
      endMinutes: 960,
      sortOrder: same.length + 1
    })
    mutate(list)
  }

  function removeSlot(index: number): void {
    const focused = current[index]
    if (!focused) return
    mutate(all.filter((slot) => !(slot.weekday === weekday && slot.code === focused.code && slot.sortOrder === focused.sortOrder)))
  }

  return (
    <Dialog
      open={open}
      wide
      title={`Horários · ${teamLabel}`}
      description="Só este cargo. Mudar aqui não altera os horários das outras escalas."
      onClose={onClose}
    >
      <div className="px-5 pb-5">
        <div className="mb-4 flex flex-wrap gap-1">
          {SCHEDULE_WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setWeekday(day)
              }}
              className={
                day === weekday
                  ? 'h-8 rounded-[8px] bg-white/[0.1] px-2.5 text-[12px] text-[#F0EFEC]/85'
                  : 'h-8 rounded-[8px] px-2.5 text-[12px] text-[#F0EFEC]/40 hover:bg-white/[0.04]'
              }
            >
              {weekdayName(day)}
            </button>
          ))}
        </div>

        <div className="space-y-2 overflow-x-auto">
          {current.map((slot, index) => (
            <div key={`${slot.id ?? slot.code}-${index}`} className="grid min-w-[620px] grid-cols-[minmax(148px,1.2fr)_80px_minmax(100px,1fr)_80px_80px_28px] items-center gap-2">
              <Select
                value={slot.band}
                options={SCHEDULE_BANDS.map((band) => ({ value: band, label: bandLabel(band) }))}
                className="h-8 rounded-[8px] px-2 text-[12px]"
                onChange={(value) =>
                  update(index, {
                    band: value as ScheduleBand,
                    label: bandLabel(value as ScheduleBand)
                  })
                }
              />
              <Input
                value={scheduleSlotBaseCode(slot.code)}
                onChange={(event) => update(index, { code: withTeamSlotCode(team, event.target.value) })}
                className="h-8 text-[12px]"
              />
              <Input
                value={slot.label}
                onChange={(event) => update(index, { label: event.target.value })}
                className="h-8 text-[12px]"
              />
              <ClockField
                minutes={slot.startMinutes}
                onCommit={(startMinutes) => update(index, { startMinutes })}
                className="h-8 text-[12px]"
              />
              <ClockField
                minutes={slot.endMinutes}
                onCommit={(endMinutes) => update(index, { endMinutes })}
                className="h-8 text-[12px]"
              />
              <button
                type="button"
                onClick={() => removeSlot(index)}
                className="text-[12px] text-[#F0EFEC]/30 hover:text-red-300/80"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button type="button" onClick={addSlot} className="mt-3 text-[12px] text-[#F0EFEC]/45 hover:text-[#F0EFEC]/75">
          Adicionar horário neste dia
        </button>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            disabled={saving}
            onClick={() => void onReset()}
            className="text-[12px] text-[#F0EFEC]/35 hover:text-[#F0EFEC]/65"
          >
            Restaurar padrão
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-8 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/45">
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void onSave(all)}
              className="h-8 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
            >
              Salvar horários
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
