import { normalizeCardplusRoleKey, normalizePersonName } from './roles.ts'

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
  team: ScheduleTeam
}

export const SCHEDULE_TEAMS = [
  { id: 'OPERACAO', label: 'Operação', exportLabel: 'Operação' },
  { id: 'CAIXA', label: 'Caixa', exportLabel: 'Caixa' },
  { id: 'AUXILIAR', label: 'Auxiliar', exportLabel: 'Auxiliar' },
  { id: 'VENDEDOR', label: 'Vendedor', exportLabel: 'Vendas' },
  { id: 'ESTOQUE', label: 'Estoquista', exportLabel: 'Estoque' }
] as const

export type ScheduleTeam = (typeof SCHEDULE_TEAMS)[number]['id']

export type SchedulePerson = {
  id: string
  name: string
  shortName: string
  roleLabel: string
  flowRole: string | null
  cardplusRole: string
  team: ScheduleTeam
  isSelf?: boolean
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
  absenceKind?: import('./attendance.ts').AttendanceKind | null
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
  actorOperator: { name: string; email: string; included: boolean } | null
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
  team?: ScheduleTeam
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
    sortOrder,
    team: 'OPERACAO'
  }
}

export function parseClockOrNull(value: string): number | null {
  const trimmed = value.trim().toLowerCase().replace(/[h.,]/g, ':').replace(/\s/g, '')
  if (!trimmed) return null

  let hours: number
  let mins: number
  const withColon = trimmed.match(/^(\d{1,2}):(\d{0,2})$/)
  if (withColon) {
    hours = Number(withColon[1])
    mins = withColon[2] === '' ? 0 : Number(withColon[2].length === 1 ? `${withColon[2]}0` : withColon[2])
  } else if (/^\d{1,2}$/.test(trimmed)) {
    hours = Number(trimmed)
    mins = 0
  } else if (/^\d{3}$/.test(trimmed)) {
    hours = Number(trimmed.slice(0, 1))
    mins = Number(trimmed.slice(1))
  } else if (/^\d{4}$/.test(trimmed)) {
    hours = Number(trimmed.slice(0, 2))
    mins = Number(trimmed.slice(2))
  } else {
    return null
  }

  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null
  if (hours === 24 && mins === 0) return 24 * 60
  if (hours < 0 || hours > 23 || mins < 0 || mins > 59) return null
  return hours * 60 + mins
}

export function parseClock(value: string): number {
  return parseClockOrNull(value) ?? 0
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

export function scheduleTeamLabel(team: ScheduleTeam): string {
  return SCHEDULE_TEAMS.find((item) => item.id === team)?.label ?? team
}

export function scheduleExportLabel(team: ScheduleTeam): string {
  return SCHEDULE_TEAMS.find((item) => item.id === team)?.exportLabel ?? team
}

const TEAM_CODE_PREFIX: Record<ScheduleTeam, string | null> = {
  OPERACAO: null,
  CAIXA: 'CX',
  AUXILIAR: 'AX',
  VENDEDOR: 'VD',
  ESTOQUE: 'ES'
}

const HIDDEN_FLOW_ROLES = new Set(['GERENTE', 'GERENTE_GERAL', 'SUPERVISOR', 'DIRETOR'])
const HIDDEN_CARD_ROLES = new Set([
  'gerente',
  'gerente geral',
  'gerente regional',
  'ti',
  'ti admin',
  'ti dev',
  'supervisor',
  'diretor'
])

export function scheduleSlotBaseCode(code: string): string {
  return code.replace(/^(CX|AX|VD|ES)-/i, '').toUpperCase()
}

export function teamFromSlotCode(code: string): ScheduleTeam {
  const upper = code.trim().toUpperCase()
  if (upper.startsWith('CX-')) return 'CAIXA'
  if (upper.startsWith('AX-')) return 'AUXILIAR'
  if (upper.startsWith('VD-')) return 'VENDEDOR'
  if (upper.startsWith('ES-')) return 'ESTOQUE'
  return 'OPERACAO'
}

export function withTeamSlotCode(team: ScheduleTeam, code: string): string {
  const base = scheduleSlotBaseCode(code) || 'ABT'
  const prefix = TEAM_CODE_PREFIX[team]
  return prefix ? `${prefix}-${base}` : base
}

export function slotTeamOf(slot: { code: string; team?: ScheduleTeam | null }): ScheduleTeam {
  return slot.team ?? teamFromSlotCode(slot.code)
}

export function scheduleSlotsForTeam<T extends { code: string; team?: ScheduleTeam | null }>(
  slots: T[],
  team: ScheduleTeam
): T[] {
  const own = slots.filter((slot) => slotTeamOf(slot) === team)
  if (own.length > 0 || team === 'OPERACAO') return own
  return slots.filter((slot) => slotTeamOf(slot) === 'OPERACAO')
}

export function overlappingAssignmentIds(
  slots: Array<{
    id: string
    startMinutes: number
    endMinutes: number
    assignments: Array<{ id: string; collaboratorId: string }>
  }>
): Set<string> {
  const marked = new Set<string>()
  const items = slots.flatMap((slot) => slot.assignments.map((assignment) => ({ assignment, slot })))
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].assignment.collaboratorId !== items[j].assignment.collaboratorId) continue
      if (items[i].slot.id === items[j].slot.id) continue
      const overlaps =
        items[i].slot.startMinutes < items[j].slot.endMinutes &&
        items[j].slot.startMinutes < items[i].slot.endMinutes
      if (overlaps) {
        marked.add(items[i].assignment.id)
        marked.add(items[j].assignment.id)
      }
    }
  }
  return marked
}

