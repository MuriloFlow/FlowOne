import {
  listStoreAccess as loadStoreAccess,
  upsertStoreAccess as saveStoreAccess,
  assertAccessUsernameAvailable,
  listEmployeeDirectory,
  deleteGlobalDeskAccount,
  linkedDeskAccountId,
  syncDeskAccountName
} from './access.ts'
import {
  assertEmployeeInStore,
  createEmployee as createEmployeeRow,
  deleteEmployee as deleteEmployeeRow,
  getCollaboratorOrNull,
  getEmployee as loadEmployee,
  getOverview as loadOverview,
  listStores as loadStores,
  updateEmployee as updateEmployeeRow,
  upsertDailySale as saveDailySale
} from './cardplus.ts'
import { getFinanceBoard, upsertFinanceDayExtras } from './finance-days.ts'
import {
  assertCardInStore,
  createCard as createCardRow,
  deleteCard as deleteCardRow,
  getCardsBoard as loadCardsBoard,
  transferCard as transferCardRow,
  updateCard as updateCardRow
} from './cards.ts'
import { applyOverviewCardOverlay, deleteCardTotalOverride, upsertCardTotalOverride } from './card-overrides.ts'
import { createStoreDesk, getStoreBoard, updateStoreDesk } from './stores.ts'
import { deleteIdentity, getIdentity, upsertIdentity } from './identities.ts'
import { deleteEmployeeDocument, getEmployeeDocument, saveEmployeeDocument } from './employee-documents.ts'
import { resolveActor, resolveStoreFilter } from './scope.ts'
import {
  getScheduleBoard as loadScheduleBoard,
  saveScheduleSlots as persistScheduleSlots,
  resetScheduleSlots as restoreScheduleSlots,
  upsertScheduleAssignment as saveScheduleAssignment,
  deleteScheduleAssignment as removeScheduleAssignment
} from './schedules.ts'
import {
  getAttendanceBoard as loadAttendanceBoard,
  upsertTeamHeadcount as saveTeamHeadcount,
  upsertAttendanceEvent as saveAttendanceEvent,
  deleteAttendanceEvent as removeAttendanceEvent
} from './attendance.ts'
import { deleteVoucher, listVoucherBoard, upsertVoucher } from './vouchers.ts'
import {
  addSorteioVale,
  deleteSorteioClient,
  listSorteioBoard,
  lookupSorteioClient,
  registerSorteioClient
} from './sorteio.ts'
import { listFlowUsers as loadFlowUsers, upsertFlowUser as saveFlowUser } from './users.ts'
import { sendKobbi } from './kobbi.ts'
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
} from './_shared/operations.ts'
import { CARDPLUS_SUB_ROLES, isManagerLoginSubRole } from './_shared/operations.ts'
import type { ScheduleAssignmentWrite, ScheduleSlotWrite, ScheduleTeam } from './_shared/schedules.ts'
import {
  isAttendanceKind,
  isTeamHeadcountRole,
  type AttendanceEventWrite,
  type TeamHeadcountRole,
  type TeamHeadcountWrite
} from './_shared/attendance.ts'
import { SCHEDULE_TEAMS } from './_shared/schedules.ts'
import { canCreateStores, canEditStoreDesk, canManageFlowUsers, isFlowRole } from './_shared/roles.ts'
import { normalizeStoreId } from './_shared/store-scope.ts'
import type { SorteioValeTypeId } from './_shared/sorteio.ts'
import log from './log.ts'

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

