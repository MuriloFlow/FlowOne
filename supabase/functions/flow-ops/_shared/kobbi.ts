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

export type KobbiChartUnit = 'count' | 'brl' | 'pu'

export type KobbiChartSpec = {
  type: 'bar' | 'line'
  title: string
  unit?: KobbiChartUnit
  series: Array<{ label: string; value: number }>
}

export type KobbiRatingValue = 'good' | 'bad'

export type KobbiStoredMessage = {
  role: KobbiRole
  content: string
}

export type KobbiThread = {
  id: string
  title: string
  messages: KobbiStoredMessage[]
  createdAt: string
  updatedAt: string
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
  chart?: KobbiChartSpec | null
}

export type KobbiErrorEvent = {
  id: string
  message: string
}

export type KobbiThreadSaveInput = {
  id?: string
  title: string
  messages: KobbiStoredMessage[]
}

export type KobbiRateInput = {
  threadId?: string | null
  content: string
  rating: KobbiRatingValue
}

export type KobbiApi = {
  send: (input: KobbiSendInput) => Promise<void>
  abort: (id: string) => Promise<void>
  getWidth: () => Promise<number>
  setWidth: (width: number) => Promise<number>
  listThreads: () => Promise<KobbiThread[]>
  saveThread: (input: KobbiThreadSaveInput) => Promise<KobbiThread>
  rate: (input: KobbiRateInput) => Promise<void>
  onDelta: (listener: (event: KobbiDeltaEvent) => void) => () => void
  onDone: (listener: (event: KobbiDoneEvent) => void) => () => void
  onError: (listener: (event: KobbiErrorEvent) => void) => () => void
}

export const KOBBI_WIDTH_MIN = 380
export const KOBBI_WIDTH_MAX = 920
export const KOBBI_WIDTH_DEFAULT = 480
export const KOBBI_THREAD_LIMIT = 5

export const KOBBI_RH_RULE =
  'O FLOW entrega ao Kobbi a escala da semana da unidade filtrada (horários por pessoa e dia) e as ocorrências de flow_attendance_events (atestado, falta, falta justificada, banco de horas). Combine pessoas pelo nome, primeiro nome ou parte do nome. É proibido dizer que não há acesso a escalas, RH ou folha.'
