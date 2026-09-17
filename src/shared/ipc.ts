export type PersistedAuthSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  sessionId: string
}

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export type WindowState = {
  isMaximized: boolean
}

export type { OperationsApi } from './operations'

export type FlowApi = {
  invoke: (channel: string, payload?: unknown) => Promise<unknown>
  window: {
    minimize: () => Promise<void>
    toggleMaximize: () => Promise<WindowState>
    close: () => Promise<void>
    getState: () => Promise<WindowState>
    onState: (listener: (state: WindowState) => void) => () => void
  }
  auth: {
    persistSession: (session: PersistedAuthSession) => Promise<void>
    readSession: () => Promise<PersistedAuthSession | null>
    clearSession: () => Promise<void>
  }
  updater: {
    getStatus: () => Promise<UpdateStatus>
    check: () => Promise<UpdateStatus>
    install: () => Promise<void>
    onStatus: (listener: (status: UpdateStatus) => void) => () => void
  }
  operations: import('./operations').OperationsApi
  kobbi: import('./kobbi').KobbiApi
}
