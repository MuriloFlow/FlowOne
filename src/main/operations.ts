import { ipcMain } from 'electron'
import log from 'electron-log'
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
import { deleteIdentity, getIdentity } from './identities'
import { invalidateMemo, memo } from './memo'
import { resolveActor, resolveStoreFilter } from './scope'
import { readStorePreference, writeStorePreference } from './store-preference'
import { deleteVoucher, listVoucherBoard, upsertVoucher } from './vouchers'
import type {
  CreateEmployeeInput,
  EmployeeWriteInput,
  UpdateEmployeeInput
} from '../shared/operations'
import { CARDPLUS_SUB_ROLES } from '../shared/operations'
import { isFlowRole } from '../shared/roles'
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
  invalidateMemo('vouchers')
  invalidateMemo('employee')
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
