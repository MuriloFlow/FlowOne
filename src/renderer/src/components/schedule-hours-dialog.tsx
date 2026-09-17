import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatClock, parseClock, weekdayName, type ScheduleBand, type ScheduleSlot, type ScheduleSlotWrite, type ScheduleWeekday } from '../../../shared/schedules'
import { SCHEDULE_BANDS, SCHEDULE_WEEKDAYS, bandLabel } from '../../../shared/schedules'

type HoursDialogProps = {
  open: boolean
  storeId: string
  slots: ScheduleSlot[]
  saving: boolean
  onClose: () => void
  onSave: (slots: ScheduleSlotWrite[]) => Promise<void>
  onReset: () => Promise<void>
}

function clockInput(minutes: number): string {
  return formatClock(minutes)
}

export function ScheduleHoursDialog({ open, slots, saving, onClose, onSave, onReset }: HoursDialogProps) {
  const [weekday, setWeekday] = useState<ScheduleWeekday>(1)
  const [draft, setDraft] = useState<ScheduleSlotWrite[]>([])

  useEffect(() => {
    if (!open) return
    setDraft(slots.map((slot) => ({ ...slot })))
    setWeekday(1)
  }, [open, slots])

  const all = draft
  const current = useMemo(() => {
    return all.filter((slot) => slot.weekday === weekday).sort((left, right) => left.sortOrder - right.sortOrder)
  }, [all, weekday])

  function mutate(next: ScheduleSlotWrite[]): void {
    setDraft(next)
  }

  function update(index: number, patch: Partial<ScheduleSlotWrite>): void {
    const list = all.map((slot) => ({ ...slot }))
    const focused = list.filter((slot) => slot.weekday === weekday)
    const target = focused[index]
    if (!target) return
    Object.assign(target, patch)
    mutate(list)
  }

  function addSlot(): void {
    const list = [...all]
    const same = list.filter((slot) => slot.weekday === weekday)
    list.push({
      weekday,
      band: 'ABERTURA',
      code: `ABT${same.length + 1}`,
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
      title="Horários da escala"
      description="Segunda a domingo. Sexta e sábado já vêm com abertura e fechamento em dois turnos — ajuste o que a loja precisa."
      onClose={onClose}
    >
      <div className="px-5 pb-5">
        <div className="mb-4 flex flex-wrap gap-1">
          {SCHEDULE_WEEKDAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setWeekday(day)}
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

        <div className="space-y-2">
          {current.map((slot, index) => (
            <div key={`${slot.id ?? slot.code}-${index}`} className="grid grid-cols-[132px_88px_1fr_88px_88px_32px] items-center gap-2">
              <select
                value={slot.band}
                onChange={(event) =>
                  update(index, {
                    band: event.target.value as ScheduleBand,
                    label: bandLabel(event.target.value as ScheduleBand)
                  })
                }
                className="h-8 rounded-[8px] border border-white/[0.08] bg-transparent px-2 text-[12px] text-[#F0EFEC]/80"
              >
                {SCHEDULE_BANDS.map((band) => (
                  <option key={band} value={band}>
                    {bandLabel(band)}
                  </option>
                ))}
              </select>
              <Input
                value={slot.code}
                onChange={(event) => update(index, { code: event.target.value.toUpperCase() })}
                className="h-8 text-[12px]"
              />
              <Input
                value={slot.label}
                onChange={(event) => update(index, { label: event.target.value })}
                className="h-8 text-[12px]"
              />
              <Input
                value={clockInput(slot.startMinutes)}
                onChange={(event) => update(index, { startMinutes: parseClock(event.target.value) })}
                className="h-8 text-[12px]"
              />
              <Input
                value={clockInput(slot.endMinutes)}
                onChange={(event) => update(index, { endMinutes: parseClock(event.target.value) })}
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
