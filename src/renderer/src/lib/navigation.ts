import dashboardIcon from '@/assets/icons/dashboard.svg'
import employeesIcon from '@/assets/icons/Funcionarios.svg'
import cardsIcon from '@/assets/icons/Cartao.svg'
import financeIcon from '@/assets/icons/valor.svg'
import vouchersIcon from '@/assets/icons/valor.svg'
import storesIcon from '@/assets/icons/unidades.svg'
import schedulesIcon from '@/assets/icons/Data.svg'
import reportsIcon from '@/assets/icons/Docs.svg'

export type NavId =
  | 'overview'
  | 'employees'
  | 'cards'
  | 'finance'
  | 'vouchers'
  | 'stores'
  | 'schedules'
  | 'reports'

export type NavItem = {
  id: NavId
  label: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Visão Geral', icon: dashboardIcon },
  { id: 'employees', label: 'Funcionários', icon: employeesIcon },
  { id: 'cards', label: 'Cartões', icon: cardsIcon },
  { id: 'finance', label: 'Financeiro', icon: financeIcon },
  { id: 'vouchers', label: 'Vales e pagamentos', icon: vouchersIcon },
  { id: 'stores', label: 'Unidades', icon: storesIcon },
  { id: 'schedules', label: 'Escalas e horários', icon: schedulesIcon },
  { id: 'reports', label: 'Relatório e projeções', icon: reportsIcon }
]

export const DEFAULT_NAV_ID: NavId = 'overview'

export function getNavItem(id: NavId): NavItem {
  return NAV_ITEMS.find((item) => item.id === id) ?? NAV_ITEMS[0]
}
