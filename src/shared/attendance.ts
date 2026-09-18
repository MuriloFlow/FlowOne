import { normalizeCardplusRoleKey } from './roles'

export const TEAM_HEADCOUNT_ROLES = [
  { id: 'OPERACAO', label: 'OP DE LOJA' },
  { id: 'VENDEDOR', label: 'VENDEDORES' },
  { id: 'CAIXA', label: 'CAIXA' },
  { id: 'ESTOQUE', label: 'ESTOQUISTA' },
  { id: 'AUXILIAR', label: 'AUXILIAR DE LIMPEZA' }
] as const

export type TeamHeadcountRole = (typeof TEAM_HEADCOUNT_ROLES)[number]['id']

export const ATTENDANCE_KINDS = ['ATESTADO', 'FALTA', 'FALTA_JUSTIFICADA', 'BANCO_HORAS'] as const
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number]
export type AttendanceKindTone = 'blue' | 'red' | 'yellow'

export type TeamHeadcountRow = {
  roleKey: TeamHeadcountRole
  label: string
  count: number
}

export type AttendancePerson = {
  id: string
  name: string
  roleLabel: string
}

export const ATTENDANCE_PHOTO_MAX = 3
export const ATTENDANCE_PHOTO_MAX_LENGTH = 1_500_000

export type AttendanceEvent = {
  id: string
  storeId: string
  dateKey: string
  collaboratorId: string
  name: string
  kind: AttendanceKind
  justified: boolean
  note: string | null
  photos: string[]
  createdBy: string | null
  createdByName: string | null
  createdAt: string
}

export type AttendanceDayRow = {
  dateKey: string
  atestadoCount: number
  faltaCount: number
  bancoCount: number
  eventCount: number
  headcountFilled: boolean
  headcount: TeamHeadcountRow[]
}

export type AttendanceBoard = {
  monthKey: string
  storeId: string
  storeName: string
  canEdit: boolean
  tableMissing: boolean
  days: AttendanceDayRow[]
  events: AttendanceEvent[]
  people: AttendancePerson[]
}

export type TeamHeadcountWrite = {
  storeId: string
  dateKey: string
  counts: Array<{ roleKey: TeamHeadcountRole; count: number }>
}

export type AttendanceEventWrite = {
  id?: string
  storeId: string
  dateKey: string
  collaboratorId: string
  kind: AttendanceKind
  justified?: boolean
  note?: string | null
  photos?: string[]
}

export function isTeamHeadcountRole(value: string | null | undefined): value is TeamHeadcountRole {
  return TEAM_HEADCOUNT_ROLES.some((role) => role.id === value)
}

export function isAttendanceKind(value: string | null | undefined): value is AttendanceKind {
  return ATTENDANCE_KINDS.some((kind) => kind === value)
}

export function isAttendancePhotoDataUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed.startsWith('data:image/') || /[\r\n]/.test(trimmed)) return false
  const marker = ';base64,'
  const sep = trimmed.indexOf(marker)
  if (sep < 0) return false
  return trimmed.slice(sep + marker.length).length > 0
}

export function teamHeadcountLabel(role: TeamHeadcountRole): string {
  return TEAM_HEADCOUNT_ROLES.find((item) => item.id === role)?.label ?? role
}

export function normalizeAttendanceKind(
  kind: string | null | undefined,
  justified = false
): AttendanceKind {
  if (kind === 'FALTA' && justified) return 'FALTA_JUSTIFICADA'
  if (isAttendanceKind(kind)) return kind
  return 'FALTA'
}

export function attendanceKindLabel(kind: AttendanceKind, justified = false): string {
  const resolved = normalizeAttendanceKind(kind, justified)
  if (resolved === 'ATESTADO') return 'Atestado'
  if (resolved === 'FALTA_JUSTIFICADA') return 'Falta justificada'
  if (resolved === 'BANCO_HORAS') return 'Banco de horas'
  return 'Falta'
}

export function attendanceKindTone(kind: AttendanceKind, justified = false): AttendanceKindTone {
  const resolved = normalizeAttendanceKind(kind, justified)
  if (resolved === 'ATESTADO') return 'blue'
  if (resolved === 'BANCO_HORAS') return 'yellow'
  return 'red'
}

export function attendanceKindIsJustified(kind: AttendanceKind): boolean {
  return kind === 'ATESTADO' || kind === 'FALTA_JUSTIFICADA'
}

function isGenericOperatorCard(card: string): boolean {
  return (
    !card ||
    card === 'funcionario operacional' ||
    card === 'operador' ||
    card === 'operacao' ||
    card === 'op de loja'
  )
}

function storeFunctionFromCardPlus(card: string): string | null {
  if (!card || isGenericOperatorCard(card)) return null
  if (card === 'vm' || card === 'vendedor' || card.includes('vendedor') || card.includes('vendas')) {
    return 'Vendedor'
  }
  if (card === 'lider de caixa') return 'Lider de Caixa'
  if (card === 'caixa' || card.includes('caixa')) return 'Caixa'
  if (card.includes('estoq')) return 'Estoquista'
  if (card === 'auxiliar' || card.includes('auxiliar')) return 'Auxiliar'
  if (card === 'gerente geral') return 'Gerente Geral'
  if (card === 'gerente') return 'Gerente'
  return null
}

function storeFunctionFromFlowRole(flowRole: string | null | undefined): string | null {
  const flow = (flowRole ?? '').trim().toUpperCase()
  if (flow === 'ESTOQUISTA' || flow === 'LIDER_ESTOQUE') return 'Estoquista'
  if (flow === 'AUXILIAR') return 'Auxiliar'
  if (flow === 'LIDER_CAIXA') return 'Lider de Caixa'
  if (flow === 'GERENTE') return 'Gerente'
  if (flow === 'GERENTE_GERAL') return 'Gerente Geral'
  return null
}

export function attendanceStoreFunctionLabel(
  cardplusRole: string | null | undefined,
  flowRole?: string | null
): string {
  const card = normalizeCardplusRoleKey(cardplusRole)
  const fromCard = storeFunctionFromCardPlus(card)
  if (fromCard) return fromCard
  if (isGenericOperatorCard(card)) {
    return storeFunctionFromFlowRole(flowRole) ?? 'Operador'
  }
  return (cardplusRole ?? '').trim() || 'Operador'
}
