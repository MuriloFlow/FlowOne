import { listEmployeeDirectory } from './access'
import { listStores } from './cardplus'
import { dateKeyInSaoPaulo, isoWeekday, mondayOf, shiftWeek, weekDateKeys } from './dates'
import { getFlowAdminClient } from './supabase-clients'
import { canEditStoreDesk } from '../shared/roles'
import {
  DEFAULT_SCHEDULE_SLOTS,
  SCHEDULE_BANDS,
  bandLabel,
  formatClock,
  shortPersonName,
  weekdayName,
  weekdayShort,
  type ScheduleAssignment,
  type ScheduleAssignmentWrite,
  type ScheduleBand,
  type ScheduleBoard,
  type ScheduleDay,
  type ScheduleSlot,
  type ScheduleSlotWrite,
  type ScheduleWeekday
} from '../shared/schedules'
import type { FlowRoleId } from '../shared/roles'

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
    sortOrder: row.sort_order
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
    sortOrder: row.sort_order
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

async function ensureSlots(storeId: string): Promise<ScheduleSlot[]> {
  const existing = await listSlots(storeId)
  if (existing.length > 0) return existing
  const defaults = await loadDefaultSlots()
  const { data, error } = await getFlowAdminClient()
    .from('flow_schedule_slots')
    .insert(
      defaults.map((item) => ({
        cardplus_store_id: storeId,
        weekday: item.weekday,
        band: item.band,
        code: item.code,
        label: item.label,
        start_minutes: item.startMinutes,
        end_minutes: item.endMinutes,
        sort_order: item.sortOrder
      }))
    )
    .select('id, cardplus_store_id, weekday, band, code, label, start_minutes, end_minutes, sort_order')
  if (error) {
    if (isMissingTable(error)) throw missingSql()
    throw new Error(`Erro ao criar horários padrão: ${error.message}`)
  }
  return ((data ?? []) as SlotRow[]).map(toSlot)
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
  role: FlowRoleId
): Promise<ScheduleBoard> {
  const stores = await listStores(storeId)
  const store = stores[0]
  if (!store) throw new Error('Unidade é obrigatória para montar a escala.')
  const weekStart = mondayOf(weekStartInput && /^\d{4}-\d{2}-\d{2}$/.test(weekStartInput) ? weekStartInput : dateKeyInSaoPaulo())
  const slots = await ensureSlots(storeId)
  const rolledFromWeek = await ensureWeek(storeId, weekStart)
  const dates = weekDateKeys(weekStart)
  const [assignmentsRes, directory] = await Promise.all([
    getFlowAdminClient()
      .from('flow_schedule_assignments')
      .select('id, slot_id, weekday, cardplus_collaborator_id, sort_order, note')
      .eq('cardplus_store_id', storeId)
      .eq('week_start', weekStart)
      .order('sort_order'),
    listEmployeeDirectory(storeId)
  ])
  if (assignmentsRes.error) {
    if (isMissingTable(assignmentsRes.error)) throw missingSql()
    throw new Error(`Erro ao carregar a escala: ${assignmentsRes.error.message}`)
  }
  const people = directory
    .filter(
      (item) =>
        item.directorySource !== 'app_user' &&
        item.isActive &&
        item.name.trim().toUpperCase() !== 'CAIXA' &&
        item.storeId === storeId
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      shortName: shortPersonName(item.name),
      roleLabel: item.flowRoleLabel
    }))
  const names = new Map(people.map((person) => [person.id, person]))
  const extraIds = [
    ...new Set(
      ((assignmentsRes.data ?? []) as AssignmentRow[])
        .map((row) => row.cardplus_collaborator_id)
        .filter((id) => !names.has(id))
    )
  ]
  if (extraIds.length) {
    const extras = directory.filter((item) => extraIds.includes(item.id))
    for (const item of extras) {
      names.set(item.id, {
        id: item.id,
        name: item.name,
        shortName: shortPersonName(item.name),
        roleLabel: item.flowRoleLabel
      })
    }
  }
  const bySlot = new Map<string, ScheduleAssignment[]>()
  for (const row of (assignmentsRes.data ?? []) as AssignmentRow[]) {
    const person = names.get(row.cardplus_collaborator_id)
    const item: ScheduleAssignment = {
      id: row.id,
      slotId: row.slot_id,
      weekday: asWeekday(row.weekday),
      collaboratorId: row.cardplus_collaborator_id,
      name: person?.name ?? 'Funcionário',
      shortName: person?.shortName ?? 'Funcionário',
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
          assignments: (bySlot.get(slot.id) ?? []).sort((left, right) => left.sortOrder - right.sortOrder)
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
    people
  }
}

