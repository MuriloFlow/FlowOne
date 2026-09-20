import type { FlowApi, PersistedAuthSession, UpdateStatus, WindowState } from '../../../shared/ipc'
import {
  KOBBI_THREAD_LIMIT,
  KOBBI_WIDTH_DEFAULT,
  type KobbiApi,
  type KobbiDeltaEvent,
  type KobbiDoneEvent,
  type KobbiErrorEvent,
  type KobbiRateInput,
  type KobbiSendInput,
  type KobbiThread,
  type KobbiThreadSaveInput
} from '../../../shared/kobbi'
import type { OperationsApi } from '../../../shared/operations'
import { normalizeStoreId } from '../../../shared/store-scope'
import { callOp } from '@/lib/flow-ops-client'

const SESSION_KEY = 'flow.auth.session'
const STORE_KEY = 'flow.storeId'
const KOBBI_WIDTH_KEY = 'flow.kobbi.width'
const KOBBI_THREADS_KEY = 'flow.kobbi.threads'

type Prefs = {
  get: (options: { key: string }) => Promise<{ value: string | null }>
  set: (options: { key: string; value: string }) => Promise<void>
  remove: (options: { key: string }) => Promise<void>
}

function withStore(storeId: string | null | undefined, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { storeId: storeId ?? null, ...extra }
}

