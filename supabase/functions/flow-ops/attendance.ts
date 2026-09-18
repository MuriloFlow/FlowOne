import log from './log.ts'
import { assertEmployeeInStore, listEmployees, listStores } from './cardplus.ts'
import { dateKeyInSaoPaulo, lastDayOfMonth, monthKeyFromDateKey } from './dates.ts'
import { getFlowAdminClient } from './supabase-clients.ts'
import { compactScheduleKey } from './_shared/schedules.ts'
import { canEditStoreDesk, type FlowRoleId } from './_shared/roles.ts'
import {
  ATTENDANCE_PHOTO_MAX,
  ATTENDANCE_PHOTO_MAX_LENGTH,
  TEAM_HEADCOUNT_ROLES,
  attendanceKindIsJustified,
  attendanceStoreFunctionLabel,
  isAttendanceKind,
  isAttendancePhotoDataUrl,
  isTeamHeadcountRole,
  normalizeAttendanceKind,
  type AttendanceBoard,
  type AttendanceDayRow,
  type AttendanceEvent,
  type AttendanceEventWrite,
  type AttendanceKind,
  type AttendancePerson,
  type TeamHeadcountRole,
  type TeamHeadcountRow,
  type TeamHeadcountWrite
} from './_shared/attendance.ts'

type DayHeadcountRow = {
  cardplus_store_id: string
  date_key: string
  operacao: number | string
  vendedor: number | string
  caixa: number | string
  estoque: number | string
  auxiliar: number | string
}

type EventRow = {
  id: string
  cardplus_store_id: string
  date_key: string
  cardplus_collaborator_id: string
  collaborator_name: string
  kind: string
  justified: boolean | null
  note: string | null
  photos?: unknown
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

const EVENT_SELECT =
  'id, cardplus_store_id, date_key, cardplus_collaborator_id, collaborator_name, kind, justified, note, photos, created_by, created_by_name, created_at'

const EVENT_SELECT_NO_PHOTOS =
  'id, cardplus_store_id, date_key, cardplus_collaborator_id, collaborator_name, kind, justified, note, created_by, created_by_name, created_at'

const ROLE_COLUMNS: Record<TeamHeadcountRole, keyof Pick<
  DayHeadcountRow,
  'operacao' | 'vendedor' | 'caixa' | 'estoque' | 'auxiliar'
>> = {
  OPERACAO: 'operacao',
  VENDEDOR: 'vendedor',
  CAIXA: 'caixa',
  ESTOQUE: 'estoque',
  AUXILIAR: 'auxiliar'
}

function isMissingPhotosColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message ?? ''
  if (!/photos/i.test(message)) return false
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /column ['"]?photos['"]?/i.test(message) ||
    /Could not find the 'photos' column/i.test(message)
  )
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (isMissingPhotosColumn(error)) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_team_headcount|flow_attendance_days|flow_attendance_events/i.test(error.message ?? '')
  )
}

export function missingAttendanceSql(): Error {
  return new Error(
    'Rode o SQL 0012_flow_attendance.sql no Supabase do FLOW. Se o 0012 antigo já rodou, use 0013_flow_attendance_daily_headcount.sql.'
  )
}

export function missingAttendancePhotosSql(): Error {
  return new Error('Rode o SQL 0015_flow_attendance_photos.sql no Supabase do FLOW.')
}

function resolveMonthKey(monthKey?: string | null): string {
  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) return monthKey
  return monthKeyFromDateKey(dateKeyInSaoPaulo())
}

function asCount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Quantidade inválida.')
  return Math.min(999, Math.round(amount))
}

function asStoredCount(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.min(999, Math.round(amount))
}

function asNote(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const note = String(value).trim()
  if (!note) return null
  if (note.length > 280) throw new Error('A observação pode ter no máximo 280 caracteres.')
  return note
}

function photosFromRow(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is string => typeof item === 'string' && item.startsWith('data:image/')
  )
}

function asPhotos(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw new Error('As fotos do atestado são inválidas.')
  const photos: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('Foto do atestado inválida.')
    const trimmed = item.trim()
    if (!trimmed) continue
    if (!isAttendancePhotoDataUrl(trimmed)) {
      throw new Error('Use apenas fotos em data URL (data:image/...).')
    }
    if (trimmed.length > ATTENDANCE_PHOTO_MAX_LENGTH) {
      throw new Error('Uma das fotos passou do tamanho máximo.')
    }
    photos.push(trimmed)
    if (photos.length > ATTENDANCE_PHOTO_MAX) {
      throw new Error(`Pode anexar no máximo ${ATTENDANCE_PHOTO_MAX} fotos.`)
    }
  }
  return photos
}

function emptyHeadcount(): TeamHeadcountRow[] {
  return TEAM_HEADCOUNT_ROLES.map((role) => ({
    roleKey: role.id,
    label: role.label,
    count: 0
  }))
}

