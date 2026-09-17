import { listEmployeeDirectory } from './access'
import { listAttendanceEventsRange, listAttendanceKinds } from './attendance'
import { ensureOperationalCollaborator, listEmployees, listStores } from './cardplus'
import { dateKeyInSaoPaulo, isoWeekday, lastDayOfMonth, mondayOf, monthKeyFromDateKey, shiftWeek, weekDateKeys } from './dates'
import { syncProfileRoleIfSamePerson } from './identities'
import { getFlowAdminClient } from './supabase-clients'
import { canEditStoreDesk, isTiAdminAppRole, isTiRole, type FlowRoleId } from '../shared/roles'
import {
  DEFAULT_SCHEDULE_SLOTS,
  SCHEDULE_BANDS,
  SCHEDULE_TEAMS,
  bandLabel,
  formatClock,
  compactScheduleKey,
  scheduleActorMatchScore,
  scheduleDisplayRole,
  scheduleSlotBaseCode,
  scheduleTeamOf,
  shortPersonName,
  teamFromSlotCode,
  weekdayName,
  weekdayShort,
  withTeamSlotCode,
  type ScheduleAssignment,
  type ScheduleAssignmentWrite,
  type ScheduleBand,
  type ScheduleBoard,
  type ScheduleDay,
  type SchedulePerson,
  type ScheduleSlot,
  type ScheduleSlotWrite,
  type ScheduleTeam,
  type ScheduleWeekday
} from '../shared/schedules'
import { attendanceKindLabel } from '../shared/attendance'

type SlotRow = {
  id: string
  cardplus_store_id: string
  weekday: number
  band: string
  code: string
  label: string
  start_minutes: number
  end_minutes: number
  sort_order: number
}

type WeekRow = {
  week_start: string
  rolled_from_week: string | null
}

type AssignmentRow = {
  id: string
  slot_id: string
  weekday: number
  cardplus_collaborator_id: string
  sort_order: number
  note: string | null
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === '42P01' ||
        error.code === 'PGRST205' ||
        /flow_schedule_/i.test(error.message ?? ''))
  )
}

function asWeekday(value: number): ScheduleWeekday {
  if (value >= 1 && value <= 7) return value as ScheduleWeekday
  return 1
}

function asBand(value: string): ScheduleBand {
  return SCHEDULE_BANDS.includes(value as ScheduleBand) ? (value as ScheduleBand) : 'ABERTURA'
}

function missingSql(): Error {
  return new Error('Rode o SQL 0009_flow_schedules.sql no Supabase do FLOW para abrir as escalas.')
}

function asPerson(
  item: {
    id: string
    name: string
    flowRole: string | null
    cardplusRole: string
    flowRoleLabel: string
    team: ScheduleTeam
  },
  extra?: { isSelf?: boolean }
): SchedulePerson {
  return {
    id: item.id,
    name: item.name,
    shortName: shortPersonName(item.name),
    roleLabel: extra?.isSelf ? 'Operação' : scheduleDisplayRole(item.cardplusRole, item.flowRoleLabel),
    flowRole: item.flowRole,
    cardplusRole: item.cardplusRole,
    team: item.team,
    isSelf: extra?.isSelf
  }
}

async function loadActorIdentity(userId: string | null | undefined): Promise<{ name: string; email: string }> {
  if (!userId) return { name: '', email: '' }
  try {
    const { data } = await getFlowAdminClient()
      .from('flow_profiles')
      .select('display_name, email')
      .eq('user_id', userId)
      .maybeSingle()
    const row = data as { display_name?: string | null; email?: string | null } | null
    let email = row?.email?.trim().toLowerCase() ?? ''
    if (!email) {
      try {
        const authUser = await getFlowAdminClient().auth.admin.getUserById(userId)
        email = authUser.data.user?.email?.trim().toLowerCase() ?? ''
      } catch {
        email = ''
      }
    }
    return {
      name: row?.display_name?.trim() || email.split('@')[0] || '',
      email
    }
  } catch {
    return { name: '', email: '' }
  }
}

