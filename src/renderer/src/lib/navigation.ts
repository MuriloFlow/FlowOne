import { canManageFlowUsers } from '@/lib/roles'
import dashboardIcon from '@/assets/icons/dashboard.svg'
import employeesIcon from '@/assets/icons/Funcionarios.svg'
import cardsIcon from '@/assets/icons/Cartao.svg'
import financeIcon from '@/assets/icons/valor.svg'
import vouchersIcon from '@/assets/icons/valor.svg'
import storesIcon from '@/assets/icons/unidades.svg'
import schedulesIcon from '@/assets/icons/Data.svg'
import reportsIcon from '@/assets/icons/Docs.svg'
import sorteioIcon from '@/assets/icons/Ticket.svg'
import hiringIcon from '@/assets/icons/hiring.svg'

export type NavId =
  | 'overview'
  | 'employees'
  | 'cards'
  | 'finance'
  | 'vouchers'
  | 'sorteio'
  | 'stores'
  | 'schedules'
  | 'attendance'
  | 'users'
  | 'reports'
  | 'rh_overview'
  | 'rh_jobs'
  | 'rh_applications'
  | 'rh_interviews'
  | 'rh_settings'

export type NavItem = {
  id: NavId
  label: string
  icon: string
}

export type NavGroup = {
  id: string
  label: string
  icon: string
  /** Cargo mínimo necessário para a categoria aparecer. */
  visible: (role: string) => boolean
  items: NavItem[]
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Visão Geral', icon: dashboardIcon },
  { id: 'employees', label: 'Funcionários', icon: employeesIcon },
  { id: 'cards', label: 'Cartões', icon: cardsIcon },
  { id: 'finance', label: 'Financeiro', icon: financeIcon },
  { id: 'vouchers', label: 'Vales e pagamentos', icon: vouchersIcon },
  { id: 'sorteio', label: 'Sorteio', icon: sorteioIcon },
  { id: 'stores', label: 'Unidades', icon: storesIcon },
  { id: 'schedules', label: 'Escalas e horários', icon: schedulesIcon },
  { id: 'attendance', label: 'Atestados e Equipe', icon: employeesIcon },
  { id: 'users', label: 'Usuários', icon: employeesIcon },
  { id: 'reports', label: 'Relatório e projeções', icon: reportsIcon }
]

export const RH_NAV_ITEMS: NavItem[] = [
  { id: 'rh_overview', label: 'Visão Geral', icon: dashboardIcon },
  { id: 'rh_jobs', label: 'Vagas', icon: hiringIcon },
  { id: 'rh_applications', label: 'Candidaturas', icon: employeesIcon },
  { id: 'rh_interviews', label: 'Entrevistas', icon: schedulesIcon },
  { id: 'rh_settings', label: 'Configurações', icon: reportsIcon }
]

export const RH_NAV_GROUP: NavGroup = {
  id: 'rh',
  label: 'PORTAL DO RH',
  icon: hiringIcon,
  visible: () => true,
  items: RH_NAV_ITEMS
}

export const DEFAULT_NAV_ID: NavId = 'overview'

const SESSION_NAV_KEY = 'flow:nav-id'

export function getNavItem(id: NavId): NavItem {
  return NAV_ITEMS.find((item) => item.id === id) ?? RH_NAV_ITEMS.find((item) => item.id === id) ?? NAV_ITEMS[0]
}

export function isRhNavId(id: NavId): boolean {
  return RH_NAV_ITEMS.some((item) => item.id === id)
}

export function visibleNavItems(role: string): NavItem[] {
  return [...NAV_ITEMS.filter((item) => item.id !== 'users' || canManageFlowUsers(role)), ...RH_NAV_ITEMS]
}

export function isValidNavId(value: string | null | undefined): value is NavId {
  return NAV_ITEMS.some((item) => item.id === value) || RH_NAV_ITEMS.some((item) => item.id === value)
}

function isRendererReload(): boolean {
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (entry?.type === 'reload') return true
  if (entry?.type) return false
  return performance.navigation?.type === PerformanceNavigation.TYPE_RELOAD
}

function readStoredNavId(): string | null {
  try {
    return sessionStorage.getItem(SESSION_NAV_KEY)
  } catch {
    return null
  }
}

export function resolveNavId(value: string | null | undefined, role: string): NavId {
  const safeValue = isValidNavId(value) ? value : DEFAULT_NAV_ID
  if (!visibleNavItems(role).some((item) => item.id === safeValue)) {
    return DEFAULT_NAV_ID
  }
  return safeValue
}

export function readSessionNavId(role: string): NavId {
  if (!isRendererReload()) {
    clearSessionNavId()
    return DEFAULT_NAV_ID
  }

  const stored = readStoredNavId()
  return resolveNavId(stored, role)
}

export function writeSessionNavId(id: NavId): void {
  try {
    sessionStorage.setItem(SESSION_NAV_KEY, id)
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearSessionNavId(): void {
  try {
    sessionStorage.removeItem(SESSION_NAV_KEY)
  } catch {
    /* ignore */
  }
}