function createEmitter<T>() {
  const listeners = new Set<(event: T) => void>()
  return {
    on(listener: (event: T) => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(event: T) {
      for (const listener of listeners) listener(event)
    }
  }
}

function idleStatus(): UpdateStatus {
  return { state: 'idle' }
}

function windowState(): WindowState {
  return { isMaximized: true }
}

async function readJson<T>(prefs: Prefs, key: string, fallback: T): Promise<T> {
  const { value } = await prefs.get({ key })
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function pruneThreads(list: KobbiThread[]): KobbiThread[] {
  return [...list]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, KOBBI_THREAD_LIMIT)
}

function createOperations(prefs: Prefs): OperationsApi {
  return {
    getOverview: (storeId) => callOp('getOverview', withStore(storeId)),
    getFinance: (storeId, monthKey) =>
      callOp('getFinance', withStore(storeId, { monthKey: monthKey ?? null })),
    listStores: () => callOp('listStores'),
    listEmployees: (storeId) => callOp('listEmployees', withStore(storeId)),
    getEmployee: (id, storeId) => callOp('getEmployee', withStore(storeId, { id })),
    getEmployeeIdentity: (id) => callOp('getEmployeeIdentity', { id }),
    getEmployeeDocument: (id) => callOp('getEmployeeDocument', { id }),
    saveEmployeeDocument: (input) => callOp('saveEmployeeDocument', input),
    createEmployee: (input) => callOp('createEmployee', input),
    updateEmployee: (input) => callOp('updateEmployee', input),
    deleteEmployee: (id, storeId) => callOp('deleteEmployee', withStore(storeId, { id })),
    getStorePreference: async () => normalizeStoreId((await prefs.get({ key: STORE_KEY })).value),
    setStorePreference: async (storeId) => {
      const normalized = normalizeStoreId(storeId)
      if (!normalized) {
        await prefs.remove({ key: STORE_KEY })
        return
      }
      await prefs.set({ key: STORE_KEY, value: normalized })
    },
    listStoreBoard: (storeId) => callOp('listStoreBoard', withStore(storeId)),
    createStore: (input) => callOp('createStore', input),
    updateStore: (input) => callOp('updateStore', input),
    listStoreAccess: (storeId) => callOp('listStoreAccess', { storeId }),
    upsertStoreAccess: (input) => callOp('upsertStoreAccess', input),
    getCardsBoard: (monthKey, storeId) =>
      callOp('getCardsBoard', withStore(storeId, { monthKey: monthKey ?? null })),
    upsertCardMonthTotal: (input) => callOp('upsertCardMonthTotal', input),
    createCard: (input) => callOp('createCard', input),
    updateCard: (input) => callOp('updateCard', input),
    transferCard: (id, collaboratorId) => callOp('transferCard', { id, collaboratorId }),
    deleteCard: (id) => callOp('deleteCard', { id }),
    upsertDailySale: (input) => callOp('upsertDailySale', input),
    upsertFinanceDay: (input) => callOp('upsertFinanceDay', input),
    getScheduleBoard: (storeId, weekStart) =>
      callOp('getScheduleBoard', withStore(storeId, { weekStart: weekStart ?? null })),
    saveScheduleSlots: (storeId, slots, team) =>
      callOp('saveScheduleSlots', { storeId, slots, team: team ?? null }),
    resetScheduleSlots: (storeId, team) => callOp('resetScheduleSlots', { storeId, team: team ?? null }),
    upsertScheduleAssignment: (input) => callOp('upsertScheduleAssignment', input),
    deleteScheduleAssignment: (id, storeId) => callOp('deleteScheduleAssignment', { id, storeId }),
    getAttendanceBoard: (storeId, monthKey) =>
      callOp('getAttendanceBoard', withStore(storeId, { monthKey: monthKey ?? null })),
    upsertTeamHeadcount: (input) => callOp('upsertTeamHeadcount', input),
    upsertAttendanceEvent: (input) => callOp('upsertAttendanceEvent', input),
    deleteAttendanceEvent: (id, storeId) => callOp('deleteAttendanceEvent', { id, storeId }),
    listVouchers: (storeId) => callOp('listVouchers', withStore(storeId)),
    updateVoucher: (input) => callOp('updateVoucher', input),
    listFlowUsers: () => callOp('listFlowUsers'),
    upsertFlowUser: (input) => callOp('upsertFlowUser', input),
    getActorScope: () => callOp('getActorScope')
  }
}

function createKobbi(prefs: Prefs): KobbiApi {
  const deltas = createEmitter<KobbiDeltaEvent>()
  const dones = createEmitter<KobbiDoneEvent>()
  const errors = createEmitter<KobbiErrorEvent>()
  const aborted = new Set<string>()

  return {
    async send(input: KobbiSendInput) {
      aborted.delete(input.id)
      try {
        const result = await callOp<{ text?: string; model?: string; chart?: KobbiDoneEvent['chart'] }>(
          'kobbiSend',
          {
            storeId: input.storeId ?? null,
            userName: input.userName,
            userRole: input.userRole,
            messages: input.messages,
            attachments: input.attachments
          }
        )
        if (aborted.has(input.id)) return
        deltas.emit({ id: input.id, text: result.text ?? '' })
        dones.emit({
          id: input.id,
          model: result.model ?? 'kobbi',
          chart: result.chart ?? null
        })
      } catch (error) {
        if (aborted.has(input.id)) return
        const message = error instanceof Error ? error.message : 'Falha ao falar com o Kobbi.'
        errors.emit({ id: input.id, message })
        throw error
      }
    },
    async abort(id) {
      aborted.add(id)
    },
    async getWidth() {
      const { value } = await prefs.get({ key: KOBBI_WIDTH_KEY })
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
      return typeof window === 'undefined' ? KOBBI_WIDTH_DEFAULT : window.innerWidth
    },
    async setWidth(width) {
      const next = Math.max(1, Math.round(width))
      await prefs.set({ key: KOBBI_WIDTH_KEY, value: String(next) })
      return next
    },
    async listThreads() {
      return pruneThreads(await readJson<KobbiThread[]>(prefs, KOBBI_THREADS_KEY, []))
    },
    async saveThread(input: KobbiThreadSaveInput) {
      const now = new Date().toISOString()
      const current = await readJson<KobbiThread[]>(prefs, KOBBI_THREADS_KEY, [])
      const existing = input.id ? current.find((thread) => thread.id === input.id) : null
      const saved: KobbiThread = {
        id: existing?.id ?? input.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title: input.title,
        messages: input.messages,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      }
      const next = pruneThreads([saved, ...current.filter((thread) => thread.id !== saved.id)])
      await prefs.set({ key: KOBBI_THREADS_KEY, value: JSON.stringify(next) })
      return saved
    },
    async rate(_input: KobbiRateInput) {
      /* avaliações ficam no estado local do chat no mobile */
    },
    onDelta: (listener) => deltas.on(listener),
    onDone: (listener) => dones.on(listener),
    onError: (listener) => errors.on(listener)
  }
}

export async function installFlowMobileBridge(): Promise<void> {
  const { Preferences } = await import('@capacitor/preferences')
  const operations = createOperations(Preferences)
  const idle: UpdateStatus = idleStatus()

  const flow: FlowApi = {
    invoke: async (channel, payload) => {
      const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
      switch (channel) {
        case 'operations:overview':
          return operations.getOverview(typeof body.storeId === 'string' ? body.storeId : null)
        case 'operations:finance':
          return operations.getFinance(
            typeof body.storeId === 'string' ? body.storeId : null,
            typeof body.monthKey === 'string' ? body.monthKey : null
          )
        case 'operations:users':
          return operations.listFlowUsers()
        case 'operations:user-upsert':
          return operations.upsertFlowUser(payload as Parameters<OperationsApi['upsertFlowUser']>[0])
        case 'operations:scope':
          return operations.getActorScope()
        case 'operations:attendance':
          return operations.getAttendanceBoard(
            typeof body.storeId === 'string' ? body.storeId : null,
            typeof body.monthKey === 'string' ? body.monthKey : null
          )
        case 'operations:employee-document':
          return operations.getEmployeeDocument(String(body.id ?? ''))
        case 'operations:employee-document-save':
          return operations.saveEmployeeDocument(payload as Parameters<OperationsApi['saveEmployeeDocument']>[0])
        case 'operations:headcount-upsert':
          return operations.upsertTeamHeadcount(payload as Parameters<OperationsApi['upsertTeamHeadcount']>[0])
        case 'operations:attendance-upsert':
          return operations.upsertAttendanceEvent(payload as Parameters<OperationsApi['upsertAttendanceEvent']>[0])
        case 'operations:attendance-delete':
          return operations.deleteAttendanceEvent(String(body.id ?? ''), String(body.storeId ?? ''))
        case 'operations:card-month-total':
          return operations.upsertCardMonthTotal(payload as Parameters<OperationsApi['upsertCardMonthTotal']>[0])
        default:
          throw new Error('Operação indisponível neste app.')
      }
    },
    window: {
      minimize: async () => undefined,
      toggleMaximize: async () => windowState(),
      close: async () => undefined,
      getState: async () => windowState(),
      onState: () => () => undefined
    },
    auth: {
      persistSession: async (session: PersistedAuthSession) => {
        await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(session) })
      },
      readSession: async () => {
        const { value } = await Preferences.get({ key: SESSION_KEY })
        if (!value) return null
        try {
          const parsed = JSON.parse(value) as PersistedAuthSession
          if (!parsed.accessToken || !parsed.refreshToken || !parsed.sessionId) return null
          return parsed
        } catch {
          return null
        }
      },
      clearSession: async () => {
        await Preferences.remove({ key: SESSION_KEY })
      }
    },
    updater: {
      getStatus: async () => idle,
      check: async () => idle,
      install: async () => undefined,
      onStatus: () => () => undefined
    },
    operations,
    kobbi: createKobbi(Preferences)
  }

  window.flow = flow
}