function isDeskOperator(item: {
  cardplusRole: string
  flowRole: string | null
  isGlobalDesk?: boolean
  globalDeskLabel?: string | null
  directorySource?: string
}): boolean {
  return (
    Boolean(item.isGlobalDesk) ||
    item.directorySource === 'app_user' ||
    isTiAdminAppRole(item.cardplusRole) ||
    isTiRole(item.cardplusRole) ||
    item.globalDeskLabel === 'TI'
  )
}

function findActorCollaborator(
  directory: Array<{
    id: string
    name: string
    storeId: string
    isActive: boolean
    flowRole: string | null
    cardplusRole: string
    flowRoleLabel: string
    isGlobalDesk?: boolean
    globalDeskLabel?: string | null
    directorySource?: string
  }>,
  actor: { name: string; email: string }
): (typeof directory)[number] | null {
  if (!actor.name.trim() && !actor.email.trim()) return null
  let best: { item: (typeof directory)[number]; score: number } | null = null
  for (const item of directory) {
    if (item.isActive === false || item.name.trim().toUpperCase() === 'CAIXA') continue
    let score = scheduleActorMatchScore(actor.name, actor.email, item.name)
    if (score <= 0) continue
    const hidden = scheduleTeamOf(item.flowRole, item.cardplusRole, item.cardplusRole) === null
    if (hidden) score += 30
    if (isDeskOperator(item) || item.flowRole === 'SUPERVISOR' || item.flowRole === 'DIRETOR') {
      score += 25
    }
    if (!best || score > best.score) best = { item, score }
  }
  if (!best || best.score < 40) return null
  return best.item
}

function toSlot(row: SlotRow): ScheduleSlot {
  return {
    id: row.id,
    storeId: row.cardplus_store_id,
    weekday: asWeekday(row.weekday),
    band: asBand(row.band),
    code: row.code,
    label: row.label,
    startMinutes: row.start_minutes,
    endMinutes: row.end_minutes,
    sortOrder: row.sort_order,
    team: teamFromSlotCode(row.code)
  }
}

async function loadDefaultSlots(): Promise<typeof DEFAULT_SCHEDULE_SLOTS> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_schedule_slot_defaults')
    .select('weekday, band, code, label, start_minutes, end_minutes, sort_order')
    .order('weekday')
    .order('sort_order')
  if (error) {
    if (isMissingTable(error)) throw missingSql()
    return DEFAULT_SCHEDULE_SLOTS
  }
  const rows = (data ?? []) as Array<{
    weekday: number
    band: string
    code: string
    label: string
    start_minutes: number
    end_minutes: number
    sort_order: number
  }>
  if (rows.length === 0) return DEFAULT_SCHEDULE_SLOTS
  return rows.map((row) => ({
    weekday: asWeekday(row.weekday),
    band: asBand(row.band),
    code: row.code,
    label: row.label,
    startMinutes: row.start_minutes,
    endMinutes: row.end_minutes,
    sortOrder: row.sort_order,
    team: teamFromSlotCode(row.code)
  }))
}

async function listSlots(storeId: string): Promise<ScheduleSlot[]> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_schedule_slots')
    .select('id, cardplus_store_id, weekday, band, code, label, start_minutes, end_minutes, sort_order')
    .eq('cardplus_store_id', storeId)
    .order('weekday')
    .order('sort_order')
  if (error) {
    if (isMissingTable(error)) throw missingSql()
    throw new Error(`Erro ao carregar horários: ${error.message}`)
  }
  return ((data ?? []) as SlotRow[]).map(toSlot)
}

async function insertTeamSlots(
  storeId: string,
  team: ScheduleTeam,
  template: Array<{
    weekday: ScheduleWeekday
    band: ScheduleBand
    code: string
    label: string
    startMinutes: number
    endMinutes: number
    sortOrder: number
  }>
): Promise<ScheduleSlot[]> {
  const rows = template.map((item) => ({
    cardplus_store_id: storeId,
    weekday: item.weekday,
    band: item.band,
    code: withTeamSlotCode(team, item.code),
    label: item.label,
    start_minutes: item.startMinutes,
    end_minutes: item.endMinutes,
    sort_order: item.sortOrder
  }))
  const { data, error } = await getFlowAdminClient()
    .from('flow_schedule_slots')
    .insert(rows)
    .select('id, cardplus_store_id, weekday, band, code, label, start_minutes, end_minutes, sort_order')
  if (!error) return ((data ?? []) as SlotRow[]).map(toSlot)
  if (isMissingTable(error)) throw missingSql()
  if (error.code !== '23505') {
    for (const row of rows) {
      const { error: oneError } = await getFlowAdminClient().from('flow_schedule_slots').insert(row)
      if (oneError && oneError.code !== '23505') {
        throw new Error(`Erro ao criar horários de ${team}: ${oneError.message}`)
      }
    }
  }
  return (await listSlots(storeId)).filter((slot) => teamFromSlotCode(slot.code) === team)
}

