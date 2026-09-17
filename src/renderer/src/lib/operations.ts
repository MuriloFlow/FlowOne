import type { OperationsApi } from '../../../shared/operations'
import { getCurrentStoreId } from '@/lib/store-scope'

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
    createCard: (input) => api.createCard(input),
    updateCard: (input) => api.updateCard(input),
    transferCard: (id, collaboratorId) => api.transferCard(id, collaboratorId),
    deleteCard: (id) => api.deleteCard(id),
    upsertDailySale: (input) => api.upsertDailySale(input),
    upsertFinanceDay: (input) => api.upsertFinanceDay(input),
    listVouchers: (storeId) => api.listVouchers(storeId === undefined ? getCurrentStoreId() : storeId),
    updateVoucher: (input) => api.updateVoucher(input)
  }
}

export function operationError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return 'Não foi possível carregar os dados agora.'
}
