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
  group: VoucherGroupId
  roleLabel: string
  lunchCents: number
  transportCents: number
  dayTotalCents: number
  status: VoucherStatus
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
  const sunday = new Date(Date.UTC(year, month - 1, day - weekday))
  return `${sunday.getUTCFullYear()}-${String(sunday.getUTCMonth() + 1).padStart(2, '0')}-${String(sunday.getUTCDate()).padStart(2, '0')}`
}

export function msUntilNextVoucherReset(now = new Date()): number {
  const [year, month, day] = voucherPeriodKey(now).split('-').map(Number)
  const nextSunday = new Date(Date.UTC(year, month - 1, day + 7))
  const nextKey = `${nextSunday.getUTCFullYear()}-${String(nextSunday.getUTCMonth() + 1).padStart(2, '0')}-${String(nextSunday.getUTCDate()).padStart(2, '0')}`
  return Math.max(1500, new Date(`${nextKey}T00:00:00-03:00`).getTime() - now.getTime())
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