async function ensureSlots(storeId: string): Promise<{ slots: ScheduleSlot[]; seededTeams: ScheduleTeam[] }> {
  let existing = await listSlots(storeId)
  const seededTeams: ScheduleTeam[] = []
  if (existing.length === 0) {
    await insertTeamSlots(storeId, 'OPERACAO', await loadDefaultSlots())
    existing = await listSlots(storeId)
    seededTeams.push('OPERACAO')
  }
  const operacao = existing.filter((slot) => teamFromSlotCode(slot.code) === 'OPERACAO')
  const template = (operacao.length > 0 ? operacao : await loadDefaultSlots()).map((item) => ({
    weekday: item.weekday,
    band: item.band,
    code: item.code,
    label: item.label,
    startMinutes: item.startMinutes,
    endMinutes: item.endMinutes,
    sortOrder: item.sortOrder
  }))
  for (const item of SCHEDULE_TEAMS) {
    if (existing.some((slot) => teamFromSlotCode(slot.code) === item.id)) continue
    await insertTeamSlots(storeId, item.id, template)
    seededTeams.push(item.id)
    existing = await listSlots(storeId)
  }
  return { slots: existing, seededTeams }
}

async function copySeededTeamAssignments(
  storeId: string,
  weekStart: string,
  slots: ScheduleSlot[],
  seededTeams: ScheduleTeam[],
  people: Map<string, { team: ScheduleTeam }>
): Promise<void> {
  const teams = seededTeams.filter((team) => team !== 'OPERACAO')
  if (!teams.length) return
  const operacaoSlots = slots.filter((slot) => slot.team === 'OPERACAO')
  if (!operacaoSlots.length) return
  const { data, error } = await getFlowAdminClient()
    .from('flow_schedule_assignments')
    .select('slot_id, weekday, cardplus_collaborator_id, sort_order, note')
    .eq('cardplus_store_id', storeId)
    .eq('week_start', weekStart)
    .in(
      'slot_id',
      operacaoSlots.map((slot) => slot.id)
    )
  if (error || !data?.length) return
  const inserts: Array<{
    cardplus_store_id: string
    week_start: string
    slot_id: string
    weekday: number
    cardplus_collaborator_id: string
    sort_order: number
    note: string | null
  }> = []
  for (const team of teams) {
    const teamSlots = slots.filter((slot) => slot.team === team)
    for (const row of data as AssignmentRow[]) {
      const person = people.get(row.cardplus_collaborator_id)
      if (!person || person.team !== team) continue
      const source = operacaoSlots.find((slot) => slot.id === row.slot_id)
      if (!source) continue
      const target =
        teamSlots.find(
          (slot) => slot.weekday === source.weekday && slot.band === source.band && slot.sortOrder === source.sortOrder
        ) ?? teamSlots.find((slot) => slot.weekday === source.weekday && slot.band === source.band)
      if (!target) continue
      inserts.push({
        cardplus_store_id: storeId,
        week_start: weekStart,
        slot_id: target.id,
        weekday: source.weekday,
        cardplus_collaborator_id: row.cardplus_collaborator_id,
        sort_order: row.sort_order,
        note: row.note
      })
    }
  }
  if (!inserts.length) return
  const { error: insertError } = await getFlowAdminClient().from('flow_schedule_assignments').insert(inserts)
  if (insertError && insertError.code !== '23505') {
    throw new Error(`Erro ao separar a escala por cargo: ${insertError.message}`)
  }
  const leftoverIds = (data as AssignmentRow[])
    .filter((row) => people.get(row.cardplus_collaborator_id)?.team !== 'OPERACAO')
    .map((row) => `${row.slot_id}:${row.cardplus_collaborator_id}`)
  if (!leftoverIds.length) return
  const { data: opRows } = await getFlowAdminClient()
    .from('flow_schedule_assignments')
    .select('id, slot_id, cardplus_collaborator_id')
    .eq('cardplus_store_id', storeId)
    .eq('week_start', weekStart)
    .in(
      'slot_id',
      operacaoSlots.map((slot) => slot.id)
    )
  const remove = ((opRows ?? []) as Array<{ id: string; slot_id: string; cardplus_collaborator_id: string }>)
    .filter((row) => leftoverIds.includes(`${row.slot_id}:${row.cardplus_collaborator_id}`))
    .map((row) => row.id)
  if (remove.length) {
    await getFlowAdminClient().from('flow_schedule_assignments').delete().in('id', remove)
  }
}

