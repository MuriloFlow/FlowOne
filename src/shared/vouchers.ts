export const VOUCHER_GROUPS = ['OP', 'VENDEDOR', 'ESTOQUISTA', 'AUXILIAR', 'CAIXA', 'OUTROS'] as const

export type VoucherGroupId = (typeof VOUCHER_GROUPS)[number]

export const VOUCHER_GROUP_LABEL: Record<VoucherGroupId, string> = {
  OP: 'OP',
  VENDEDOR: 'Vendedor',
  ESTOQUISTA: 'Estoquista',
  AUXILIAR: 'Auxiliar',
  CAIXA: 'Caixa',
  OUTROS: 'Outros'
}

export type VoucherStatus = 'PENDENTE' | 'PAGO'

export type VoucherRow = {
  collaboratorId: string
  name: string
  storeId: string
  storeName: string
  cpfMasked: string | null
  cpf: string | null
  rgImage: string | null
  group: VoucherGroupId
  roleLabel: string
  lunchCents: number
  transportCents: number
  dayTotalCents: number
  status: VoucherStatus
  paymentSignature: string | null
  paidAt: string | null
  receiptNumber: string | null
}

export function isVoucherSignatureDataUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed.startsWith('data:image/png;base64,') || /[\r\n]/.test(trimmed)) return false
  return trimmed.length <= 1_500_000 && trimmed.length > 'data:image/png;base64,'.length
}

export type VoucherBoard = {
  periodKey: string
  lunchTotalCents: number
  transportTotalCents: number
  grandTotalCents: number
  groups: Array<{
    id: VoucherGroupId
    label: string
    rows: VoucherRow[]
  }>
}

export function voucherPeriodKey(date = new Date()): string {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
  const [year, month, day] = dateKey.split('-').map(Number)
  const weekday = new Date(`${dateKey}T12:00:00-03:00`).getUTCDay()
  // Sábado 00:00 fecha a semana: o período corrente passa a ser o domingo seguinte.
  const offset = weekday === 6 ? 1 : -weekday
  const sunday = new Date(Date.UTC(year, month - 1, day + offset))
  return `${sunday.getUTCFullYear()}-${String(sunday.getUTCMonth() + 1).padStart(2, '0')}-${String(sunday.getUTCDate()).padStart(2, '0')}`
}

export function msUntilNextVoucherReset(now = new Date()): number {
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now)
  const [year, month, day] = dateKey.split('-').map(Number)
  const weekday = new Date(`${dateKey}T12:00:00-03:00`).getUTCDay()
  const days = weekday === 6 ? 7 : 6 - weekday
  const saturday = new Date(Date.UTC(year, month - 1, day + days))
  const key = `${saturday.getUTCFullYear()}-${String(saturday.getUTCMonth() + 1).padStart(2, '0')}-${String(saturday.getUTCDate()).padStart(2, '0')}`
  return Math.max(1500, new Date(`${key}T00:00:00-03:00`).getTime() - now.getTime())
}

export function sundaysInMonth(monthKey: string): string[] {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return []
  const [year, month] = monthKey.split('-').map(Number)
  const dates: string[] = []
  const cursor = new Date(Date.UTC(year, month - 1, 1))
  while (cursor.getUTCMonth() === month - 1) {
    if (cursor.getUTCDay() === 0) {
      dates.push(
        `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-${String(cursor.getUTCDate()).padStart(2, '0')}`
      )
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function formatSundayLabel(periodKey: string): string {
  const [year, month, day] = periodKey.split('-').map(Number)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC'
  })
    .format(new Date(Date.UTC(year, month - 1, day)))
    .replace('.', '')
}

export type VoucherHistoryPayment = {
  collaboratorId: string
  name: string
  storeName: string
  roleLabel: string
  lunchCents: number
  transportCents: number
  totalCents: number
  paidAt: string | null
  receiptNumber: string | null
}

export type VoucherHistorySunday = {
  periodKey: string
  label: string
  totalCents: number
  payments: VoucherHistoryPayment[]
}

export type VoucherHistoryBoard = {
  monthKey: string
  sundays: VoucherHistorySunday[]
}

export function formatVoucherWeekLabel(periodKey: string): string {
  const [year, month, day] = periodKey.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1, day))
  const end = new Date(Date.UTC(year, month - 1, day + 6))
  const format = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC'
  })
  return `${format.format(start).replace('.', '')} — ${format.format(end).replace('.', '')}`
}

export function voucherGroupFor(flowRole: string | null | undefined, cardplusRole: string): VoucherGroupId {
  const flow = (flowRole ?? '').toUpperCase()
  const card = cardplusRole.trim().toLowerCase()

  if (flow === 'AUXILIAR') return 'AUXILIAR'
  if (flow === 'ESTOQUISTA' || flow === 'LIDER_ESTOQUE') return 'ESTOQUISTA'
  if (flow === 'LIDER_CAIXA' || card === 'caixa' || card === 'lider de caixa') return 'CAIXA'
  if (card === 'vendedor' || card === 'vm') return 'VENDEDOR'
  if (flow === 'OPERADOR' || flow === 'LIDER_OPERACAO' || card === 'funcionario operacional') return 'OP'
  return 'OUTROS'
}
