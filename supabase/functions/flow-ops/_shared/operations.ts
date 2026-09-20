export const CARDPLUS_STORE_ROLES = [
  'Funcionario Operacional',
  'Caixa',
  'Lider de Caixa',
  'VM',
  'Vendedor',
  'Gerente',
  'Gerente Geral'
] as const

export const CARDPLUS_SUB_ROLES = [...CARDPLUS_STORE_ROLES, 'Gerente Regional', 'TI'] as const

export type CardPlusSubRole = (typeof CARDPLUS_SUB_ROLES)[number]
export type CardPlusStoreRole = (typeof CARDPLUS_STORE_ROLES)[number]

export function isManagerLoginSubRole(role: string | null | undefined): boolean {
  const key = (role ?? '').trim().toLowerCase()
  return key === 'gerente' || key === 'gerente geral'
}

export type StoreOption = {
  id: string
  name: string
  createdAt?: string
}

export const STORE_SEATS = ['GERENTE', 'GERENTE_GERAL', 'SUPERVISOR', 'LIDER_OPERACAO'] as const

export type StoreSeat = (typeof STORE_SEATS)[number]

export type StorePerson = {
  id: string
  name: string
  storeName?: string
  roleLabel?: string
  isActive?: boolean
}

export type StoreBoardItem = {
  id: string
  name: string
  createdAt: string | null
  internalCode: string | null
  notes: string | null
  flagged: boolean
  employeeCount: number
  cardsThisMonth: number
  monthGoal: number | null
  salesThisMonthCents: number
  monthSalesGoalCents: number | null
  managers: StorePerson[]
  generalManager: StorePerson | null
  supervisor: StorePerson | null
  operationLead: StorePerson | null
  missingLeadership: boolean
  hasOperationalAccess: boolean
}

export type StoreBoard = {
  canCreate: boolean
  canEdit: boolean
  storeCount: number
  flaggedCount: number
  missingLeadershipCount: number
  employeeCount: number
  cardsThisMonth: number
  people: StorePerson[]
  supervisorPeople: StorePerson[]
  stores: StoreBoardItem[]
}

export type StoreWriteInput = {
  id?: string
  name: string
  internalCode?: string
  notes?: string
  flagged?: boolean
  managerIds?: string[]
  generalManagerId?: string | null
  supervisorId?: string | null
  operationLeadId?: string | null
  accessUsername?: string
  accessPassword?: string
  accessDisplayName?: string
}

export type StoreAccessAccount = {
  id: string
  storeId: string
  username: string
  displayName: string
  role: string
  roleLabel: string
  isActive: boolean
  isPrimary: boolean
  updatedAt: string | null
}

export type StoreAccessWriteInput = {
  storeId: string
  id?: string
  username: string
  displayName?: string
  password?: string
  isActive?: boolean
  role?: 'EMPLOYEE' | 'MANAGER'
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
  amountUsedInCents: number
  createdAt: string
  storeName: string
  activated: boolean
  activatedLater: boolean
}

export type OverviewMetrics = {
  cardsToday: number
  cardsThisMonth: number
  cardsThisMonthRegistered?: number
  cardTotalOverride?: number | null
  cardsLastMonth: number
  monthGoal: number | null
  todayGoal: number | null
  remainingToMonthGoal: number | null
  saleTodayCents: number | null
  digitacoesToday: number
  digitacoesMonth: number
  clientesMonth: number
  aproveitamentoPct: number | null
  customerFlowMonth: number | null
  approvalRatePct: number | null
  pacePerDay: number | null
  workingDaysMonth: number
  workingDaysRemaining: number
  pendingCardsThisMonth: number
  storeCount: number
  employeeCount: number
  storeName: string | null
  months: MonthPoint[]
  recentCards: RecentCard[]
}

export type CardDayRow = {
  dateKey: string
  cards: number
  pending: number
  activated: number
  digitacoes: number
  goal: number | null
  limitCents: number
  usedCents: number
}

export type CardRecord = {
  id: string
  collaboratorId: string
  operatorName: string
  clientName: string
  amountInCents: number
  amountUsedInCents: number
  availableInCents: number
  createdAt: string
  dateKey: string
  storeId: string
  storeName: string
  activated: boolean
  activatedLater: boolean
}

export type CardsBoard = {
  monthKey: string
  storeId: string | null
  storeName: string | null
  canEdit: boolean
  cardsToday: number
  todayGoal: number | null
  cardsThisMonth: number
  cardsThisMonthRegistered: number
  cardTotalOverride: number | null
  monthGoal: number | null
  cardsTotal: number
  pendingCount: number
  activatedCount: number
  idleActivatedCount: number
  limitCents: number
  usedCents: number
  availableCents: number
  days: CardDayRow[]
  records: CardRecord[]
  people: StorePerson[]
}

export type CardMonthTotalWrite = {
  storeId: string
  monthKey: string
  total: number | null
  note?: string | null
}