async function lastSeededWeek(storeId: string, before: string): Promise<string | null> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_schedule_weeks')
    .select('week_start')
    .eq('cardplus_store_id', storeId)
    .lt('week_start', before)
    .order('week_start', { ascending: false })
    .limit(8)
  if (error) {
    if (isMissingTable(error)) throw missingSql()
    return null
  }
  for (const row of (data ?? []) as Array<{ week_start: string }>) {
    const { count, error: countError } = await getFlowAdminClient()
      .from('flow_schedule_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('cardplus_store_id', storeId)
      .eq('week_start', row.week_start)
    if (countError) continue
    if ((count ?? 0) > 0) return row.week_start
  }
  return null
}

async function copyWeek(storeId: string, fromWeek: string, toWeek: string): Promise<void> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_schedule_assignments')
    .select('slot_id, weekday, cardplus_collaborator_id, sort_order, note')
    .eq('cardplus_store_id', storeId)
    .eq('week_start', fromWeek)
  if (error || !data?.length) return
  const { error: insertError } = await getFlowAdminClient()
    .from('flow_schedule_assignments')
    .insert(
      (data as AssignmentRow[]).map((row) => ({
        cardplus_store_id: storeId,
        week_start: toWeek,
        slot_id: row.slot_id,
        weekday: row.weekday,
        cardplus_collaborator_id: row.cardplus_collaborator_id,
        sort_order: row.sort_order,
        note: row.note
      }))
    )
  if (insertError && insertError.code !== '23505') {
    throw new Error(`Erro ao virar a semana da escala: ${insertError.message}`)
  }
}

async function ensureWeek(storeId: string, weekStart: string): Promise<string | null> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_schedule_weeks')
    .select('week_start, rolled_from_week')
    .eq('cardplus_store_id', storeId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) throw missingSql()
    throw new Error(`Erro ao carregar a semana: ${error.message}`)
  }
  if (data) return (data as WeekRow).rolled_from_week
  const previous = await lastSeededWeek(storeId, weekStart)
  if (previous) await copyWeek(storeId, previous, weekStart)
  const { error: insertError } = await getFlowAdminClient().from('flow_schedule_weeks').insert({
    cardplus_store_id: storeId,
    week_start: weekStart,
    rolled_from_week: previous
  })
  if (insertError && insertError.code !== '23505') {
    throw new Error(`Erro ao abrir a semana: ${insertError.message}`)
  }
  return previous
}

