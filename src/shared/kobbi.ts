export type KobbiRole = 'user' | 'assistant'

export type KobbiAttachment = {
  name: string
  mime: string
  dataUrl: string
}

export type KobbiHistoryMessage = {
  role: KobbiRole
  content: string
}

export type KobbiSendInput = {
  id: string
  storeId?: string | null
  userName?: string
  userRole?: string
  messages: KobbiHistoryMessage[]
  attachments?: KobbiAttachment[]
}

export type KobbiDeltaEvent = {
  id: string
  text: string
}

export type KobbiDoneEvent = {
  id: string
  model: string
}

export type KobbiErrorEvent = {
  id: string
  message: string
}

export type KobbiApi = {
  send: (input: KobbiSendInput) => Promise<void>
  abort: (id: string) => Promise<void>
  getWidth: () => Promise<number>
  setWidth: (width: number) => Promise<number>
  onDelta: (listener: (event: KobbiDeltaEvent) => void) => () => void
  onDone: (listener: (event: KobbiDoneEvent) => void) => () => void
  onError: (listener: (event: KobbiErrorEvent) => void) => () => void
}

export const KOBBI_WIDTH_MIN = 380
export const KOBBI_WIDTH_MAX = 920
export const KOBBI_WIDTH_DEFAULT = 480
