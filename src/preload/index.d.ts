import type { FlowApi } from '../../shared/ipc'

declare global {
  interface Window {
    flow: FlowApi
  }
}

export {}