const OPS: Record<string, (payload: unknown) => Promise<unknown>> = {
  async getActorScope() {
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
  },

  async getOverview(payload) {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, payload)
    log.info('overview', storeId ?? 'all')
    return applyOverviewCardOverlay(await loadOverview(storeId), storeId)
  },

  async getFinance(payload) {
    const actor = await resolveActor()
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const storeId = resolveStoreFilter(actor, body)
    const monthKey = typeof body.monthKey === 'string' ? body.monthKey : null
    return getFinanceBoard(storeId, monthKey)
  },

  async listStores() {
    const actor = await resolveActor()
    if (!actor.canViewAll && !actor.boundStoreId) return []
    const storeId = actor.canViewAll ? null : actor.boundStoreId
    return loadStores(storeId)
  },

  async listEmployees(payload) {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, payload)
    return listEmployeeDirectory(storeId)
  },

  async getEmployee(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Funcionário é obrigatório.')
    const body = payload as Record<string, unknown>
    const storeId = resolveStoreFilter(actor, normalizeStoreId(body))
    const id = asString(body.id, 'Funcionário')
    return loadEmployee(id, storeId)
  },

  async getEmployeeIdentity(payload) {
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
  },

  async getEmployeeDocument(payload) {
    const actor = await resolveActor()
    const collaboratorId = typeof payload === 'string' ? asString(payload, 'Funcionário') : asString((payload as { id?: unknown })?.id, 'Funcionário')
    await assertEmployeeInStore(collaboratorId, resolveStoreFilter(actor, actor.canViewAll ? null : actor.boundStoreId))
    return getEmployeeDocument(collaboratorId)
  },

  async saveEmployeeDocument(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Documento inválido.')
    const body = payload as Record<string, unknown>
    const collaboratorId = asString(body.collaboratorId, 'Funcionário')
    await assertEmployeeInStore(collaboratorId, resolveStoreFilter(actor, actor.canViewAll ? null : actor.boundStoreId))
    return saveEmployeeDocument(collaboratorId, typeof body.rgImage === 'string' ? body.rgImage : null)
  },

  async createEmployee(payload) {
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
    const created = await createEmployeeRow(input)
    if (isManagerLoginSubRole(input.cardplusRole)) {
      await saveStoreAccess({
        storeId: input.storeId,
        username: parsed.accessUsername ?? '',
        password: parsed.accessPassword,
        displayName: parsed.accessDisplayName?.trim() || parsed.name,
        role: 'MANAGER'
      })
    }
    return created
  },

  async updateEmployee(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Dados inválidos.')
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
    const updated = await updateEmployeeRow(input)
    const deskId = await linkedDeskAccountId(input.name, input.id)
    if (deskId) {
      if (deskId !== updated.id) await upsertIdentity(deskId, input.cpf, input.flowRole)
      await syncDeskAccountName(deskId, input.name)
    }
    // Card+ é operacional. Só Usuários do FLOW pode alterar o perfil autenticado.
    return updated
  },

  async deleteEmployee(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Funcionário é obrigatório.')
    const body = payload as Record<string, unknown>
    const storeId = resolveStoreFilter(actor, normalizeStoreId(body))
    const id = asString(body.id, 'Funcionário')
    const collaborator = await getCollaboratorOrNull(id)
    const deskId = collaborator ? await linkedDeskAccountId(collaborator.name, collaborator.id) : id
    if (collaborator) {
      await deleteEmployeeRow(collaborator.id, storeId)
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
  },

  async listStoreBoard(payload) {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, payload)
    const board = await getStoreBoard(storeId)
    return {
      ...board,
      canCreate: canCreateStores(actor.role),
      canEdit: canEditStoreDesk(actor.role)
    }
  },

  async createStore(payload) {
    const actor = await resolveActor()
    if (!canCreateStores(actor.role)) {
      throw new Error('Apenas Supervisor, Diretor e Lider de Operação podem cadastrar unidades.')
    }
    return createStoreDesk(parseStoreWrite(payload, false))
  },

  async updateStore(payload) {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) {
      throw new Error('Você não pode editar esta unidade.')
    }
    const input = parseStoreWrite(payload, true)
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.id : null)
    if (scoped && input.id !== scoped) {
      throw new Error('Você só pode editar a sua unidade.')
    }
    return updateStoreDesk(input)
  },

  async listStoreAccess(payload) {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) {
      throw new Error('Você não pode gerenciar o login desta unidade.')
    }
    const storeId = asString((payload as { storeId?: unknown })?.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode gerenciar a sua unidade.')
    return loadStoreAccess(storeId)
  },

  async upsertStoreAccess(payload) {
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
    return saveStoreAccess(input)
  },

  async getCardsBoard(payload) {
    const actor = await resolveActor()
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const storeId = resolveStoreFilter(actor, body)
    const monthKey = typeof body.monthKey === 'string' ? body.monthKey : null
    const board = await loadCardsBoard(monthKey, storeId)
    return { ...board, canEdit: canEditStoreDesk(actor.role) }
  },

  async upsertCardMonthTotal(payload) {
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
    const board = await loadCardsBoard(input.monthKey, input.storeId)
    return { ...board, canEdit: true }
  },

  async createCard(payload) {
    const actor = await resolveActor()
    const input = assertCardAmounts(parseCardWrite(payload, false))
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped && input.storeId !== scoped) throw new Error('Você só pode registrar cartões da sua unidade.')
    return createCardRow(input)
  },

  async updateCard(payload) {
    const actor = await resolveActor()
    const input = assertCardAmounts(parseCardWrite(payload, true))
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scoped) await assertCardInStore(input.id ?? '', scoped)
    return updateCardRow(input)
  },

  async transferCard(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Dados da transferência inválidos.')
    const body = payload as Record<string, unknown>
    const id = asString(body.id, 'Cartão')
    const collaboratorId = asString(body.collaboratorId, 'Funcionário')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? null : actor.boundStoreId)
    if (scoped) await assertCardInStore(id, scoped)
    return transferCardRow(id, collaboratorId, scoped)
  },

  async deleteCard(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Cartão é obrigatório.')
    const body = payload as Record<string, unknown>
    const id = asString(body.id, 'Cartão')
    const scoped = resolveStoreFilter(actor, normalizeStoreId(body))
    await deleteCardRow(id, scoped)
  },

  async upsertDailySale(payload) {
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
    return saveDailySale(input)
  },

  async upsertFinanceDay(payload) {
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
    const saved = await saveDailySale({
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
    return saved
  },

  async getScheduleBoard(payload) {
    const actor = await resolveActor()
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const storeId = resolveStoreFilter(actor, body)
    if (!storeId) throw new Error('Escolha uma unidade para montar a escala.')
    const weekStart = typeof body.weekStart === 'string' ? body.weekStart : null
    return loadScheduleBoard(storeId, weekStart, actor.role, actor.userId)
  },

  async saveScheduleSlots(payload) {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode alterar os horários da escala.')
    if (!payload || typeof payload !== 'object') throw new Error('Horários inválidos.')
    const body = payload as Record<string, unknown>
    const storeId = asString(body.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode editar a escala da sua unidade.')
    const team = asScheduleTeam(body.team)
    const slots = Array.isArray(body.slots) ? (body.slots as ScheduleSlotWrite[]) : []
    await persistScheduleSlots(storeId, slots, team)
  },

  async resetScheduleSlots(payload) {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode alterar os horários da escala.')
    if (!payload || typeof payload !== 'object') throw new Error('Horários inválidos.')
    const body = payload as Record<string, unknown>
    const storeId = asString(body.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode editar a escala da sua unidade.')
    await restoreScheduleSlots(storeId, asScheduleTeam(body.team))
  },

  async upsertScheduleAssignment(payload) {
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
    await saveScheduleAssignment(input)
  },

  async deleteScheduleAssignment(payload) {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode montar a escala.')
    if (!payload || typeof payload !== 'object') throw new Error('Registro inválido.')
    const body = payload as Record<string, unknown>
    const id = asString(body.id, 'Escala')
    const storeId = asString(body.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode montar a escala da sua unidade.')
    await removeScheduleAssignment(id, storeId)
  },

  async getAttendanceBoard(payload) {
    const actor = await resolveActor()
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    const storeId = resolveStoreFilter(actor, body)
    if (!storeId) throw new Error('Escolha uma unidade para ver o quadro e os atestados.')
    const monthKey = typeof body.monthKey === 'string' ? body.monthKey : null
    return loadAttendanceBoard(storeId, monthKey, actor.role)
  },

  async upsertTeamHeadcount(payload) {
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
    await saveTeamHeadcount(input)
  },

  async upsertAttendanceEvent(payload) {
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
    return saveAttendanceEvent(input, actor.userId)
  },

  async deleteAttendanceEvent(payload) {
    const actor = await resolveActor()
    if (!canEditStoreDesk(actor.role)) throw new Error('Você não pode remover atestado ou falta.')
    if (!payload || typeof payload !== 'object') throw new Error('Registro inválido.')
    const body = payload as Record<string, unknown>
    const id = asString(body.id, 'Registro')
    const storeId = asString(body.storeId, 'Unidade')
    const scoped = resolveStoreFilter(actor, actor.canViewAll ? storeId : null)
    if (scoped && storeId !== scoped) throw new Error('Você só pode remover registros da sua unidade.')
    await removeAttendanceEvent(id, storeId)
  },

  async listVouchers(payload) {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, payload)
    return listVoucherBoard(storeId)
  },

  async updateVoucher(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Dados do vale inválidos.')
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
  },

  async lookupSorteioClient(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('CPF inválido.')
    const body = payload as Record<string, unknown>
    const storeId = resolveStoreFilter(actor, body.storeId ?? null)
    return lookupSorteioClient(asString(body.cpf, 'CPF'), storeId)
  },

  async listSorteioBoard(payload) {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, payload)
    return listSorteioBoard(storeId)
  },

  async registerSorteioClient(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Dados do cadastro inválidos.')
    const body = payload as Record<string, unknown>
    const storeId = resolveStoreFilter(actor, body.storeId ?? null) ?? asString(body.storeId, 'Unidade')
    return registerSorteioClient(
      {
        storeId,
        cpf: asString(body.cpf, 'CPF'),
        name: asString(body.name, 'Nome'),
        phone: asString(body.phone, 'Telefone'),
        valeType: asString(body.valeType, 'Tipo de vale') as SorteioValeTypeId,
        valeLabel: typeof body.valeLabel === 'string' ? body.valeLabel : null
      },
      actor.userId
    )
  },

  async addSorteioVale(payload) {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Dados do vale inválidos.')
    const body = payload as Record<string, unknown>
    const storeId = resolveStoreFilter(actor, body.storeId ?? null) ?? asString(body.storeId, 'Unidade')
    return addSorteioVale(
      {
        storeId,
        cpf: asString(body.cpf, 'CPF'),
        valeType: asString(body.valeType, 'Tipo de vale') as SorteioValeTypeId,
        valeLabel: typeof body.valeLabel === 'string' ? body.valeLabel : null
      },
      actor.userId
    )
  },

  async deleteSorteioClient(payload) {
    await resolveActor()
    if (!payload || typeof payload !== 'object') throw new Error('Cliente inválido.')
    const body = payload as Record<string, unknown>
    await deleteSorteioClient(asString(body.clientId, 'Cliente'))
  },

  async listFlowUsers() {
    const actor = await resolveActor()
    if (!canManageFlowUsers(actor.role)) {
      throw new Error('Só Lider de Operação, Supervisor e Diretor gerenciam acessos do FLOW.')
    }
    return loadFlowUsers()
  },

  async upsertFlowUser(payload) {
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
    return saveFlowUser(input, actor.userId, actor.role)
  },

  async kobbiSend(payload) {
    return sendKobbi(payload)
  }
}

export function implementedOps(): string[] {
  return Object.keys(OPS).sort()
}

export async function dispatchOp(op: string, payload: unknown): Promise<unknown> {
  const handler = OPS[op]
  if (!handler) {
    throw new Error(`Operação desconhecida: ${op}`)
  }
  return handler(payload)
}