export type CardWriteInput = {
  id?: string
  storeId: string
  collaboratorId: string
  clientName: string
  amountInCents: number
  amountUsedInCents: number
  activated: boolean
  dateKey?: string
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

export type FinanceDayRow = {
  dateKey: string
  saleCents: number | null
  goalCents: number | null
  lastYearCents: number | null
  pu: number | null
}

export type FinanceStoreDayRow = {
  dateKey: string
  storeId: string
  storeName: string
  saleCents: number | null
  goalCents: number | null
  lastYearCents: number | null
  pu: number | null
}

export type FinanceMetrics = {
  monthKey: string
  storeId: string | null
  storeName: string | null
  saleTodayCents: number | null
  salesThisMonthCents: number
  salesLastMonthCents: number
  monthSalesGoalCents: number | null
  remainingToMonthSalesGoalCents: number | null
  puAverage: number | null
  puRegisteredDays: number
  financeDaysTableMissing?: boolean
  storeCount: number
  registeredDaysThisMonth: number
  months: FinanceMonthPoint[]
  days: FinanceDayRow[]
  storeDays: FinanceStoreDayRow[]
  recentSales: DailySaleRow[]
}

export type DailySaleWriteInput = {
  storeId: string
  dateKey: string
  amountInCents: number
}

export type FinanceDayWriteInput = DailySaleWriteInput & {
  goalCents: number | null
  lastYearCents: number | null
  pu: number | null
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
  directorySource?: 'collaborator' | 'app_user'
  isGlobalDesk?: boolean
  globalDeskLabel?: string | null
}

export type EmployeeIdentity = {
  collaboratorId: string
  cpf: string | null
  flowRole: string | null
}

export type EmployeeDocument = {
  collaboratorId: string
  rgImage: string | null
  updatedAt: string | null
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

export type CreateEmployeeInput = Omit<EmployeeWriteInput, 'isActive'> & {
  accessUsername?: string
  accessPassword?: string
  accessDisplayName?: string
}

export type UpdateEmployeeInput = EmployeeWriteInput & {
  id: string
}

export type FlowLauncherUser = {
  id: string
  email: string
  displayName: string
  role: string
  roleLabel: string
  status: 'active' | 'inactive' | 'locked'
  storeId: string | null
  storeName: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type ActorScopeView = {
  role: string
  canViewAll: boolean
  storeId: string | null
  blocked: boolean
  message: string | null
}

export type FlowLauncherUserWrite = {
  id?: string
  email: string
  displayName: string
  role: string
  password?: string
  storeId?: string | null
  status?: 'active' | 'inactive'
}

export type OperationsApi = {
  getOverview: (storeId?: string | null) => Promise<OverviewMetrics>
  getFinance: (storeId?: string | null, monthKey?: string | null) => Promise<FinanceMetrics>
  listStores: () => Promise<StoreOption[]>
  listEmployees: (storeId?: string | null) => Promise<EmployeeListItem[]>
  getEmployee: (id: string, storeId?: string | null) => Promise<EmployeeProfile>
  getEmployeeIdentity: (id: string) => Promise<EmployeeIdentity>
  getEmployeeDocument: (id: string) => Promise<EmployeeDocument>
  saveEmployeeDocument: (input: { collaboratorId: string; rgImage: string | null }) => Promise<EmployeeDocument>
  createEmployee: (input: CreateEmployeeInput) => Promise<EmployeeListItem>
  updateEmployee: (input: UpdateEmployeeInput) => Promise<EmployeeListItem>
  deleteEmployee: (id: string, storeId?: string | null) => Promise<void>
  getStorePreference: () => Promise<string | null>
  setStorePreference: (storeId: string | null) => Promise<void>
  listStoreBoard: (storeId?: string | null) => Promise<StoreBoard>
  createStore: (input: StoreWriteInput) => Promise<StoreBoardItem>
  updateStore: (input: StoreWriteInput) => Promise<StoreBoardItem>
  listStoreAccess: (storeId: string) => Promise<StoreAccessAccount[]>
  upsertStoreAccess: (input: StoreAccessWriteInput) => Promise<StoreAccessAccount>
  getCardsBoard: (monthKey?: string | null, storeId?: string | null) => Promise<CardsBoard>
  upsertCardMonthTotal: (input: CardMonthTotalWrite) => Promise<CardsBoard>
  createCard: (input: CardWriteInput) => Promise<CardRecord>
  updateCard: (input: CardWriteInput) => Promise<CardRecord>
  transferCard: (id: string, collaboratorId: string) => Promise<CardRecord>
  deleteCard: (id: string) => Promise<void>
  upsertDailySale: (input: DailySaleWriteInput) => Promise<DailySaleRow>
  upsertFinanceDay: (input: FinanceDayWriteInput) => Promise<DailySaleRow>
  getScheduleBoard: (storeId?: string | null, weekStart?: string | null) => Promise<import('./schedules').ScheduleBoard>
  saveScheduleSlots: (storeId: string, slots: import('./schedules').ScheduleSlotWrite[], team?: import('./schedules').ScheduleTeam) => Promise<void>
  resetScheduleSlots: (storeId: string, team?: import('./schedules').ScheduleTeam) => Promise<void>
  upsertScheduleAssignment: (input: import('./schedules').ScheduleAssignmentWrite) => Promise<void>
  deleteScheduleAssignment: (id: string, storeId: string) => Promise<void>
  getAttendanceBoard: (storeId?: string | null, monthKey?: string | null) => Promise<import('./attendance').AttendanceBoard>
  upsertTeamHeadcount: (input: import('./attendance').TeamHeadcountWrite) => Promise<void>
  upsertAttendanceEvent: (input: import('./attendance').AttendanceEventWrite) => Promise<import('./attendance').AttendanceEvent>
  deleteAttendanceEvent: (id: string, storeId: string) => Promise<void>
  listVouchers: (storeId?: string | null) => Promise<import('./vouchers').VoucherBoard>
  updateVoucher: (input: {
    collaboratorId: string
    lunchCents?: number
    transportCents?: number
    status?: import('./vouchers').VoucherStatus
    signature?: string
  }) => Promise<void>
  listFlowUsers: () => Promise<FlowLauncherUser[]>
  upsertFlowUser: (input: FlowLauncherUserWrite) => Promise<FlowLauncherUser>
  getActorScope: () => Promise<ActorScopeView>
}
