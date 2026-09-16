export const CARDPLUS_SUB_ROLES = [
  'Funcionario Operacional',
  'Caixa',
  'Lider de Caixa',
  'VM',
  'Vendedor',
  'Gerente'
] as const

export type CardPlusSubRole = (typeof CARDPLUS_SUB_ROLES)[number]

export type StoreOption = {
  id: string
  name: string
}

export type MonthPoint = {
  key: string
  label: string
  cards: number
  goal: number | null
}

export type RecentCard = {
  id: string
  operatorName: string
  clientName: string
  amountInCents: number
  createdAt: string
  storeName: string
  activated: boolean
}

export type OverviewMetrics = {
  cardsToday: number
  cardsThisMonth: number
  cardsLastMonth: number
  monthGoal: number | null
  todayGoal: number | null
  remainingToMonthGoal: number | null
  storeCount: number
  employeeCount: number
  months: MonthPoint[]
  recentCards: RecentCard[]
}

export type FinanceMonthPoint = {
  key: string
  label: string
  salesCents: number
  goalCents: number | null
}

export type DailySaleRow = {
  dateKey: string
  storeId: string
  storeName: string
  amountInCents: number
}

export type FinanceMetrics = {
  saleTodayCents: number | null
  salesThisMonthCents: number
  salesLastMonthCents: number
  monthSalesGoalCents: number | null
  remainingToMonthSalesGoalCents: number | null
  storeCount: number
  registeredDaysThisMonth: number
  months: FinanceMonthPoint[]
  recentSales: DailySaleRow[]
}

export type EmployeeListItem = {
  id: string
  name: string
  storeId: string
  storeName: string
  cardplusRole: string
  flowRole: string | null
  flowRoleLabel: string
  cpfMasked: string | null
  hasCpf: boolean
  isActive: boolean
  cardsThisMonth: number
  createdAt: string
}

export type EmployeeIdentity = {
  collaboratorId: string
  cpf: string | null
  flowRole: string | null
}

export type EmployeeProfile = {
  employee: EmployeeListItem
  metrics: {
    cardsToday: number
    cardsThisMonth: number
    cardsTotal: number
    lastCardAt: string | null
    firstCardAt: string | null
    storeMonthGoal: number | null
    projectedMonth: number | null
    projectionLabel: string
  }
  months: MonthPoint[]
  recentCards: RecentCard[]
}

export type EmployeeWriteInput = {
  name: string
  storeId: string
  cardplusRole: string
  flowRole: string
  cpf: string
  isActive: boolean
}

export type CreateEmployeeInput = Omit<EmployeeWriteInput, 'isActive'>

export type UpdateEmployeeInput = EmployeeWriteInput & {
  id: string
}

export type OperationsApi = {
  getOverview: (storeId?: string | null) => Promise<OverviewMetrics>
  getFinance: (storeId?: string | null) => Promise<FinanceMetrics>
  listStores: () => Promise<StoreOption[]>
  listEmployees: (storeId?: string | null) => Promise<EmployeeListItem[]>
  getEmployee: (id: string, storeId?: string | null) => Promise<EmployeeProfile>
  getEmployeeIdentity: (id: string) => Promise<EmployeeIdentity>
  createEmployee: (input: CreateEmployeeInput) => Promise<EmployeeListItem>
  updateEmployee: (input: UpdateEmployeeInput) => Promise<EmployeeListItem>
  deleteEmployee: (id: string, storeId?: string | null) => Promise<void>
  getStorePreference: () => Promise<string | null>
  setStorePreference: (storeId: string | null) => Promise<void>
  listVouchers: (storeId?: string | null) => Promise<import('./vouchers').VoucherBoard>
  updateVoucher: (input: {
    collaboratorId: string
    lunchCents?: number
    transportCents?: number
    status?: import('./vouchers').VoucherStatus
  }) => Promise<void>
}