export async function getScheduleBoard(
  storeId: string,
  weekStartInput: string | null,
  role: FlowRoleId,
  userId?: string | null
): Promise<ScheduleBoard> {
  const stores = await listStores(storeId)
  const store = stores[0]
  if (!store) throw new Error('Unidade é obrigatória para montar a escala.')
  const weekStart = mondayOf(weekStartInput && /^\d{4}-\d{2}-\d{2}$/.test(weekStartInput) ? weekStartInput : dateKeyInSaoPaulo())
  const { slots, seededTeams } = await ensureSlots(storeId)
  const rolledFromWeek = await ensureWeek(storeId, weekStart)
  const dates = weekDateKeys(weekStart)
  const [storePeople, networkPeople, directory, actor] = await Promise.all([
    listEmployees(storeId),
    listEmployees(),
    listEmployeeDirectory(),
    loadActorIdentity(userId)
  ])
  const people = storePeople
    .filter((item) => item.isActive !== false && item.name.trim().toUpperCase() !== 'CAIXA')
    .map((item) => {
      const team = scheduleTeamOf(item.flowRole, item.cardplusRole, item.cardplusRole)
      if (!team) return null
      return asPerson({ ...item, team })
    })
    .filter((item): item is SchedulePerson => Boolean(item))
  const found = findActorCollaborator(directory, actor) ?? findActorCollaborator(networkPeople, actor)
  let self = found
  if (found && isDeskOperator(found)) {
    try {
      const nextFlow =
        found.flowRole && found.flowRole !== 'SUPERVISOR' ? found.flowRole : 'LIDER_OPERACAO'
      const operator = await ensureOperationalCollaborator({
        storeId,
        name: found.name,
        flowRole: nextFlow,
        sourceId: found.id
      })
      self = operator
      if (userId) {
        await syncProfileRoleIfSamePerson(userId, operator.name, operator.flowRole ?? nextFlow, {
          isGlobalDesk: true,
          email: actor.email
        })
      }
    } catch {
      self = found
    }
  }
  if (self) {
    const next = asPerson({ ...self, team: 'OPERACAO' }, { isSelf: true })
    const index = people.findIndex((person) => person.id === self.id)
    if (index >= 0) people[index] = next
    else people.unshift(next)
  }
  const absences = await listAttendanceKinds(storeId, dates)
  const names = new Map(people.map((person) => [person.id, person]))
  if (seededTeams.length) {
    try {
      await copySeededTeamAssignments(storeId, weekStart, slots, seededTeams, names)
    } catch {
      // Horários novos não podem derrubar o pool da equipe.
    }
  }
  const assignmentsRes = await getFlowAdminClient()
    .from('flow_schedule_assignments')
    .select('id, slot_id, weekday, cardplus_collaborator_id, sort_order, note')
    .eq('cardplus_store_id', storeId)
    .eq('week_start', weekStart)
    .order('sort_order')
  if (assignmentsRes.error) {
    if (isMissingTable(assignmentsRes.error)) throw missingSql()
    throw new Error(`Erro ao carregar a escala: ${assignmentsRes.error.message}`)
  }
  const extraIds = [
    ...new Set(
      ((assignmentsRes.data ?? []) as AssignmentRow[])
        .map((row) => row.cardplus_collaborator_id)
        .filter((id) => !names.has(id))
    )
  ]
  if (extraIds.length) {
    const extras = networkPeople.filter((item) => extraIds.includes(item.id))
    for (const item of extras) {
      const team = scheduleTeamOf(item.flowRole, item.cardplusRole, item.cardplusRole)
      if (!team) continue
      names.set(item.id, {
        id: item.id,
        name: item.name,
        shortName: shortPersonName(item.name),
        roleLabel: scheduleDisplayRole(item.cardplusRole, item.flowRoleLabel),
        flowRole: item.flowRole,
        cardplusRole: item.cardplusRole,
        team
      })
    }
  }
  const bySlot = new Map<string, ScheduleAssignment[]>()
  for (const row of (assignmentsRes.data ?? []) as AssignmentRow[]) {
    const person = names.get(row.cardplus_collaborator_id)
    if (!person) continue
    const item: ScheduleAssignment = {
      id: row.id,
      slotId: row.slot_id,
      weekday: asWeekday(row.weekday),
      collaboratorId: row.cardplus_collaborator_id,
      name: person.name,
      shortName: person.shortName,
      sortOrder: row.sort_order,
      note: row.note
    }
    const list = bySlot.get(row.slot_id) ?? []
    list.push(item)
    bySlot.set(row.slot_id, list)
  }
  const days: ScheduleDay[] = dates.map((dateKey) => {
    const weekday = isoWeekday(dateKey)
    return {
      weekday,
      dateKey,
      label: weekdayName(weekday),
      shortLabel: weekdayShort(weekday),
      slots: slots
        .filter((slot) => slot.weekday === weekday)
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((slot) => ({
          ...slot,
          assignments: (bySlot.get(slot.id) ?? [])
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((item) => ({
              ...item,
              absenceKind:
                absences.get(`${item.collaboratorId}:${dateKey}`) ??
                absences.get(`name:${compactScheduleKey(item.name)}:${dateKey}`) ??
                null
            }))
        }))
    }
  })
  return {
    storeId,
    storeName: store.name,
    weekStart,
    rolledFromWeek,
    canEdit: canEditStoreDesk(role),
    days,
    people,
    actorOperator: actor.email || actor.name
      ? {
          name: self?.name || actor.name,
          email: actor.email,
          included: Boolean(self)
        }
      : null
  }
}

