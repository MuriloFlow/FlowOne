import { contextBridge, ipcRenderer } from 'electron'
import type { FlowApi, PersistedAuthSession, UpdateStatus, WindowState } from '../shared/ipc'
import type { KobbiSendInput, KobbiThreadSaveInput, KobbiRateInput } from '../shared/kobbi'
import type {
  CreateEmployeeInput,
  UpdateEmployeeInput
} from '../shared/operations'

const flow: FlowApi = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    getState: () => ipcRenderer.invoke('window:state'),
    onState: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: WindowState) => listener(state)
      ipcRenderer.on('window:state', handler)
      return () => ipcRenderer.removeListener('window:state', handler)
    }
  },
  auth: {
    persistSession: (session: PersistedAuthSession) =>
      ipcRenderer.invoke('auth:persist-session', session),
    readSession: () => ipcRenderer.invoke('auth:read-session'),
    clearSession: () => ipcRenderer.invoke('auth:clear-session')
  },
  updater: {
    getStatus: () => ipcRenderer.invoke('updater:status'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => listener(status)
      ipcRenderer.on('updater:status', handler)
      return () => ipcRenderer.removeListener('updater:status', handler)
    }
  },
  operations: {
    getOverview: (storeId?: string | null) =>
      ipcRenderer.invoke('operations:overview', { storeId: storeId ?? null }),
    getFinance: (storeId?: string | null, monthKey?: string | null) =>
      ipcRenderer.invoke('operations:finance', { storeId: storeId ?? null, monthKey: monthKey ?? null }),
    listStores: () => ipcRenderer.invoke('operations:stores'),
    listEmployees: (storeId?: string | null) =>
      ipcRenderer.invoke('operations:employees', { storeId: storeId ?? null }),
    getEmployee: (id: string, storeId?: string | null) =>
      ipcRenderer.invoke('operations:employee', { id, storeId: storeId ?? null }),
    getEmployeeIdentity: (id: string) => ipcRenderer.invoke('operations:employee-identity', id),
    createEmployee: (input: CreateEmployeeInput) => ipcRenderer.invoke('operations:employee-create', input),
    updateEmployee: (input: UpdateEmployeeInput) => ipcRenderer.invoke('operations:employee-update', input),
    deleteEmployee: (id: string, storeId?: string | null) =>
      ipcRenderer.invoke('operations:employee-delete', { id, storeId: storeId ?? null }),
    getStorePreference: () => ipcRenderer.invoke('operations:store-preference', { action: 'read' }),
    setStorePreference: (storeId?: string | null) =>
      ipcRenderer.invoke('operations:store-preference', { action: 'write', storeId: storeId ?? null }),
    listStoreBoard: (storeId?: string | null) =>
      ipcRenderer.invoke('operations:store-board', { storeId: storeId ?? null }),
    createStore: (input) => ipcRenderer.invoke('operations:store-create', input),
    updateStore: (input) => ipcRenderer.invoke('operations:store-update', input),
    listStoreAccess: (storeId) => ipcRenderer.invoke('operations:store-access', { storeId }),
    upsertStoreAccess: (input) => ipcRenderer.invoke('operations:store-access-upsert', input),
    getCardsBoard: (monthKey, storeId) =>
      ipcRenderer.invoke('operations:cards', { monthKey: monthKey ?? null, storeId: storeId ?? null }),
    createCard: (input) => ipcRenderer.invoke('operations:card-create', input),
    updateCard: (input) => ipcRenderer.invoke('operations:card-update', input),
    transferCard: (id, collaboratorId) =>
      ipcRenderer.invoke('operations:card-transfer', { id, collaboratorId }),
    deleteCard: (id) => ipcRenderer.invoke('operations:card-delete', { id }),
    upsertDailySale: (input) => ipcRenderer.invoke('operations:daily-sale-upsert', input),
    upsertFinanceDay: (input) => ipcRenderer.invoke('operations:finance-day-upsert', input),
    getScheduleBoard: (storeId, weekStart) =>
      ipcRenderer.invoke('operations:schedule', { storeId: storeId ?? null, weekStart: weekStart ?? null }),
    saveScheduleSlots: (storeId, slots) =>
      ipcRenderer.invoke('operations:schedule-slots', { storeId, slots }),
    resetScheduleSlots: (storeId) =>
      ipcRenderer.invoke('operations:schedule-slots', { storeId, action: 'reset' }),
    upsertScheduleAssignment: (input) => ipcRenderer.invoke('operations:schedule-assign', input),
    deleteScheduleAssignment: (id, storeId) =>
      ipcRenderer.invoke('operations:schedule-unassign', { id, storeId }),
    listVouchers: (storeId?: string | null) =>
      ipcRenderer.invoke('operations:vouchers', { storeId: storeId ?? null }),
    updateVoucher: (input) => ipcRenderer.invoke('operations:voucher-update', input)
  },
  kobbi: {
    send: (input: KobbiSendInput) => ipcRenderer.invoke('kobbi:send', input),
    abort: (id: string) => ipcRenderer.invoke('kobbi:abort', id),
    getWidth: () => ipcRenderer.invoke('kobbi:width', { action: 'read' }),
    setWidth: (width: number) => ipcRenderer.invoke('kobbi:width', { action: 'write', width }),
    listThreads: () => ipcRenderer.invoke('kobbi:threads', { action: 'list' }),
    saveThread: (input: KobbiThreadSaveInput) => ipcRenderer.invoke('kobbi:threads', { action: 'save', ...input }),
    rate: (input: KobbiRateInput) => ipcRenderer.invoke('kobbi:rate', input),
    onDelta: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; text: string }) =>
        listener(payload)
      ipcRenderer.on('kobbi:delta', handler)
      return () => ipcRenderer.removeListener('kobbi:delta', handler)
    },
    onDone: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; model: string; chart?: import('../shared/kobbi').KobbiChartSpec | null }
      ) => listener(payload)
      ipcRenderer.on('kobbi:done', handler)
      return () => ipcRenderer.removeListener('kobbi:done', handler)
    },
    onError: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { id: string; message: string }) =>
        listener(payload)
      ipcRenderer.on('kobbi:error', handler)
      return () => ipcRenderer.removeListener('kobbi:error', handler)
    }
  }
}

contextBridge.exposeInMainWorld('flow', flow)