export async function saveScheduleSlots(storeId: string, slots: ScheduleSlotWrite[]): Promise<void> {
  if (slots.length === 0) throw new Error('A escala precisa de pelo menos um horário.')
  for (const slot of slots) {
    if (slot.endMinutes <= slot.startMinutes) {
      throw new Error(`Horário inválido em ${weekdayName(slot.weekday)} · ${slot.label}.`)
    }
  }
  const current = await ensureSlots(storeId)
  const keepIds = new Set(slots.map((slot) => slot.id).filter((id): id is string => Boolean(id)))
  const removed = current.filter((slot) => !keepIds.has(slot.id))
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
  for (const slot of slots) {
    const payload = {
      cardplus_store_id: storeId,
      weekday: slot.weekday,
      band: slot.band,
      code: slot.code.trim().toUpperCase().slice(0, 12) || slot.band.slice(0, 6),
      label: slot.label.trim().slice(0, 32) || bandLabel(slot.band),
      start_minutes: slot.startMinutes,
      end_minutes: slot.endMinutes,
      sort_order: slot.sortOrder,
      updated_at: new Date().toISOString()
    }
    if (slot.id && current.some((item) => item.id === slot.id)) {
      const { error } = await getFlowAdminClient().from('flow_schedule_slots').update(payload).eq('id', slot.id)
      if (error) throw new Error(`Erro ao salvar horário: ${error.message}`)
    } else {
      const { error } = await getFlowAdminClient().from('flow_schedule_slots').insert(payload)
      if (error) throw new Error(`Erro ao criar horário: ${error.message}`)
    }
  }
}

export async function resetScheduleSlots(storeId: string): Promise<void> {
  const defaults = await loadDefaultSlots()
  const current = await listSlots(storeId)
  const keep = new Set(defaults.map((item) => `${item.weekday}:${item.code}`))
  const removed = current.filter((slot) => !keep.has(`${slot.weekday}:${slot.code}`))
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
    const existing = current.find((slot) => slot.weekday === item.weekday && slot.code === item.code)
    const payload = {
      cardplus_store_id: storeId,
      weekday: item.weekday,
      band: item.band,
      code: item.code,
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
  const slots = await ensureSlots(input.storeId)
  const slot = slots.find((item) => item.id === input.slotId)
  if (!slot) throw new Error('Horário não encontrado.')
  const { data: existing } = await getFlowAdminClient()
    .from('flow_schedule_assignments')
    .select('sort_order')
    .eq('cardplus_store_id', input.storeId)
    .eq('week_start', weekStart)
    .eq('slot_id', slot.id)
  const nextOrder =
    ((existing ?? []) as Array<{ sort_order: number }>).reduce((max, row) => Math.max(max, row.sort_order), -1) + 1
  if (input.id) {
    const { error } = await getFlowAdminClient()
      .from('flow_schedule_assignments')
      .update({
        slot_id: slot.id,
        weekday: slot.weekday,
        note: input.note?.trim().slice(0, 40) || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', input.id)
    if (error) throw new Error(`Erro ao mover na escala: ${error.message}`)
    return
  }
  const { error } = await getFlowAdminClient().from('flow_schedule_assignments').insert({
    cardplus_store_id: input.storeId,
    week_start: weekStart,
    slot_id: slot.id,
    weekday: slot.weekday,
    cardplus_collaborator_id: input.collaboratorId,
    sort_order: nextOrder,
    note: input.note?.trim().slice(0, 40) || null
  })
  if (error) {
    if (error.code === '23505') throw new Error('Essa pessoa já está neste horário.')
    throw new Error(`Erro ao encaixar na escala: ${error.message}`)
  }
}

export async function deleteScheduleAssignment(id: string, storeId: string): Promise<void> {
  const { error } = await getFlowAdminClient()
    .from('flow_schedule_assignments')
    .delete()
    .eq('id', id)
    .eq('cardplus_store_id', storeId)
  if (error) throw new Error(`Erro ao tirar da escala: ${error.message}`)
}

export { formatClock, shiftWeek }
