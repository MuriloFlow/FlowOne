import { ipcMain } from 'electron'
import log from 'electron-log'
import { listStoreAccess, upsertStoreAccess } from './access'
import {
  assertEmployeeInStore,
  createEmployee,
  deleteEmployee,
  getEmployee,
  getFinance,
  getOverview,
  listEmployees,
  listStores,
  updateEmployee
} from './cardplus'
import { assertCardInStore, createCard, deleteCard, getCardsBoard, transferCard, updateCard } from './cards'
import { createStoreDesk, getStoreBoard, updateStoreDesk } from './stores'
import { deleteIdentity, getIdentity } from './identities'
import { invalidateMemo, memo } from './memo'
import { resolveActor, resolveStoreFilter } from './scope'
import { readStorePreference, writeStorePreference } from './store-preference'
import { deleteVoucher, listVoucherBoard, upsertVoucher } from './vouchers'
import type {
  CardWriteInput,
  CreateEmployeeInput,
  EmployeeWriteInput,
  StoreAccessWriteInput,
  StoreWriteInput,
  UpdateEmployeeInput
} from '../shared/operations'
import { CARDPLUS_SUB_ROLES } from '../shared/operations'
import { canCreateStores, canEditStoreDesk, isFlowRole } from '../shared/roles'
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

function parseWriteInput(payload: unknown): EmployeeWriteInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Dados inválidos.')
  }
  const body = payload as Record<string, unknown>
  const cardplusRole = asString(body.cardplusRole, 'Função operacional')
  const flowRole = asString(body.flowRole, 'Cargo')
  if (!CARDPLUS_SUB_ROLES.includes(cardplusRole as (typeof CARDPLUS_SUB_ROLES)[number])) {
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
    isActive: typeof body.isActive === 'boolean' ? body.isActive : true
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
  handle('operations:overview', async (payload) => {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, normalizeStoreId(payload))
    log.info('[operations] overview', storeId ?? 'all')
    return memo(cacheKey('overview', storeId), 12_000, () => getOverview(storeId))
  })

  handle('operations:finance', async (payload) => {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, normalizeStoreId(payload))
    log.info('[operations] finance', storeId ?? 'all')
    return memo(cacheKey('finance', storeId), 12_000, () => getFinance(storeId))
  })

  handle('operations:stores', async () => {
    const actor = await resolveActor()
    const storeId = actor.canViewAll ? null : actor.boundStoreId
    return memo(cacheKey('stores', storeId), 30_000, () => listStores(storeId))
  })

  handle('operations:employees', async (payload) => {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, normalizeStoreId(payload))
    log.info('[operations] employees', storeId ?? 'all')
    return memo(cacheKey('employees', storeId), 12_000, () => listEmployees(storeId))
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
    const identity = await getIdentity(collaboratorId)
    return {
      collaboratorId,
      cpf: identity?.cpfDigits ?? null,
      flowRole: identity?.flowRole ?? null
    }
  })

  handle('operations:employee-create', async (payload) => {
    const actor = await resolveActor()
    const input = parseWriteInput(payload) satisfies CreateEmployeeInput
    const scopedStore = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scopedStore && input.storeId !== scopedStore) {
      throw new Error('Você só pode cadastrar funcionários da sua unidade.')
    }
    const created = await createEmployee(input)
    bustOperationsCache()
    return created
  })

  handle('operations:employee-update', async (payload) => {
    const actor = await resolveActor()
    if (!payload || typeof payload !== 'object') {
      throw new Error('Dados inválidos.')
    }
    const body = payload as Record<string, unknown>
    const input: UpdateEmployeeInput = {
      ...parseWriteInput(payload),
      id: asString(body.id, 'Funcionário')
    }
    const scopedStore = resolveStoreFilter(actor, actor.canViewAll ? input.storeId : null)
    if (scopedStore && input.storeId !== scopedStore) {
      throw new Error('Você só pode editar funcionários da sua unidade.')
    }
    const updated = await updateEmployee(input)
    bustOperationsCache()
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
    await deleteEmployee(id, storeId)
    await deleteIdentity(id)
    await deleteVoucher(id)
    bustOperationsCache()
  })

  handle('operations:store-board', async (payload) => {
    const actor = await resolveActor()
    const storeId = resolveStoreFilter(actor, normalizeStoreId(payload))
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
      throw new Error('Apenas Supervisor e Diretor podem cadastrar unidades.')
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
    const storeId = resolveStoreFilter(actor, normalizeStoreId(body))
    const monthKey = typeof body.monthKey === 'string' ? body.monthKey : null
    return memo(cacheKey(`cards:${monthKey ?? 'now'}`, storeId), 8_000, () => getCardsBoard(monthKey, storeId))
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
    const storeId = resolveStoreFilter(actor, normalizeStoreId(payload))
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
      status
    })
    bustOperationsCache()
  })
}
