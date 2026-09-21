import type { OperationsApi } from '../../../shared/operations'
import { getCurrentStoreId } from '@/lib/store-scope'

function staleLauncher(): Error {
  return new Error('Feche o FLOW por completo e abra de novo para atualizar o launcher.')
}

function invokeOperation<T>(name: keyof OperationsApi, channel: string, payload?: unknown): Promise<T> {
  const api = window.flow?.operations as Record<string, unknown> | undefined
  const direct = api?.[name]
  if (typeof direct === 'function') {
    return payload === undefined
      ? (direct as () => Promise<T>)()
      : (direct as (value: unknown) => Promise<T>)(payload)
  }
  const invoke = window.flow?.invoke
  if (typeof invoke === 'function') {
    return invoke(channel, payload) as Promise<T>
  }
  throw staleLauncher()
}

export function operations(): OperationsApi {
  if (!window.flow?.operations) {
    throw new Error('Operações do launcher indisponíveis.')
  }
  const api = window.flow.operations
  return {
    getOverview: (storeId) => api.getOverview(storeId === undefined ? getCurrentStoreId() : storeId),
    getFinance: (storeId, monthKey) =>
      api.getFinance(storeId === undefined ? getCurrentStoreId() : storeId, monthKey),
    listStores: () => api.listStores(),
    listEmployees: (storeId) => api.listEmployees(storeId === undefined ? getCurrentStoreId() : storeId),
    getEmployee: (id, storeId) =>
      api.getEmployee(id, storeId === undefined ? getCurrentStoreId() : storeId),
    getEmployeeIdentity: (id) => api.getEmployeeIdentity(id),
    getEmployeeDocument: (id) => invokeOperation('getEmployeeDocument', 'operations:employee-document', { id }),
    saveEmployeeDocument: (input) =>
      invokeOperation('saveEmployeeDocument', 'operations:employee-document-save', input),
    createEmployee: (input) => api.createEmployee(input),
    updateEmployee: (input) => api.updateEmployee(input),
    deleteEmployee: (id, storeId) =>
      api.deleteEmployee(id, storeId === undefined ? getCurrentStoreId() : storeId),
    getStorePreference: () => api.getStorePreference(),
    setStorePreference: (storeId) => api.setStorePreference(storeId),
    listStoreBoard: (storeId) => api.listStoreBoard(storeId === undefined ? getCurrentStoreId() : storeId),
    createStore: (input) => api.createStore(input),
    updateStore: (input) => api.updateStore(input),
    listStoreAccess: (storeId) => api.listStoreAccess(storeId),
    upsertStoreAccess: (input) => api.upsertStoreAccess(input),
    getCardsBoard: (monthKey, storeId) =>
      api.getCardsBoard(monthKey, storeId === undefined ? getCurrentStoreId() : storeId),
    upsertCardMonthTotal: (input) => {
      const api = window.flow?.operations
      if (typeof api?.upsertCardMonthTotal === 'function') {
        return api.upsertCardMonthTotal(input)
      }
      return invokeOperation('upsertCardMonthTotal', 'operations:card-month-total', input)
    },
    createCard: (input) => api.createCard(input),
    updateCard: (input) => api.updateCard(input),
    transferCard: (id, collaboratorId) => api.transferCard(id, collaboratorId),
    deleteCard: (id) => api.deleteCard(id),
    upsertDailySale: (input) => api.upsertDailySale(input),
    upsertFinanceDay: (input) => api.upsertFinanceDay(input),
    getScheduleBoard: (storeId, weekStart) =>
      api.getScheduleBoard(storeId === undefined ? getCurrentStoreId() : storeId, weekStart),
    saveScheduleSlots: (storeId, slots, team) => api.saveScheduleSlots(storeId, slots, team),
    resetScheduleSlots: (storeId, team) => api.resetScheduleSlots(storeId, team),
    upsertScheduleAssignment: (input) => api.upsertScheduleAssignment(input),
    deleteScheduleAssignment: (id, storeId) => api.deleteScheduleAssignment(id, storeId),
    getAttendanceBoard: (storeId, monthKey) => {
      const resolved = storeId === undefined ? getCurrentStoreId() : storeId
      const api = window.flow?.operations
      if (typeof api?.getAttendanceBoard === 'function') {
        return api.getAttendanceBoard(resolved, monthKey)
      }
      return invokeOperation('getAttendanceBoard', 'operations:attendance', {
        storeId: resolved,
        monthKey: monthKey ?? null
      })
    },
    upsertTeamHeadcount: (input) => {
      const api = window.flow?.operations
      if (typeof api?.upsertTeamHeadcount === 'function') {
        return api.upsertTeamHeadcount(input)
      }
      return invokeOperation('upsertTeamHeadcount', 'operations:headcount-upsert', input)
    },
    upsertAttendanceEvent: (input) => {
      const api = window.flow?.operations
      if (typeof api?.upsertAttendanceEvent === 'function') {
        return api.upsertAttendanceEvent(input)
      }
      return invokeOperation('upsertAttendanceEvent', 'operations:attendance-upsert', input)
    },
    deleteAttendanceEvent: (id, storeId) => {
      const api = window.flow?.operations
      if (typeof api?.deleteAttendanceEvent === 'function') {
        return api.deleteAttendanceEvent(id, storeId)
      }
      return invokeOperation('deleteAttendanceEvent', 'operations:attendance-delete', { id, storeId })
    },
    listVouchers: (storeId) => api.listVouchers(storeId === undefined ? getCurrentStoreId() : storeId),
    updateVoucher: (input) => api.updateVoucher(input),
    lookupSorteioClient: (cpf, storeId) => {
      const resolved = storeId === undefined ? getCurrentStoreId() : storeId
      if (typeof api.lookupSorteioClient === 'function') {
        return api.lookupSorteioClient(cpf, resolved)
      }
      return invokeOperation('lookupSorteioClient', 'operations:sorteio-lookup', { cpf, storeId: resolved })
    },
    listSorteioBoard: (storeId) => {
      const resolved = storeId === undefined ? getCurrentStoreId() : storeId
      if (typeof api.listSorteioBoard === 'function') {
        return api.listSorteioBoard(resolved)
      }
      return invokeOperation('listSorteioBoard', 'operations:sorteio-board', { storeId: resolved })
    },
    registerSorteioClient: (input) => {
      const payload = { ...input, storeId: input.storeId || getCurrentStoreId() || input.storeId }
      if (typeof api.registerSorteioClient === 'function') {
        return api.registerSorteioClient(payload)
      }
      return invokeOperation('registerSorteioClient', 'operations:sorteio-register', payload)
    },
    addSorteioVale: (input) => {
      const payload = { ...input, storeId: input.storeId || getCurrentStoreId() || input.storeId }
      if (typeof api.addSorteioVale === 'function') {
        return api.addSorteioVale(payload)
      }
      return invokeOperation('addSorteioVale', 'operations:sorteio-add-vale', payload)
    },
    deleteSorteioClient: (clientId) => {
      if (typeof api.deleteSorteioClient === 'function') {
        return api.deleteSorteioClient(clientId)
      }
      return invokeOperation('deleteSorteioClient', 'operations:sorteio-delete', { clientId })
    },
    listFlowUsers: () => invokeOperation('listFlowUsers', 'operations:users'),
    upsertFlowUser: (input) => invokeOperation('upsertFlowUser', 'operations:user-upsert', input),
    getActorScope: () => invokeOperation('getActorScope', 'operations:scope')
  }
}