function headcountFromRow(row: DayHeadcountRow | null): TeamHeadcountRow[] {
  if (!row) return emptyHeadcount()
  return TEAM_HEADCOUNT_ROLES.map((role) => ({
    roleKey: role.id,
    label: role.label,
    count: asStoredCount(row[ROLE_COLUMNS[role.id]])
  }))
}

function emptyDays(monthKey: string): AttendanceDayRow[] {
  const last = lastDayOfMonth(monthKey)
  return Array.from({ length: last }, (_, index) => {
    const dateKey = `${monthKey}-${String(last - index).padStart(2, '0')}`
    return {
      dateKey,
      atestadoCount: 0,
      faltaCount: 0,
      bancoCount: 0,
      eventCount: 0,
      headcountFilled: false,
      headcount: emptyHeadcount()
    }
  })
}

function toEvent(row: EventRow): AttendanceEvent {
  const kind = normalizeAttendanceKind(row.kind, Boolean(row.justified))
  return {
    id: row.id,
    storeId: row.cardplus_store_id,
    dateKey: row.date_key,
    collaboratorId: row.cardplus_collaborator_id,
    name: row.collaborator_name,
    kind,
    justified: attendanceKindIsJustified(kind),
    note: row.note,
    photos: photosFromRow(row.photos),
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at
  }
}