function uniquifySlotCodes(team: ScheduleTeam, slots: ScheduleSlotWrite[]): ScheduleSlotWrite[] {
  const used = new Set<string>()
  return slots.map((slot, index) => {
    const raw = scheduleSlotBaseCode(slot.code).replace(/\d+$/, '') || 'H'
    let code = withTeamSlotCode(team, scheduleSlotBaseCode(slot.code) || `${raw}${index + 1}`)
    let n = 2
    while (used.has(`${slot.weekday}:${code}`)) {
      code = withTeamSlotCode(team, `${raw}${n}`)
      n += 1
    }
    used.add(`${slot.weekday}:${code}`)
    return { ...slot, code }
  })
}

export async function saveScheduleSlots(
  storeId: string,
  slots: ScheduleSlotWrite[],
  team: ScheduleTeam = 'OPERACAO'
): Promise<void> {
  if (slots.length === 0) throw new Error('A escala precisa de pelo menos um horário.')
  for (const slot of slots) {
    if (slot.endMinutes <= slot.startMinutes) {
      throw new Error(`Horário inválido em ${weekdayName(slot.weekday)} · ${slot.label}.`)
    }
  }
  const uniqueSlots = uniquifySlotCodes(team, slots)
  const { slots: current } = await ensureSlots(storeId)
  const teamSlots = current.filter((slot) => slot.team === team)
  const keepIds = new Set(uniqueSlots.map((slot) => slot.id).filter((id): id is string => Boolean(id)))
  const removed = teamSlots.filter((slot) => !keepIds.has(slot.id))
  if (removed.length) {
    const { error } = await getFlowAdminClient()
      .from('flow_schedule_slots')
      .delete()
      .in(
        'id',
        removed.map((slot) => slot.id)
      )
    if (error) throw new Error(`Erro ao atualizar horários: ${error.message}`)
  }
  for (const slot of uniqueSlots) {
    const payload = {
      cardplus_store_id: storeId,
      weekday: slot.weekday,
      band: slot.band,
      code: slot.code,
      label: slot.label.trim().slice(0, 32) || bandLabel(slot.band),
      start_minutes: slot.startMinutes,
      end_minutes: slot.endMinutes,
      sort_order: slot.sortOrder,
      updated_at: new Date().toISOString()
    }
    if (slot.id && teamSlots.some((item) => item.id === slot.id)) {
      const { error } = await getFlowAdminClient().from('flow_schedule_slots').update(payload).eq('id', slot.id)
      if (error) throw new Error(`Erro ao salvar horário: ${error.message}`)
    } else {
      const { error } = await getFlowAdminClient().from('flow_schedule_slots').insert(payload)
      if (error) throw new Error(`Erro ao criar horário: ${error.message}`)
    }
  }
}

export async function resetScheduleSlots(storeId: string, team: ScheduleTeam = 'OPERACAO'): Promise<void> {
  const defaults = await loadDefaultSlots()
  const current = await listSlots(storeId)
  const teamSlots = current.filter((slot) => slot.team === team)
  const keep = new Set(defaults.map((item) => `${item.weekday}:${withTeamSlotCode(team, item.code)}`))
  const removed = teamSlots.filter((slot) => !keep.has(`${slot.weekday}:${slot.code}`))
  if (removed.length) {
    const { error } = await getFlowAdminClient()
      .from('flow_schedule_slots')
      .delete()
      .in(
        'id',
        removed.map((slot) => slot.id)
      )
    if (error && !isMissingTable(error)) throw new Error(`Erro ao restaurar horários: ${error.message}`)
  }
  for (const item of defaults) {
    const code = withTeamSlotCode(team, item.code)
    const existing = teamSlots.find((slot) => slot.weekday === item.weekday && slot.code === code)
    const payload = {
      cardplus_store_id: storeId,
      weekday: item.weekday,
      band: item.band,
      code,
      label: item.label,
      start_minutes: item.startMinutes,
      end_minutes: item.endMinutes,
      sort_order: item.sortOrder,
      updated_at: new Date().toISOString()
    }
    if (existing) {
      const { error } = await getFlowAdminClient().from('flow_schedule_slots').update(payload).eq('id', existing.id)
      if (error) throw new Error(`Erro ao restaurar horário: ${error.message}`)
    } else {
      const { error } = await getFlowAdminClient().from('flow_schedule_slots').insert(payload)
      if (error) throw new Error(`Erro ao restaurar horário: ${error.message}`)
    }
  }
}

