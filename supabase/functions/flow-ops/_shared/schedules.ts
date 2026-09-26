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
  sundayCycle?: 'A' | 'B' | 'C' | null
  sundayCycleStart?: string | null
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

// ─── Rotação 2x1 dos domingos (grupos A/B/C) ─────────────────────────────────
// 2 domingos trabalhados + 1 de folga, girando entre os grupos A, B e C.
// Trabalham no domingo: Operação, Vendas e Caixa. Estoque e Auxiliar nunca.

export type SundayCycleGroup = 'A' | 'B' | 'C'

export const SUNDAY_GROUPS: readonly SundayCycleGroup[] = ['A', 'B', 'C']

export const SUNDAY_ROTATION_NOTE = '2x1 domingo'

const SUNDAY_WORK_TEAMS: ReadonlySet<ScheduleTeam> = new Set(['OPERACAO', 'CAIXA', 'VENDEDOR'])

export function isSundayWorkTeam(team: ScheduleTeam): boolean {
  return SUNDAY_WORK_TEAMS.has(team)
}

function utcDay(dateKey: string): number {
  const parts = dateKey.split('-').map((part) => Number(part))
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return NaN
  return Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86_400_000
}

function keyFromDay(day: number): string {
  const date = new Date(day * 86_400_000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function addDaysToDate(dateKey: string, days: number): string {
  return keyFromDay(utcDay(dateKey) + days)
}

export function nextMondayOf(dateKey: string): string {
  const day = utcDay(dateKey)
  if (!Number.isFinite(day)) return dateKey
  const weekday = (day + 3) % 7 // 0 = segunda
  const offset = (7 - weekday) % 7 || 7
  return keyFromDay(day + offset)
}

export function nextSundayOf(dateKey: string): string {
  const day = utcDay(dateKey)
  if (!Number.isFinite(day)) return dateKey
  const weekday = (day + 3) % 7 // 6 = domingo
  const offset = ((6 - weekday + 7) % 7) || 7
  return keyFromDay(day + offset)
}

export type SundayCycleInput = {
  cycle: string | null
  cycleStart: string | null
}

export type SundayCycleStatus = {
  eligible: boolean
  group: SundayCycleGroup | null
  works: boolean
  cycleLabel: '1° Domingo' | '2° Domingo' | null
}

export const NOT_IN_ROTATION: SundayCycleStatus = {
  eligible: false,
  group: null,
  works: false,
  cycleLabel: null
}

// Estado da pessoa HOJE: em que posição do ciclo 2x1 ela está.
export function sundayCycleStatus(input: SundayCycleInput, todayKey: string): SundayCycleStatus {
  const cycle = (input.cycle ?? '').trim().toUpperCase()
  if (!SUNDAY_GROUPS.includes(cycle as SundayCycleGroup) || !input.cycleStart) return NOT_IN_ROTATION
  const start = utcDay(input.cycleStart)
  const now = utcDay(todayKey)
  if (!Number.isFinite(start) || !Number.isFinite(now) || now < start) {
    return { eligible: true, group: cycle as SundayCycleGroup, works: false, cycleLabel: null }
  }
  const weeksIn = Math.floor((now - start) / 7)
  const step = weeksIn % 3
  return {
    eligible: true,
    group: cycle as SundayCycleGroup,
    works: step !== 2,
    cycleLabel: step === 0 ? '1° Domingo' : '2° Domingo'
  }
}

export type SundayRotationRow = {
  id: string
  name: string
  shortName: string
  team: ScheduleTeam
  cycle: string | null
  cycleStart: string | null
}

export type SundayRotationSlot = {
  id: string
  band: ScheduleBand
  sortOrder: number
  team: ScheduleTeam
}

export type SundayRotationPlan = {
  inserts: Array<{ slotId: string; weekday: ScheduleWeekday; collaboratorId: string; note: string | null }>
  deletes: string[]
  offNames: string[]
  covered: boolean
}

const EMPTY_PLAN: SundayRotationPlan = { inserts: [], deletes: [], offNames: [], covered: true }

// Grupo que cobre cada banda do domingo. Uma banda por grupo mantém a folga
// previsível: mesmo grupo nunca fica em dois turnos no mesmo domingo.
export function sundayGroupForBand(band: ScheduleBand): SundayCycleGroup {
  if (band === 'ABERTURA') return 'A'
  if (band === 'INTERMEDIARIO') return 'B'
  return 'C'
}

// Monta o plano de encaixe/remoção do domingo da semana `weekStart`.
// `existing` são os encaixes atuais (id do assignment) nos slots de domingo.
export function planSundayRotation(
  rows: SundayRotationRow[],
  slots: SundayRotationSlot[],
  existing: Array<{ id: string; slotId: string; collaboratorId: string; note?: string | null }>,
  weekStart: string,
  todayKey: string
): SundayRotationPlan {
  const sundayDay = utcDay(weekStart) + 6
  if (!Number.isFinite(sundayDay)) return EMPTY_PLAN
  const sundayKey = keyFromDay(sundayDay)
  if (utcDay(todayKey) > sundayDay) return EMPTY_PLAN // semana já passou
  if (slots.length === 0) return EMPTY_PLAN

  const bySlot = new Map<string, Set<string>>()
  const assignmentIdBy = new Map<string, string>()
  const noteByAssignment = new Map<string, string | null>()
  for (const item of existing) {
    assignmentIdBy.set(`${item.slotId}:${item.collaboratorId}`, item.id)
    noteByAssignment.set(item.id, item.note ?? null)
    const set = bySlot.get(item.slotId) ?? new Set<string>()
    set.add(item.collaboratorId)
    bySlot.set(item.slotId, set)
  }

  const orderedSlots = [...slots].sort((left, right) => left.sortOrder - right.sortOrder)
  const groups = new Map<SundayCycleGroup, SundayRotationRow[]>()
  const offNames: string[] = []
  for (const row of rows) {
    if (!SUNDAY_WORK_TEAMS.has(row.team)) continue
    // O estado vale no DOMINGO da semana em vista: a semana que o gerente está
    // montando pode ser futura, e a folga de hoje não é a folga de lá.
    const status = sundayCycleStatus(row, sundayKey)
    if (!status.eligible || !status.group) continue
    if (!status.works) {
      offNames.push(row.shortName || row.name)
      continue
    }
    const list = groups.get(status.group) ?? []
    list.push(row)
    groups.set(status.group, list)
  }

  const inserts: SundayRotationPlan['inserts'] = []
  const deletes: string[] = []
  let uncovered = 0
  for (const slot of orderedSlots) {
    const group = sundayGroupForBand(slot.band)
    // Cada time preenche os PRÓPRIOS horários de domingo: vendedor em slot de
    // Vendas, caixa em slot de Caixa etc. O grupo decide QUEM, o time decide ONDE.
    const roster = (groups.get(group) ?? [])
      .filter((row) => row.team === slot.team)
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
    const current = bySlot.get(slot.id) ?? new Set<string>()
    // Limpeza: sai do slot quem está de folga no ciclo, quem trocou de
    // grupo/time ou quem saiu da rotação (mas só se foi a própria rotação
    // que o colocou — encaixe manual do gerente é preservado).
    const expectedIds = new Set(roster.map((row) => row.id))
    for (const id of current) {
      if (expectedIds.has(id)) continue
      const assignmentId = assignmentIdBy.get(`${slot.id}:${id}`)
      if (!assignmentId) continue
      const row = rows.find((item) => item.id === id)
      if (row) {
        const status = sundayCycleStatus(row, sundayKey)
        if (!status.works || status.group !== group || row.team !== slot.team) deletes.push(assignmentId)
      } else if (noteByAssignment.get(assignmentId) === SUNDAY_ROTATION_NOTE) {
        deletes.push(assignmentId)
      }
    }
    if (roster.length === 0) {
      uncovered += 1
      continue
    }
    const wanted = Math.max(1, Math.floor(roster.length / Math.min(orderedSlots.length, roster.length)))
    const already = [...current].filter((id) => expectedIds.has(id))
    const remaining = Math.max(0, wanted - already.length)
    const pool = roster.filter((row) => !current.has(row.id) && !inserts.some((item) => item.collaboratorId === row.id))
    for (let index = 0; index < Math.min(remaining, pool.length); index += 1) {
      inserts.push({
        slotId: slot.id,
        weekday: 7,
        collaboratorId: pool[index].id,
        note: SUNDAY_ROTATION_NOTE
      })
    }
    if (already.length + Math.min(remaining, pool.length) < 1) uncovered += 1
  }
  return { inserts, deletes, offNames, covered: uncovered === 0 }
}