export function isMissingStoreScope(error: unknown): boolean {
  const message = operationError(error)
  return /ainda não tem uma unidade|não está vinculada a uma unidade/i.test(message)
}

export function operationError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const cleaned = raw
    .replace(/^Error invoking remote method '[^']+':\s*/gi, '')
    .replace(/^Error:\s*/gi, '')
    .trim()
  if (/não está vinculada a uma unidade|ainda não tem uma unidade/i.test(cleaned)) {
    return 'Sua conta ainda não tem uma unidade. Peça para um Lider de Operação, Supervisor ou Diretor te vincular em Usuários — ou use um cargo com acesso à rede toda.'
  }
  if (/sessão inválida/i.test(cleaned)) return 'Sua sessão expirou. Entre de novo no FLOW.'
  if (/is not a function|feche o flow por completo/i.test(cleaned)) {
    return 'Feche o FLOW por completo e abra de novo. A aba Usuários precisa desta atualização do launcher.'
  }
  if (/failed to fetch|fetch failed|network|econnreset|etimedout|enotfound|sem conexão com o flow/i.test(cleaned)) {
    return 'Sem conexão com o FLOW agora. Confira a internet e tente de novo.'
  }
  if (/share canceled|sharing canceled|cancelad/i.test(cleaned)) {
    return ''
  }
  if (/plugin is not implemented|UNIMPLEMENTED|only file urls|unsupported url|não foi possível salvar o arquivo|não foi possível preparar o arquivo|não foi possível gerar a imagem|não foi possível montar o recibo|tempo esgotado ao carregar/i.test(cleaned)) {
    return 'Não foi possível exportar no celular. Feche outros apps, tente de novo e escolha onde salvar (Drive, Arquivos ou WhatsApp).'
  }
  return cleaned || 'Não foi possível carregar os dados agora.'
}