function scheduleTeamFromStoreFunction(value: string): ScheduleTeam | null {
  if (!value) return null
  if (value === 'auxiliar' || value.includes('auxiliar')) return 'AUXILIAR'
  if (value.includes('estoq')) return 'ESTOQUE'
  if (value === 'caixa' || value === 'lider de caixa' || value.includes('caixa')) return 'CAIXA'
  if (value === 'vm' || value === 'vendedor' || value.includes('vendedor') || value.includes('vendas')) {
    return 'VENDEDOR'
  }
  return null
}

export function scheduleDisplayRole(cardplusRole: string, flowRoleLabel?: string | null): string {
  const card = cardplusRole.trim()
  if (card) return card
  const fallback = (flowRoleLabel ?? '').trim()
  return fallback || 'Operação'
}

export function scheduleTeamOf(
  flowRole: string | null | undefined,
  cardplusRole: string,
  roleLabel: string
): ScheduleTeam | null {
  const flow = (flowRole ?? '').trim().toUpperCase()
  const card = normalizeCardplusRoleKey(cardplusRole)
  const label = normalizeCardplusRoleKey(roleLabel)

  const fromStore = scheduleTeamFromStoreFunction(card) ?? scheduleTeamFromStoreFunction(label)
  if (fromStore) return fromStore

  if (HIDDEN_FLOW_ROLES.has(flow) || HIDDEN_CARD_ROLES.has(card) || HIDDEN_CARD_ROLES.has(label)) return null

  if (flow === 'AUXILIAR') return 'AUXILIAR'
  if (flow === 'ESTOQUISTA' || flow === 'LIDER_ESTOQUE') return 'ESTOQUE'
  if (flow === 'LIDER_CAIXA') return 'CAIXA'
  if (card === 'funcionario operacional' || flow === 'OPERADOR' || flow === 'LIDER_OPERACAO') return 'OPERACAO'
  return 'OPERACAO'
}

export function resolveSchedulePersonTeam(person: {
  team?: ScheduleTeam | null
  isSelf?: boolean
  flowRole: string | null
  cardplusRole: string
  roleLabel: string
}): ScheduleTeam | null {
  if (person.isSelf) return 'OPERACAO'
  return scheduleTeamOf(person.flowRole, person.cardplusRole, person.cardplusRole || person.roleLabel)
}

export function compactScheduleKey(value: string): string {
  return normalizePersonName(value).replace(/[^a-z0-9]/g, '')
}

export function scheduleActorMatchesPerson(actorName: string, personName: string, actorEmail = ''): boolean {
  return scheduleActorMatchScore(actorName, actorEmail, personName) >= 20
}

export function scheduleActorMatchScore(actorName: string, actorEmail: string, personName: string): number {
  const actor = normalizePersonName(actorName)
  const person = normalizePersonName(personName)
  const emailLocal = compactScheduleKey(actorEmail.split('@')[0] ?? '')
  const compactPerson = compactScheduleKey(personName)
  if (!person || person === 'caixa') return 0
  let score = 0
  if (actor && person === actor) score += 25
  if (actor) {
    const actorTokens = actor.split(' ')
    const personTokens = person.split(' ')
    if (actorTokens[0] === personTokens[0]) {
      score += actorTokens.length === 1 ? 8 : 16
      if (actorTokens.length > 1 && actorTokens.every((token) => personTokens.includes(token))) score += 20
    }
  }
  if (compactPerson.length >= 8 && emailLocal.includes(compactPerson)) score += 45
  const strippedEmail = emailLocal.replace(/\d+$/g, '')
  if (compactPerson.length >= 8 && strippedEmail === compactPerson) score += 20
  const tokens = person.split(' ').filter((token) => token.length >= 3)
  if (tokens.length >= 2 && emailLocal.includes(tokens[0]) && emailLocal.includes(tokens[tokens.length - 1])) {
    score += 50
  }
  return score
}
