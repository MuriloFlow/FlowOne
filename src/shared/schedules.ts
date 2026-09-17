export const SCHEDULE_BANDS = ['ABERTURA', 'INTERMEDIARIO', 'FECHAMENTO'] as const
export type ScheduleBand = (typeof SCHEDULE_BANDS)[number]

export const SCHEDULE_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
export type ScheduleWeekday = (typeof SCHEDULE_WEEKDAYS)[number]

export type ScheduleSlot = {
  id: string
  storeId: string
  weekday: ScheduleWeekday
  band: ScheduleBand
  code: string
  label: string
  startMinutes: number
  endMinutes: number
  sortOrder: number
}

export type SchedulePerson = {
  id: string
  name: string
  shortName: string
  roleLabel: string
}

export type ScheduleAssignment = {
  id: string
  slotId: string
  weekday: ScheduleWeekday
  collaboratorId: string
  name: string
  shortName: string
  sortOrder: number
  note: string | null
}

export type ScheduleDay = {
  weekday: ScheduleWeekday
  dateKey: string
  label: string
  shortLabel: string
  slots: Array<ScheduleSlot & { assignments: ScheduleAssignment[] }>
}

export type ScheduleBoard = {
  storeId: string
  storeName: string
  weekStart: string
  rolledFromWeek: string | null
  canEdit: boolean
  days: ScheduleDay[]
  people: SchedulePerson[]
}

export type ScheduleSlotWrite = {
  id?: string
  weekday: ScheduleWeekday
  band: ScheduleBand
  code: string
  label: string
  startMinutes: number
  endMinutes: number
  sortOrder: number
}

export type ScheduleAssignmentWrite = {
  id?: string
  storeId: string
  weekStart: string
  slotId: string
  collaboratorId: string
  note?: string | null
}

export type DefaultScheduleSlot = Omit<ScheduleSlot, 'id' | 'storeId'>

function slot(
  weekday: ScheduleWeekday,
  band: ScheduleBand,
  code: string,
  label: string,
  start: string,
  end: string,
  sortOrder: number
): DefaultScheduleSlot {
  return {
    weekday,
    band,
    code,
    label,
    startMinutes: parseClock(start),
    endMinutes: parseClock(end),
    sortOrder
  }
}

export function parseClock(value: string): number {
  const trimmed = value.trim().toLowerCase().replace(/h/g, ':').replace(/\s/g, '')
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!match) return 0
  return Number(match[1]) * 60 + Number(match[2] ?? 0)
}

export function formatClock(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  return `${hours}:${String(mins).padStart(2, '0')}`
}

export function bandLabel(band: ScheduleBand): string {
  if (band === 'ABERTURA') return 'Abertura'
  if (band === 'INTERMEDIARIO') return 'Intermediário'
  return 'Fechamento'
}

const MON_THU: ScheduleWeekday[] = [1, 2, 3, 4]
const SUN: ScheduleWeekday[] = [7]

function weekdaySet(days: ScheduleWeekday[], make: (weekday: ScheduleWeekday) => DefaultScheduleSlot[]): DefaultScheduleSlot[] {
  return days.flatMap(make)
}

export const DEFAULT_SCHEDULE_SLOTS: DefaultScheduleSlot[] = [
  ...weekdaySet(MON_THU, (weekday) => [
    slot(weekday, 'ABERTURA', 'ABT', 'Abertura', '8:20', '16:00', 1),
    slot(weekday, 'INTERMEDIARIO', 'INTER', 'Intermediário', '10:10', '19:00', 2),
    slot(weekday, 'FECHAMENTO', 'FECH', 'Fechamento', '12:25', '21:00', 3)
  ]),
  slot(5, 'ABERTURA', 'ABT1', 'Abertura 1', '7:50', '16:20', 1),
  slot(5, 'ABERTURA', 'ABT2', 'Abertura 2', '8:30', '17:00', 2),
  slot(5, 'INTERMEDIARIO', 'INTER', 'Intermediário', '10:20', '19:00', 3),
  slot(5, 'FECHAMENTO', 'FECH1', 'Fechamento 1', '12:25', '21:00', 4),
  slot(5, 'FECHAMENTO', 'FECH2', 'Fechamento 2', '13:00', '21:30', 5),
  slot(6, 'ABERTURA', 'ABT1', 'Abertura 1', '7:50', '17:40', 1),
  slot(6, 'ABERTURA', 'ABT2', 'Abertura 2', '8:30', '18:20', 2),
  slot(6, 'INTERMEDIARIO', 'INTER', 'Intermediário', '10:20', '20:10', 3),
  slot(6, 'FECHAMENTO', 'FECH1', 'Fechamento 1', '11:10', '21:00', 4),
  slot(6, 'FECHAMENTO', 'FECH2', 'Fechamento 2', '11:40', '21:30', 5),
  ...weekdaySet(SUN, (weekday) => [
    slot(weekday, 'ABERTURA', 'ABT', 'Abertura', '8:20', '16:00', 1),
    slot(weekday, 'INTERMEDIARIO', 'INTER', 'Intermediário', '10:10', '19:00', 2),
    slot(weekday, 'FECHAMENTO', 'FECH', 'Fechamento', '12:25', '21:00', 3)
  ])
]

export function weekdayName(weekday: ScheduleWeekday): string {
  return ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'][weekday] ?? ''
}

export function weekdayShort(weekday: ScheduleWeekday): string {
  return ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'][weekday] ?? ''
}

export function shortPersonName(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean)[0] ?? name
}