function attendancePeople(
  directory: Array<{
    id: string
    name: string
    storeId: string
    isActive: boolean
    flowRole: string | null
    cardplusRole: string
  }>,
  storeId: string
): AttendancePerson[] {
  return directory
    .filter(
      (item) =>
        item.storeId === storeId &&
        item.isActive !== false &&
        item.name.trim().toUpperCase() !== 'CAIXA'
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      roleLabel: attendanceStoreFunctionLabel(item.cardplusRole, item.flowRole)
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
}

async function actorDisplayName(userId: string): Promise<string | null> {
  const { data } = await getFlowAdminClient()
    .from('flow_profiles')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle()
  const name = (data as { display_name?: string | null } | null)?.display_name?.trim()
  return name || null
}

export async function listAttendanceEventsRange(
  storeId: string,
  fromDate: string,
  toDate: string
): Promise<AttendanceEvent[]> {
  if (!storeId || !fromDate || !toDate) return []
  const { data, error } = await getFlowAdminClient()
    .from('flow_attendance_events')
    .select(
      'id, cardplus_store_id, date_key, cardplus_collaborator_id, collaborator_name, kind, justified, note, created_by, created_by_name, created_at'
    )
    .eq('cardplus_store_id', storeId)
    .gte('date_key', fromDate)
    .lte('date_key', toDate)
    .order('date_key', { ascending: true })
  if (error) {
    if (isMissingTable(error)) return []
    throw new Error(`Erro ao carregar ocorrências: ${error.message}`)
  }
  return ((data ?? []) as EventRow[]).map(toEvent)
}

export async function listAttendanceKinds(
  storeId: string,
  dateKeys: string[]
): Promise<Map<string, AttendanceKind>> {
  const map = new Map<string, AttendanceKind>()
  if (!storeId || dateKeys.length === 0) return map
  const { data, error } = await getFlowAdminClient()
    .from('flow_attendance_events')
    .select('date_key, cardplus_collaborator_id, collaborator_name, kind, justified')
    .eq('cardplus_store_id', storeId)
    .in('date_key', dateKeys)
  if (error) {
    if (isMissingTable(error)) return map
    throw new Error(`Erro ao carregar atestados da escala: ${error.message}`)
  }
  for (const row of (data ?? []) as Array<{
    date_key: string
    cardplus_collaborator_id: string
    collaborator_name: string
    kind: string
    justified: boolean | null
  }>) {
    const kind = normalizeAttendanceKind(row.kind, Boolean(row.justified))
    map.set(`${row.cardplus_collaborator_id}:${row.date_key}`, kind)
    const nameKey = compactScheduleKey(row.collaborator_name)
    if (nameKey) map.set(`name:${nameKey}:${row.date_key}`, kind)
  }
  return map
}

export async function getAttendanceBoard(
  storeId: string,
  monthKeyInput: string | null,
  role: FlowRoleId
): Promise<AttendanceBoard> {
  if (!storeId) throw new Error('Escolha uma unidade para ver o quadro e os atestados.')
  const stores = await listStores(storeId)
  const store = stores[0]
  if (!store) throw new Error('Unidade é obrigatória.')
  const monthKey = resolveMonthKey(monthKeyInput)
  const last = String(lastDayOfMonth(monthKey)).padStart(2, '0')
  const client = getFlowAdminClient()
  const [dayRes, eventRes, employees] = await Promise.all([
    client
      .from('flow_attendance_days')
      .select('cardplus_store_id, date_key, operacao, vendedor, caixa, estoque, auxiliar')
      .eq('cardplus_store_id', storeId)
      .gte('date_key', `${monthKey}-01`)
      .lte('date_key', `${monthKey}-${last}`),
    client
      .from('flow_attendance_events')
      .select(EVENT_SELECT)
      .eq('cardplus_store_id', storeId)
      .gte('date_key', `${monthKey}-01`)
      .lte('date_key', `${monthKey}-${last}`)
      .order('created_at', { ascending: false }),
    listEmployees(storeId)
  ])

  let eventData = (eventRes.data ?? []) as EventRow[]
  let eventError = eventRes.error
  if (eventError && isMissingPhotosColumn(eventError)) {
    const fallback = await client
      .from('flow_attendance_events')
      .select(EVENT_SELECT_NO_PHOTOS)
      .eq('cardplus_store_id', storeId)
      .gte('date_key', `${monthKey}-01`)
      .lte('date_key', `${monthKey}-${last}`)
      .order('created_at', { ascending: false })
    eventData = (fallback.data ?? []) as EventRow[]
    eventError = fallback.error
  }

  if (dayRes.error || eventError) {
    const error = dayRes.error ?? eventError
    if (isMissingPhotosColumn(error)) throw missingAttendancePhotosSql()
    if (isMissingTable(error)) {
      return {
        monthKey,
        storeId,
        storeName: store.name,
        canEdit: canEditStoreDesk(role),
        tableMissing: true,
        days: emptyDays(monthKey),
        events: [],
        people: attendancePeople(employees, storeId)
      }
    }
    throw new Error(`Erro ao carregar atestados: ${error?.message ?? 'falha desconhecida'}`)
  }

  const events = eventData.map(toEvent)
  const byDate = new Map<string, { atestadoCount: number; faltaCount: number; bancoCount: number }>()
  for (const event of events) {
    const current = byDate.get(event.dateKey) ?? { atestadoCount: 0, faltaCount: 0, bancoCount: 0 }
    if (event.kind === 'ATESTADO') current.atestadoCount += 1
    else if (event.kind === 'BANCO_HORAS') current.bancoCount += 1
    else current.faltaCount += 1
    byDate.set(event.dateKey, current)
  }

  const headByDate = new Map<string, DayHeadcountRow>()
  for (const row of (dayRes.data ?? []) as DayHeadcountRow[]) {
    headByDate.set(row.date_key, row)
  }

  const days = emptyDays(monthKey).map((day) => {
    const counts = byDate.get(day.dateKey)
    const atestadoCount = counts?.atestadoCount ?? 0
    const faltaCount = counts?.faltaCount ?? 0
    const bancoCount = counts?.bancoCount ?? 0
    const headRow = headByDate.get(day.dateKey) ?? null
    return {
      dateKey: day.dateKey,
      atestadoCount,
      faltaCount,
      bancoCount,
      eventCount: atestadoCount + faltaCount + bancoCount,
      headcountFilled: Boolean(headRow),
      headcount: headcountFromRow(headRow)
    }
  })

  return {
    monthKey,
    storeId,
    storeName: store.name,
    canEdit: canEditStoreDesk(role),
    tableMissing: false,
    days,
    events,
    people: attendancePeople(employees, storeId)
  }
}

export async function upsertTeamHeadcount(input: TeamHeadcountWrite): Promise<void> {
  if (!input.storeId) throw new Error('Unidade é obrigatória.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) throw new Error('Data inválida.')
  const stores = await listStores(input.storeId)
  if (!stores[0]) throw new Error('Unidade não encontrada.')
  const byRole = new Map<TeamHeadcountRole, number>()
  for (const role of TEAM_HEADCOUNT_ROLES) byRole.set(role.id, 0)
  for (const row of input.counts ?? []) {
    if (!isTeamHeadcountRole(row.roleKey)) throw new Error('Cargo do quadro inválido.')
    byRole.set(row.roleKey, asCount(row.count))
  }
  const payload = {
    cardplus_store_id: input.storeId,
    date_key: input.dateKey,
    operacao: byRole.get('OPERACAO') ?? 0,
    vendedor: byRole.get('VENDEDOR') ?? 0,
    caixa: byRole.get('CAIXA') ?? 0,
    estoque: byRole.get('ESTOQUE') ?? 0,
    auxiliar: byRole.get('AUXILIAR') ?? 0,
    updated_at: new Date().toISOString()
  }
  const { error } = await getFlowAdminClient()
    .from('flow_attendance_days')
    .upsert(payload, { onConflict: 'cardplus_store_id,date_key' })
  if (error) {
    if (isMissingTable(error)) throw missingAttendanceSql()
    throw new Error(`Erro ao salvar o quadro do dia: ${error.message}`)
  }
  try {
    await getFlowAdminClient().from('flow_audit_logs').insert({
      action: 'attendance.day.upsert',
      entity_type: 'flow_attendance_days',
      entity_id: input.storeId,
      metadata: {
        date_key: input.dateKey,
        operacao: payload.operacao,
        vendedor: payload.vendedor,
        caixa: payload.caixa,
        estoque: payload.estoque,
        auxiliar: payload.auxiliar
      }
    })
  } catch (auditError) {
    log.warn('[attendance] auditoria do quadro não registrada', auditError)
  }
}

export async function upsertAttendanceEvent(
  input: AttendanceEventWrite,
  actorUserId: string
): Promise<AttendanceEvent> {
  if (!input.storeId) throw new Error('Unidade é obrigatória.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) throw new Error('Data inválida.')
  const kind = normalizeAttendanceKind(input.kind, Boolean(input.justified))
  if (!isAttendanceKind(kind)) throw new Error('Tipo de registro inválido.')
  await assertEmployeeInStore(input.collaboratorId, input.storeId)
  const people = await listEmployees(input.storeId)
  const person = people.find((item) => item.id === input.collaboratorId)
  if (!person || person.name.trim().toUpperCase() === 'CAIXA') {
    throw new Error('Colaborador não encontrado nesta unidade.')
  }
  const note = asNote(input.note)
  const photos = asPhotos(input.photos)
  const justified = attendanceKindIsJustified(kind)
  const createdByName = await actorDisplayName(actorUserId)
  const client = getFlowAdminClient()
  const now = new Date().toISOString()
  const body = {
    cardplus_store_id: input.storeId,
    date_key: input.dateKey,
    cardplus_collaborator_id: input.collaboratorId,
    collaborator_name: person.name.trim().slice(0, 120),
    kind,
    justified,
    note,
    photos,
    updated_at: now
  }

  if (input.id) {
    const { data, error } = await client
      .from('flow_attendance_events')
      .update(body)
      .eq('id', input.id)
      .eq('cardplus_store_id', input.storeId)
      .select(EVENT_SELECT)
      .maybeSingle()
    if (error) {
      if (isMissingPhotosColumn(error)) throw missingAttendancePhotosSql()
      if (isMissingTable(error)) throw missingAttendanceSql()
      if (error.code === '23505') throw new Error('Essa pessoa já tem um registro neste dia.')
      throw new Error(`Erro ao atualizar o registro: ${error.message}`)
    }
    if (!data) throw new Error('Registro não encontrado.')
    await auditEvent('attendance.event.upsert', input.storeId, input.dateKey, person.name, kind)
    return toEvent(data as EventRow)
  }

  const { data, error } = await client
    .from('flow_attendance_events')
    .upsert(
      { ...body, created_by: actorUserId, created_by_name: createdByName },
      { onConflict: 'cardplus_store_id,date_key,cardplus_collaborator_id' }
    )
    .select(EVENT_SELECT)
    .maybeSingle()
  if (error) {
    if (isMissingPhotosColumn(error)) throw missingAttendancePhotosSql()
    if (isMissingTable(error)) throw missingAttendanceSql()
    if (error.code === '23505') throw new Error('Essa pessoa já tem um registro neste dia.')
    throw new Error(`Erro ao registrar a ocorrência: ${error.message}`)
  }
  if (!data) throw new Error('Não foi possível salvar o registro.')
  await auditEvent('attendance.event.upsert', input.storeId, input.dateKey, person.name, kind)
  return toEvent(data as EventRow)
}

export async function deleteAttendanceEvent(id: string, storeId: string): Promise<void> {
  const { error } = await getFlowAdminClient()
    .from('flow_attendance_events')
    .delete()
    .eq('id', id)
    .eq('cardplus_store_id', storeId)
  if (error) {
    if (isMissingTable(error)) throw missingAttendanceSql()
    throw new Error(`Erro ao remover o registro: ${error.message}`)
  }
  try {
    await getFlowAdminClient().from('flow_audit_logs').insert({
      action: 'attendance.event.delete',
      entity_type: 'flow_attendance_events',
      entity_id: id,
      metadata: { cardplus_store_id: storeId }
    })
  } catch (auditError) {
    log.warn('[attendance] auditoria de exclusão não registrada', auditError)
  }
}

async function auditEvent(
  action: string,
  storeId: string,
  dateKey: string,
  name: string,
  kind: AttendanceKind
): Promise<void> {
  try {
    await getFlowAdminClient().from('flow_audit_logs').insert({
      action,
      entity_type: 'flow_attendance_events',
      entity_id: storeId,
      metadata: { date_key: dateKey, name, kind }
    })
  } catch (auditError) {
    log.warn('[attendance] auditoria não registrada', auditError)
  }
}