export async function upsertScheduleAssignment(input: ScheduleAssignmentWrite): Promise<void> {
  const weekStart = mondayOf(input.weekStart)
  const { slots } = await ensureSlots(input.storeId)
  const slot = slots.find((item) => item.id === input.slotId)
  if (!slot) throw new Error('Horário não encontrado.')
  const flow = getFlowAdminClient()
  const { data: existing } = await flow
    .from('flow_schedule_assignments')
    .select('id, sort_order, cardplus_collaborator_id')
    .eq('cardplus_store_id', input.storeId)
    .eq('week_start', weekStart)
    .eq('slot_id', slot.id)
  const rows = (existing ?? []) as Array<{ id: string; sort_order: number; cardplus_collaborator_id: string }>
  const already = rows.find((row) => row.cardplus_collaborator_id === input.collaboratorId)
  if (already) {
    if (input.id && input.id !== already.id) await deleteScheduleAssignment(input.id, input.storeId)
    return
  }
  const nextOrder = rows.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1
  if (input.id) {
    const { error } = await flow
      .from('flow_schedule_assignments')
      .update({
        slot_id: slot.id,
        weekday: slot.weekday,
        note: input.note?.trim().slice(0, 40) || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', input.id)
    if (error) {
      if (error.code === '23505') {
        await deleteScheduleAssignment(input.id, input.storeId)
        return
      }
      throw new Error(`Erro ao mover na escala: ${error.message}`)
    }
    return
  }
  const { error } = await flow.from('flow_schedule_assignments').insert({
    cardplus_store_id: input.storeId,
    week_start: weekStart,
    slot_id: slot.id,
    weekday: slot.weekday,
    cardplus_collaborator_id: input.collaboratorId,
    sort_order: nextOrder,
    note: input.note?.trim().slice(0, 40) || null
  })
  if (!error) return
  if (error.code === '23505') {
    const { data: again } = await flow
      .from('flow_schedule_assignments')
      .select('id')
      .eq('cardplus_store_id', input.storeId)
      .eq('week_start', weekStart)
      .eq('slot_id', slot.id)
      .eq('cardplus_collaborator_id', input.collaboratorId)
      .maybeSingle()
    if (again) return
    throw new Error(
      'Essa pessoa já está neste horário. Para encaixar no mesmo dia em outro horário, rode o SQL 0011_flow_schedule_multi_slot.sql no FLOW.'
    )
  }
  throw new Error(`Erro ao encaixar na escala: ${error.message}`)
}

export async function deleteScheduleAssignment(id: string, storeId: string): Promise<void> {
  const { error } = await getFlowAdminClient()
    .from('flow_schedule_assignments')
    .delete()
    .eq('id', id)
    .eq('cardplus_store_id', storeId)
  if (error) throw new Error(`Erro ao tirar da escala: ${error.message}`)
}

export type KobbiScheduleContext = {
  unidade: string | null
  precisaUnidade: boolean
  tabelaAusente: boolean
  semanaInicio: string
  semanaFim: string
  dias: string[]
  pessoas: Array<{
    id: string
    nome: string
    nomeCurto: string
    busca: string[]
    cargo: string
    time: string
    dias: Array<{
      data: string
      dia: string
      horarios: string[]
      ocorrencia: string | null
      folga: boolean
    }>
  }>
  ocorrencias: Array<{
    nome: string
    data: string
    tipo: string
    observacao: string | null
  }>
}

export async function getKobbiScheduleContext(
  storeId: string | null | undefined
): Promise<KobbiScheduleContext> {
  const today = dateKeyInSaoPaulo()
  const weekStart = mondayOf(today)
  const dates = weekDateKeys(weekStart)
  const empty: KobbiScheduleContext = {
    unidade: null,
    precisaUnidade: !storeId,
    tabelaAusente: false,
    semanaInicio: weekStart,
    semanaFim: dates[6] ?? weekStart,
    dias: dates,
    pessoas: [],
    ocorrencias: []
  }
  if (!storeId) return empty

  const stores = await listStores(storeId)
  const store = stores[0]
  if (!store) return { ...empty, precisaUnidade: true }

  let slots: ScheduleSlot[] = []
  try {
    slots = await listSlots(storeId)
  } catch (error) {
    if (error instanceof Error && /0009_flow_schedules/i.test(error.message)) {
      return { ...empty, unidade: store.name, tabelaAusente: true }
    }
    throw error
  }

  const [people, assignmentsRes, absences, events] = await Promise.all([
    listEmployees(storeId),
    getFlowAdminClient()
      .from('flow_schedule_assignments')
      .select('id, slot_id, weekday, cardplus_collaborator_id, sort_order, note')
      .eq('cardplus_store_id', storeId)
      .eq('week_start', weekStart),
    listAttendanceKinds(storeId, dates),
    listAttendanceEventsRange(
      storeId,
      `${monthKeyFromDateKey(today)}-01`,
      `${monthKeyFromDateKey(today)}-${String(lastDayOfMonth(monthKeyFromDateKey(today))).padStart(2, '0')}`
    )
  ])

  if (assignmentsRes.error) {
    if (isMissingTable(assignmentsRes.error)) {
      return { ...empty, unidade: store.name, tabelaAusente: true }
    }
    throw new Error(`Erro ao carregar a escala: ${assignmentsRes.error.message}`)
  }

  const slotById = new Map(slots.map((slot) => [slot.id, slot]))
  const byPersonDay = new Map<string, string[]>()
  for (const row of (assignmentsRes.data ?? []) as AssignmentRow[]) {
    const slot = slotById.get(row.slot_id)
    if (!slot) continue
    const weekday = asWeekday(row.weekday)
    const dateKey = dates[weekday - 1]
    if (!dateKey) continue
    const label = `${slot.label} ${formatClock(slot.startMinutes)}–${formatClock(slot.endMinutes)}`
    const key = `${row.cardplus_collaborator_id}:${dateKey}`
    const list = byPersonDay.get(key) ?? []
    list.push(label)
    byPersonDay.set(key, list)
  }

  const activePeople = people.filter(
    (item) => item.isActive !== false && item.name.trim().toUpperCase() !== 'CAIXA'
  )

  const pessoas = activePeople.map((item) => {
    const team = scheduleTeamOf(item.flowRole, item.cardplusRole, item.cardplusRole)
    const nome = item.name.trim()
    const nomeCurto = shortPersonName(nome)
    const busca = Array.from(
      new Set(
        [nome, nomeCurto, compactScheduleKey(nome), compactScheduleKey(nomeCurto)].filter(
          (value) => value.length >= 2
        )
      )
    )
    return {
      id: item.id,
      nome,
      nomeCurto,
      busca,
      cargo: scheduleDisplayRole(item.cardplusRole, item.flowRoleLabel),
      time: team ?? 'OPERACAO',
      dias: dates.map((dateKey) => {
        const horarios = byPersonDay.get(`${item.id}:${dateKey}`) ?? []
        const kind =
          absences.get(`${item.id}:${dateKey}`) ??
          absences.get(`name:${compactScheduleKey(item.name)}:${dateKey}`) ??
          null
        return {
          data: dateKey,
          dia: weekdayName(isoWeekday(dateKey)),
          horarios,
          ocorrencia: kind ? attendanceKindLabel(kind) : null,
          folga: horarios.length === 0
        }
      })
    }
  })

  return {
    unidade: store.name,
    precisaUnidade: false,
    tabelaAusente: false,
    semanaInicio: weekStart,
    semanaFim: dates[6] ?? weekStart,
    dias: dates,
    pessoas,
    ocorrencias: events.map((event) => ({
      nome: event.name,
      data: event.dateKey,
      tipo: attendanceKindLabel(event.kind, event.justified),
      observacao: event.note
    }))
  }
}

export { formatClock, shiftWeek }
