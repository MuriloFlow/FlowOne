import { ipcMain } from 'electron'
import log from 'electron-log'
import { listStoreAccess, upsertStoreAccess, assertAccessUsernameAvailable, listEmployeeDirectory, deleteGlobalDeskAccount, linkedDeskAccountId, syncDeskAccountName } from './access'
import {
  assertEmployeeInStore,
  createEmployee,
  deleteEmployee,
  getCollaboratorOrNull,
  getEmployee,
  getOverview,
  listStores,
  updateEmployee,
  upsertDailySale
} from './cardplus'
import { getFinanceBoard, upsertFinanceDayExtras } from './finance-days'
import { assertCardInStore, createCard, deleteCard, getCardsBoard, transferCard, updateCard } from './cards'
import { applyOverviewCardOverlay, deleteCardTotalOverride, upsertCardTotalOverride } from './card-overrides'
import { createStoreDesk, getStoreBoard, updateStoreDesk } from './stores'
import { deleteIdentity, getIdentity, syncProfileRoleIfSamePerson, upsertIdentity } from './identities'
import { deleteEmployeeDocument, getEmployeeDocument, saveEmployeeDocument } from './employee-documents'
import { invalidateMemo, memo } from './memo'
import { resolveActor, resolveStoreFilter } from './scope'
import { getScheduleBoard, saveScheduleSlots, resetScheduleSlots, upsertScheduleAssignment, deleteScheduleAssignment } from './schedules'
import { getAttendanceBoard, upsertTeamHeadcount, upsertAttendanceEvent, deleteAttendanceEvent } from './attendance'
import { readStorePreference, writeStorePreference } from './store-preference'
import { deleteVoucher, listVoucherBoard, upsertVoucher } from './vouchers'
import { listFlowUsers, upsertFlowUser } from './users'
import type {
  CardMonthTotalWrite,
  CardWriteInput,
  CreateEmployeeInput,
  DailySaleWriteInput,
  FinanceDayWriteInput,
  EmployeeWriteInput,
  FlowLauncherUserWrite,
  StoreAccessWriteInput,
  StoreWriteInput,
  UpdateEmployeeInput
} from '../shared/operations'
import { CARDPLUS_SUB_ROLES, isManagerLoginSubRole } from '../shared/operations'
import type {
  ScheduleAssignmentWrite,
  ScheduleSlotWrite,
  ScheduleTeam
} from '../shared/schedules'
import {
  isAttendanceKind,
  isTeamHeadcountRole,
  type AttendanceEventWrite,
  type TeamHeadcountRole,
  type TeamHeadcountWrite
} from '../shared/attendance'
import { SCHEDULE_TEAMS } from '../shared/schedules'
import { canCreateStores, canEditStoreDesk, canManageFlowUsers, isFlowRole } from '../shared/roles'
import { normalizeStoreId } from '../shared/store-scope'

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} é obrigatório.`)
  }
  return value.trim()
}

function asOptionalString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asScheduleTeam(value: unknown): ScheduleTeam {
  const id = typeof value === 'string' ? value : ''
  return SCHEDULE_TEAMS.some((item) => item.id === id) ? (id as ScheduleTeam) : 'OPERACAO'
}

function parseWriteInput(payload: unknown): EmployeeWriteInput & {
  accessUsername?: string
  accessPassword?: string
  accessDisplayName?: string
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Dados inválidos.')
  }
  const body = payload as Record<string, unknown>
  const cardplusRoleRaw = asString(body.cardplusRole, 'Função operacional')
  const cardplusRole = CARDPLUS_SUB_ROLES.find((role) => role.toLowerCase() === cardplusRoleRaw.toLowerCase())
  const flowRole = asString(body.flowRole, 'Cargo')
  if (!cardplusRole) {
    throw new Error('Função operacional inválida.')
  }
  if (!isFlowRole(flowRole)) {
    throw new Error('Cargo inválido.')
  }
  return {
    name: asString(body.name, 'Nome'),
    storeId: asString(body.storeId, 'Unidade'),
    cardplusRole,
    flowRole,
    cpf: asOptionalString(body.cpf),
    isActive: typeof body.isActive === 'boolean' ? body.isActive : true,
    accessUsername: asOptionalString(body.accessUsername),
    accessPassword: asOptionalString(body.accessPassword),
    accessDisplayName: asOptionalString(body.accessDisplayName)
  }
}

function handle(channel: string, listener: (payload: unknown) => Promise<unknown>): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, async (_event, payload: unknown) => {
    try {
      return await listener(payload)
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Não foi possível concluir esta operação.'
      log.warn(`[operations] ${channel}`, message)
      throw new Error(message)
    }
  })
}

function cacheKey(name: string, storeId?: string | null): string {
  return `${name}:${storeId ?? 'all'}`
}

function bustOperationsCache(): void {
  invalidateMemo('overview')
  invalidateMemo('finance')
  invalidateMemo('employees')
  invalidateMemo('stores')
  invalidateMemo('store-board')
  invalidateMemo('vouchers')
  invalidateMemo('employee')
  invalidateMemo('cards')
  invalidateMemo('access')
  invalidateMemo('schedule')
  invalidateMemo('attendance')
  invalidateMemo('actor')
  invalidateMemo('users')
}

function parseStoreWrite(payload: unknown, requireId: boolean): StoreWriteInput {
  if (!payload || typeof payload !== 'object') throw new Error('Dados da unidade inválidos.')
  const body = payload as Record<string, unknown>
  const managerIds = Array.isArray(body.managerIds)
    ? body.managerIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  return {
    id: requireId ? asString(body.id, 'Unidade') : typeof body.id === 'string' ? body.id : undefined,
    name: asString(body.name, 'Nome da unidade'),
    internalCode: asOptionalString(body.internalCode),
    notes: asOptionalString(body.notes),
    flagged: Boolean(body.flagged),
    managerIds,
    generalManagerId: typeof body.generalManagerId === 'string' ? body.generalManagerId : null,
    supervisorId: typeof body.supervisorId === 'string' ? body.supervisorId : null,
    operationLeadId: typeof body.operationLeadId === 'string' ? body.operationLeadId : null,
    accessUsername: asOptionalString(body.accessUsername),
    accessPassword: asOptionalString(body.accessPassword),
    accessDisplayName: asOptionalString(body.accessDisplayName)
  }
}

function parseCardWrite(payload: unknown, requireId: boolean): CardWriteInput {
  if (!payload || typeof payload !== 'object') throw new Error('Dados do cartão inválidos.')
  const body = payload as Record<string, unknown>
  return {
    id: requireId ? asString(body.id, 'Cartão') : typeof body.id === 'string' ? body.id : undefined,
    storeId: asString(body.storeId, 'Unidade'),
    collaboratorId: asString(body.collaboratorId, 'Funcionário'),
    clientName: asString(body.clientName, 'Cliente'),
    amountInCents: Number(body.amountInCents),
    amountUsedInCents: Number(body.amountUsedInCents ?? 0),
    activated: Boolean(body.activated),
    dateKey: typeof body.dateKey === 'string' ? body.dateKey : undefined
  }
}

function assertCardAmounts(input: CardWriteInput): CardWriteInput {
  if (!Number.isFinite(input.amountInCents) || input.amountInCents < 0) {
    throw new Error('Limite do cartão inválido.')
  }
  if (!Number.isFinite(input.amountUsedInCents) || input.amountUsedInCents < 0) {
    throw new Error('Valor gasto inválido.')
  }
  return input
}

export function registerOperationsIpc(): void {
  handle('operations:scope', async () => {
    const actor = await resolveActor()
    if (!actor.canViewAll && !actor.boundStoreId) {
      return {
        role: actor.role,
        canViewAll: false,
        storeId: null,
        blocked: true,
        message:
          'Sua conta ainda não tem uma unidade. Peça para um Lider de Operação, Supervisor ou Diretor te vincular em Usuários.'
      }
    }
    return {
      role: actor.role,
      canViewAll: actor.canViewAll,
      storeId: actor.boundStoreId,
      blocked: false,
      message: null
    }
  })

  handle('operations:overview', async (payload) => {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, payload)
    log.info('[operations] overview', storeId ?? 'all')
    return memo(cacheKey('overview', storeId), 12_000, async () =>
      applyOverviewCardOverlay(await getOverview(storeId), storeId)
    )
  })

  handle('operations:finance', async (payload) => {
    const actor = await resolveActor()
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const storeId = resolveStoreFilter(actor, body)
    const monthKey = typeof body.monthKey === 'string' ? body.monthKey : null
    log.info('[operations] finance', storeId ?? 'all', monthKey ?? 'now')
    return memo(cacheKey(`finance:${monthKey ?? 'now'}`, storeId), 12_000, () => getFinanceBoard(storeId, monthKey))
  })

  handle('operations:stores', async () => {
    const actor = await resolveActor()
    if (!actor.canViewAll && !actor.boundStoreId) return []
    const storeId = actor.canViewAll ? null : actor.boundStoreId
    return memo(cacheKey('stores', storeId), 30_000, () => listStores(storeId))
  })

  handle('operations:employees', async (payload) => {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, payload)
    log.info('[operations] employees', storeId ?? 'all')
    return memo(cacheKey('employees', storeId), 12_000, () => listEmployeeDirectory(storeId))
  })

  handle('operations:employee', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') {
      throw new Error('Funcionário é obrigatório.')
    }
    const body = payload as Record<string, unknown>
    const storeId = resolveStoreFilter(actor, normalizeStoreId(body))
    const id = asString(body.id, 'Funcionário')
    return memo(cacheKey(`employee:${id}`, storeId), 10_000, () => getEmployee(id, storeId))
  })

  handle('operations:employee-identity', async (payload) => {
    await resolveActor()
    const collaboratorId =
      typeof payload === 'string' ? asString(payload, 'Funcionário') : asString((payload as { id?: unknown })?.id, 'Funcionário')
    let identity = await getIdentity(collaboratorId)
    const deskId = await linkedDeskAccountId('', collaboratorId)
    if (deskId && deskId !== collaboratorId) {
      const deskIdentity = await getIdentity(deskId)
      if (deskIdentity?.flowRole && !identity?.flowRole) identity = deskIdentity
      if (deskIdentity?.cpfDigits && !identity?.cpfDigits) {
        identity = {
          collaboratorId,
          cpfDigits: deskIdentity.cpfDigits,
          flowRole: identity?.flowRole ?? deskIdentity.flowRole
        }
      }
    }
    return {
      collaboratorId,
      cpf: identity?.cpfDigits ?? null,
      flowRole: identity?.flowRole ?? null
    }
  })

  handle('operations:employee-document', async (payload) => {
    const actor = await resolveActor()
    const collaboratorId = typeof payload === 'string' ? asString(payload, 'Funcionário') : asString((payload as { id?: unknown })?.id, 'Funcionário')
    await assertEmployeeInStore(collaboratorId, resolveStoreFilter(actor, actor.canViewAll ? null : actor.boundStoreId))
    return getEmployeeDocument(collaboratorId)
  })

  handle('operations:employee-document-save', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Documento inválido.')
    const body = payload as Record<string, unknown>
    const collaboratorId = asString(body.collaboratorId, 'Funcionário')
    await assertEmployeeInStore(collaboratorId, resolveStoreFilter(actor, actor.canViewAll ? null : actor.boundStoreId))
    const image = typeof body.rgImage === 'string' ? body.rgImage : null
    const saved = await saveEmployeeDocument(collaboratorId, image)
    bustOperationsCache()
    return saved
  })

  handle('operations:employee-create', async (payload) => {
    const actor = await resolveActor()
    const parsed = parseWriteInput(payload)
    const input = {
      name: parsed.name,
      storeId: parsed.storeId,
      cardplusRole: parsed.cardplusRole,
      flowRole: parsed.flowRole,
      cpf: parsed.cpf
    } satisfies CreateEmployeeInput
    const scopedStore = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scopedStore && input.storeId !== scopedStore) {
      throw new Error('Você só pode cadastrar funcionários da sua unidade.')
    }
    if (isManagerLoginSubRole(input.cardplusRole)) {
      const username = parsed.accessUsername?.trim() ?? ''
      const password = parsed.accessPassword?.trim() ?? ''
      if (!username || !password) {
        throw new Error('Informe o login e a senha do Card+ para Gerente ou Gerente Geral.')
      }
      if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
      await assertAccessUsernameAvailable(username)
    }
    const created = await createEmployee(input)
    if (isManagerLoginSubRole(input.cardplusRole)) {
      await upsertStoreAccess({
        storeId: input.storeId,
        username: parsed.accessUsername ?? '',
        password: parsed.accessPassword,
        displayName: parsed.accessDisplayName?.trim() || parsed.name,
        role: 'MANAGER'
      })
    }
    bustOperationsCache()
    return created
  })

  handle('operations:employee-update', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') {
      throw new Error('Dados inválidos.')
    }
    const body = payload as Record<string, unknown>
    const parsed = parseWriteInput(payload)
    const input: UpdateEmployeeInput = {
      name: parsed.name,
      storeId: parsed.storeId,
      cardplusRole: parsed.cardplusRole,
      flowRole: parsed.flowRole,
      cpf: parsed.cpf,
      isActive: parsed.isActive,
      id: asString(body.id, 'Funcionário')
    }
    const scopedStore = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scopedStore && input.storeId !== scopedStore) {
      throw new Error('Você só pode editar funcionários da sua unidade.')
    }
    const updated = await updateEmployee(input)
    const deskId = await linkedDeskAccountId(input.name, input.id)
    if (deskId) {
      if (deskId !== updated.id) await upsertIdentity(deskId, input.cpf, input.flowRole)
      await syncDeskAccountName(deskId, input.name)
    }
    await syncProfileRoleIfSamePerson(actor.userId, input.name, input.flowRole, {
      isGlobalDesk: Boolean(deskId) || Boolean(updated.isGlobalDesk)
    })
    bustOperationsCache()
    invalidateMemo('actor')
    return updated
  })

  handle('operations:employee-delete', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') {
      throw new Error('Funcionário é obrigatório.')
    }
    const body = payload as Record<string, unknown>
    const storeId = resolveStoreFilter(actor, normalizeStoreId(body))
    const id = asString(body.id, 'Funcionário')
    const collaborator = await getCollaboratorOrNull(id)
    const deskId = collaborator ? await linkedDeskAccountId(collaborator.name, collaborator.id) : id
    if (collaborator) {
      await deleteEmployee(collaborator.id, storeId)
      await deleteIdentity(collaborator.id)
      await deleteVoucher(collaborator.id)
      await deleteEmployeeDocument(collaborator.id)
    }
    if (deskId && deskId !== collaborator?.id) {
      await deleteGlobalDeskAccount(deskId)
      await deleteIdentity(deskId)
      await deleteVoucher(deskId)
      await deleteEmployeeDocument(deskId)
    } else if (!collaborator) {
      await deleteGlobalDeskAccount(id)
      await deleteIdentity(id)
      await deleteVoucher(id)
      await deleteEmployeeDocument(id)
    }
    bustOperationsCache()
  })

  handle('operations:store-board', async (payload) => {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, payload)
    const board = await memo(cacheKey('store-board', storeId), 10_000, () => getStoreBoard(storeId))
    return {
      ...board,
      canCreate: canCreateStores(actor.role),
      canEdit: canEditStoreDesk(actor.role)
    }
  })

  handle('operations:store-create', async (payload) => {
    const actor = await resolveActor()
    if (!canCreateStores(actor.role)) {
      throw new Error('Apenas Supervisor, Diretor e Lider de Operação podem cadastrar unidades.')
    }
    const created = await createStoreDesk(parseStoreWrite(payload, false))
    bustOperationsCache()
    return created
  })

  handle('operations:store-update', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) {
      throw new Error('Você não pode editar esta unidade.')
    }
    const input = parseStoreWrite(payload, true)
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.id : null)
    if (scoped && input.id !== scoped) {
      throw new Error('Você só pode editar a sua unidade.')
    }
    const updated = await updateStoreDesk(input)
    bustOperationsCache()
    return updated
  })

  handle('operations:store-access', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) {
      throw new Error('Você não pode gerenciar o login desta unidade.')
    }
    const storeId = asString((payload as { storeId?: unknown })?.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode gerenciar a sua unidade.')
    return memo(cacheKey(`access:${storeId}`, storeId), 8_000, () => listStoreAccess(storeId))
  })

  handle('operations:store-access-upsert', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) {
      throw new Error('Você não pode gerenciar o login desta unidade.')
    }
    if (!payload || typeof payload !== 'object') throw new Error('Dados do acesso inválidos.')
    const body = payload as Record<string, unknown>
    const input: StoreAccessWriteInput = {
      storeId: asString(body.storeId, 'Unidade'),
      id: typeof body.id === 'string' ? body.id : undefined,
      username: asString(body.username, 'Login'),
      displayName: asOptionalString(body.displayName),
      password: asOptionalString(body.password),
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined
    }
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped && input.storeId !== scoped) throw new Error('Você só pode gerenciar a sua unidade.')
    const saved = await upsertStoreAccess(input)
    bustOperationsCache()
    return saved
  })

  handle('operations:cards', async (payload) => {
    const actor = await resolveActor()
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const storeId = resolveStoreFilter(actor, body)
    const monthKey = typeof body.monthKey === 'string' ? body.monthKey : null
    log.info('[operations] cards', storeId ?? 'all', monthKey ?? 'now')
    const board = await memo(cacheKey(`cards:${monthKey ?? 'now'}`, storeId), 8_000, () =>
      getCardsBoard(monthKey, storeId)
    )
    return { ...board, canEdit: canEditStoreDesk(actor.role) }
  })

  handle('operations:card-month-total', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) {
      throw new Error('Você não pode ajustar o total de cartões desta unidade.')
    }
    if (!payload || typeof payload !== 'object') throw new Error('Dados do ajuste inválidos.')
    const body = payload as Record<string, unknown>
    const input: CardMonthTotalWrite = {
      storeId: asString(body.storeId, 'Unidade'),
      monthKey: asString(body.monthKey, 'Mês'),
      total: body.total === null || body.total === undefined ? null : Number(body.total),
      note: typeof body.note === 'string' ? body.note : null
    }
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped && input.storeId !== scoped) {
      throw new Error('Você só pode ajustar o total da sua unidade.')
    }
    if (input.total === null) {
      await deleteCardTotalOverride(input.storeId, input.monthKey)
    } else {
      await upsertCardTotalOverride({
        storeId: input.storeId,
        monthKey: input.monthKey,
        total: input.total,
        note: input.note,
        actorUserId: actor.userId
      })
    }
    bustOperationsCache()
    const board = await getCardsBoard(input.monthKey, input.storeId)
    return { ...board, canEdit: true }
  })

  handle('operations:card-create', async (payload) => {
    const actor = await resolveActor()
    const input = assertCardAmounts(parseCardWrite(payload, false))
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped && input.storeId !== scoped) throw new Error('Você só pode registrar cartões da sua unidade.')
    const created = await createCard(input)
    bustOperationsCache()
    return created
  })

  handle('operations:card-update', async (payload) => {
    const actor = await resolveActor()
    const input = assertCardAmounts(parseCardWrite(payload, true))
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped) await assertCardInStore(input.id ?? '', scoped)
    const updated = await updateCard(input)
    bustOperationsCache()
    return updated
  })

  handle('operations:card-transfer', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Dados da transferência inválidos.')
    const body = payload as Record<string, unknown>
    const id = asString(body.id, 'Cartão')
    const collaboratorId = asString(body.collaboratorId, 'Funcionário')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? null : actor.boundStoreId)
    if (scoped) await assertCardInStore(id, scoped)
    const updated = await transferCard(id, collaboratorId, scoped)
    bustOperationsCache()
    return updated
  })

  handle('operations:card-delete', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Cartão é obrigatório.')
    const body = payload as Record<string, unknown>
    const id = asString(body.id, 'Cartão')
    const scoped = resolveStoreFilter(actor, normalizeStoreId(body))
    await deleteCard(id, scoped)
    bustOperationsCache()
  })

  handle('operations:daily-sale-upsert', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Dados da venda inválidos.')
    const body = payload as Record<string, unknown>
    const input: DailySaleWriteInput = {
      storeId: asString(body.storeId, 'Unidade'),
      dateKey: asString(body.dateKey, 'Data'),
      amountInCents: Number(body.amountInCents)
    }
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped && input.storeId !== scoped) throw new Error('Você só pode registrar venda da sua unidade.')
    const saved = await upsertDailySale(input)
    bustOperationsCache()
    return saved
  })

  handle('operations:finance-day-upsert', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Dados do dia inválidos.')
    const body = payload as Record<string, unknown>
    const input: FinanceDayWriteInput = {
      storeId: asString(body.storeId, 'Unidade'),
      dateKey: asString(body.dateKey, 'Data'),
      amountInCents: Number(body.amountInCents),
      goalCents: body.goalCents === null || body.goalCents === undefined ? null : Number(body.goalCents),
      lastYearCents: body.lastYearCents === null || body.lastYearCents === undefined ? null : Number(body.lastYearCents),
      pu: body.pu === null || body.pu === undefined ? null : Number(body.pu)
    }
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped && input.storeId !== scoped) throw new Error('Você só pode registrar o dia da sua unidade.')
    const saved = await upsertDailySale({
      storeId: input.storeId,
      dateKey: input.dateKey,
      amountInCents: input.amountInCents
    })
    await upsertFinanceDayExtras({
      storeId: input.storeId,
      dateKey: input.dateKey,
      goalCents: input.goalCents,
      lastYearCents: input.lastYearCents,
      pu: input.pu
    })
    bustOperationsCache()
    return saved
  })

  handle('operations:schedule', async (payload) => {
    const actor = await resolveActor()
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const storeId = resolveStoreFilter(actor, body)
    if (!storeId) throw new Error('Escolha uma unidade para montar a escala.')
    const weekStart = typeof body.weekStart === 'string' ? body.weekStart : null
    const board = await getScheduleBoard(storeId, weekStart, actor.role, actor.userId)
    if (board.actorOperator?.included) bustOperationsCache()
    return board
  })

  handle('operations:schedule-slots', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode alterar os horários da escala.')
    if (!payload || typeof payload !== 'object') throw new Error('Horários inválidos.')
    const body = payload as Record<string, unknown>
    const storeId = asString(body.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode editar a escala da sua unidade.')
    const team = asScheduleTeam(body.team)
    if (body.action === 'reset') {
      await resetScheduleSlots(storeId, team)
      bustOperationsCache()
      return
    }
    const slots = Array.isArray(body.slots) ? (body.slots as ScheduleSlotWrite[]) : []
    await saveScheduleSlots(storeId, slots, team)
    bustOperationsCache()
  })

  handle('operations:schedule-assign', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode montar a escala.')
    if (!payload || typeof payload !== 'object') throw new Error('Encaixe inválido.')
    const body = payload as Record<string, unknown>
    const input: ScheduleAssignmentWrite = {
      id: typeof body.id === 'string' ? body.id : undefined,
      storeId: asString(body.storeId, 'Unidade'),
      weekStart: asString(body.weekStart, 'Semana'),
      slotId: asString(body.slotId, 'Horário'),
      collaboratorId: asString(body.collaboratorId, 'Funcionário'),
      note: typeof body.note === 'string' ? body.note : null
    }
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped && input.storeId !== scoped) throw new Error('Você só pode montar a escala da sua unidade.')
    await upsertScheduleAssignment(input)
    bustOperationsCache()
  })

  handle('operations:schedule-unassign', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode montar a escala.')
    if (!payload || typeof payload !== 'object') throw new Error('Registro inválido.')
    const body = payload as Record<string, unknown>
    const id = asString(body.id, 'Escala')
    const storeId = asString(body.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode montar a escala da sua unidade.')
    await deleteScheduleAssignment(id, storeId)
    bustOperationsCache()
  })

  handle('operations:attendance', async (payload) => {
    const actor = await resolveActor()
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const storeId = resolveStoreFilter(actor, body)
    if (!storeId) throw new Error('Escolha uma unidade para ver o quadro e os atestados.')
    const monthKey = typeof body.monthKey === 'string' ? body.monthKey : null
    return memo(cacheKey(`attendance:${monthKey ?? 'now'}`, storeId), 8_000, () =>
      getAttendanceBoard(storeId, monthKey, actor.role)
    )
  })

  handle('operations:headcount-upsert', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode editar o quadro desta unidade.')
    if (!payload || typeof payload !== 'object') throw new Error('Quadro inválido.')
    const body = payload as Record<string, unknown>
    const storeId = asString(body.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode editar o quadro da sua unidade.')
    const counts = Array.isArray(body.counts)
      ? body.counts.map((row) => {
          if (!row || typeof row !== 'object') throw new Error('Cargo do quadro inválido.')
          const item = row as Record<string, unknown>
          const roleKey = asString(item.roleKey, 'Cargo')
          if (!isTeamHeadcountRole(roleKey)) throw new Error('Cargo do quadro inválido.')
          return { roleKey: roleKey as TeamHeadcountRole, count: Number(item.count) }
        })
      : []
    const input: TeamHeadcountWrite = {
      storeId,
      dateKey: asString(body.dateKey, 'Data'),
      counts
    }
    await upsertTeamHeadcount(input)
    bustOperationsCache()
  })

  handle('operations:attendance-upsert', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode registrar ocorrência.')
    if (!payload || typeof payload !== 'object') throw new Error('Registro inválido.')
    const body = payload as Record<string, unknown>
    const kindRaw = asString(body.kind, 'Tipo')
    if (!isAttendanceKind(kindRaw)) throw new Error('Tipo de registro inválido.')
    const input: AttendanceEventWrite = {
      id: typeof body.id === 'string' ? body.id : undefined,
      storeId: asString(body.storeId, 'Unidade'),
      dateKey: asString(body.dateKey, 'Data'),
      collaboratorId: asString(body.collaboratorId, 'Colaborador'),
      kind: kindRaw,
      justified: typeof body.justified === 'boolean' ? body.justified : undefined,
      note: typeof body.note === 'string' ? body.note : null,
      photos: Array.isArray(body.photos)
        ? body.photos.filter((item): item is string => typeof item === 'string')
        : undefined
    }
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped && input.storeId !== scoped) {
      throw new Error('Você só pode registrar atestado ou falta da sua unidade.')
    }
    const saved = await upsertAttendanceEvent(input, actor.userId)
    bustOperationsCache()
    return saved
  })

  handle('operations:attendance-delete', async (payload) => {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode remover atestado ou falta.')
    if (!payload || typeof payload !== 'object') throw new Error('Registro inválido.')
    const body = payload as Record<string, unknown>
    const id = asString(body.id, 'Registro')
    const storeId = asString(body.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode remover registros da sua unidade.')
    await deleteAttendanceEvent(id, storeId)
    bustOperationsCache()
  })

  handle('operations:store-preference', async (payload) => {
    await resolveActor()
    if (!payload || typeof payload !== 'object') return readStorePreference()
    const body = payload as Record<string, unknown>
    if (body.action === 'write') {
      writeStorePreference(normalizeStoreId(body.storeId))
    }
    return readStorePreference()
  })

  handle('operations:vouchers', async (payload) => {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, payload)
    return memo(cacheKey('vouchers', storeId), 8_000, () => listVoucherBoard(storeId))
  })

  handle('operations:voucher-update', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') {
      throw new Error('Dados do vale inválidos.')
    }
    const body = payload as Record<string, unknown>
    const collaboratorId = asString(body.collaboratorId, 'Funcionário')
    await assertEmployeeInStore(
      collaboratorId,
      resolveStoreFilter(actor, actor.canViewAll ? null : actor.boundStoreId)
    )
    const status = body.status === 'PAGO' || body.status === 'PENDENTE' ? body.status : undefined
    await upsertVoucher(collaboratorId, {
      lunchCents: typeof body.lunchCents === 'number' ? body.lunchCents : undefined,
      transportCents: typeof body.transportCents === 'number' ? body.transportCents : undefined,
      status,
      signature: typeof body.signature === 'string' ? body.signature : undefined
    })
    bustOperationsCache()
  })

  handle('operations:users', async () => {
    const actor = await resolveActor()
    if (!canManageFlowUsers(actor.role)) {
      throw new Error('Só Lider de Operação, Supervisor e Diretor gerenciam acessos do FLOW.')
    }
    return memo(cacheKey('users', 'all'), 8_000, () => listFlowUsers())
  })

  handle('operations:user-upsert', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Dados do acesso inválidos.')
    const body = payload as Record<string, unknown>
    const input: FlowLauncherUserWrite = {
      id: typeof body.id === 'string' ? body.id : undefined,
      email: asString(body.email, 'E-mail'),
      displayName: asString(body.displayName, 'Nome'),
      role: asString(body.role, 'Cargo'),
      password: typeof body.password === 'string' ? body.password : undefined,
      storeId: typeof body.storeId === 'string' ? body.storeId : null,
      status: body.status === 'inactive' ? 'inactive' : 'active'
    }
    const saved = await upsertFlowUser(input, actor.userId, actor.role)
    bustOperationsCache()
    return saved
  })
}
