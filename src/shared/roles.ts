export const FLOW_ROLES = [
  { id: 'OPERADOR', label: 'Operador', canLogin: false },
  { id: 'ESTOQUISTA', label: 'Estoquista', canLogin: false },
  { id: 'AUXILIAR', label: 'Auxiliar', canLogin: false },
  { id: 'LIDER_OPERACAO', label: 'Lider de Operação', canLogin: true },
  { id: 'LIDER_ESTOQUE', label: 'Lider de Estoque', canLogin: true },
  { id: 'LIDER_CAIXA', label: 'Lider de Caixa', canLogin: true },
  { id: 'GERENTE', label: 'Gerente', canLogin: true },
  { id: 'GERENTE_GERAL', label: 'Gerente Geral', canLogin: true },
  { id: 'SUPERVISOR', label: 'Supervisor', canLogin: true },
  { id: 'DIRETOR', label: 'Diretor', canLogin: true }
] as const

export type FlowRoleId = (typeof FLOW_ROLES)[number]['id']

export const DEFAULT_LOGIN_ROLE: FlowRoleId = 'LIDER_OPERACAO'
export const DEFAULT_EMPLOYEE_ROLE: FlowRoleId = 'OPERADOR'

const ROLE_BY_ID = new Map(FLOW_ROLES.map((role) => [role.id, role]))

export function isFlowRole(value: string): value is FlowRoleId {
  return ROLE_BY_ID.has(value as FlowRoleId)
}

export function normalizeRole(role: string | null | undefined): FlowRoleId {
  if (role === 'SUPER_ADMIN') return 'LIDER_OPERACAO'
  if (role === 'ADMIN') return 'GERENTE_GERAL'
  if (role === 'FUNCIONARIO') return 'OPERADOR'
  if (role && isFlowRole(role)) return role
  return DEFAULT_LOGIN_ROLE
}

export function humanizeRoleCode(role: string): string {
  return role
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Sem cargo'
  return ROLE_BY_ID.get(isFlowRole(role) ? role : normalizeRole(role))?.label ?? humanizeRoleCode(role)
}

export function canLoginWithRole(role: string | null | undefined): boolean {
  return ROLE_BY_ID.get(normalizeRole(role))?.canLogin ?? true
}

export function canViewAllStores(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role)
  return normalized === 'SUPERVISOR' || normalized === 'DIRETOR'
}

export function canCreateStores(role: string | null | undefined): boolean {
  return canViewAllStores(role)
}

export function canEditStoreDesk(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role)
  return (
    normalized === 'SUPERVISOR' ||
    normalized === 'DIRETOR' ||
    normalized === 'GERENTE_GERAL' ||
    normalized === 'GERENTE'
  )
}

export function isGerenteRegionalRole(cardplusRole: string | null | undefined): boolean {
  return (cardplusRole ?? '').trim().toLowerCase() === 'gerente regional'
}

export function isSupervisorSeatCandidate(
  flowRole: string | null | undefined,
  cardplusRole: string | null | undefined
): boolean {
  return flowRole === 'SUPERVISOR' || isGerenteRegionalRole(cardplusRole)
}

export function employeeRoleLabel(flowRole: string | null | undefined, cardplusRole: string): string {
  if (flowRole && isFlowRole(flowRole)) return roleLabel(flowRole)
  if (isGerenteRegionalRole(cardplusRole)) return 'Supervisor'
  return cardplusRole
}
