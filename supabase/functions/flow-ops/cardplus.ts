import { CARDPLUS_SUB_ROLES, type CardPlusSubRole } from './_shared/operations.ts'
import { employeeRoleLabel, floorCardPlusRole, isFlowRole, isGlobalDeskRole, normalizePersonName, suggestedFlowRole } from './_shared/roles.ts'
import {
  dateKeyInSaoPaulo,
  dayBounds,
  daysElapsedInMonth,
  lastDayOfMonth,
  lastTwelveMonthKeys,
  monthBounds,
  monthKeyFromDateKey,
  monthLabel,
  shiftMonth,
  workingDaysInMonth
} from './dates.ts'
import {
  getIdentity,
  identityMask,
  listIdentities,
  parseIdentityInput,
  type IdentityRecord,
  upsertIdentity
} from './identities.ts'
import { getCardplusClient } from './supabase-clients.ts'
import type {
  CreateEmployeeInput,
  DailySaleRow,
  EmployeeListItem,
  EmployeeProfile,
  MonthPoint,
  FinanceMetrics,
  OverviewMetrics,
  RecentCard,
  StoreOption,
  UpdateEmployeeInput
} from './_shared/operations.ts'

type CollaboratorRow = {
  id: string
  name: string
  store_id: string
  sub_role: string
  is_active: boolean
  merged_into_id: string | null
  created_at: string
}

type StoreRow = {
  id: string
  name: string
  created_at?: string
}

type GoalRow = {
  store_id: string
  date_key: string
  goal: number
}

type RecordRow = {
  id: string
  collaborator_id: string
  operator_name: string
  client_name: string
  amount_in_cents: number
  created_at: string
  activated: boolean
  activated_later?: boolean
  amount_used_in_cents?: number | null
  store_id: string | null
  stores?: { name?: string | null } | null
}

export const MONTH_CARDS_PREFIX = 'month-cards:'
export const MONTH_SALES_PREFIX = 'month-sales:'
export const DAILY_SALE_PREFIX = 'daily-sale:'
const PAGE_SIZE = 1000
const MAX_PAGES = 80

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeCardPlusRole(value: string): CardPlusSubRole {
  const match = CARDPLUS_SUB_ROLES.find((role) => role.toLowerCase() === value.trim().toLowerCase())
  return match ?? 'Funcionario Operacional'
}

function collaboratorFloorRole(value: string): CardPlusSubRole {
  return normalizeCardPlusRole(floorCardPlusRole(value))
}

function belongsToStore(rowStoreId: string | null | undefined, storeId?: string | null): boolean {
  if (!storeId) return true
  return Boolean(rowStoreId) && rowStoreId === storeId
}

async function throwIfError<T>(
  result: { data: T; error: { message: string } | null },
  message: string
): Promise<T> {
  if (result.error) throw new Error(`${message}: ${result.error.message}`)
  return result.data
}

async function countRecords(filters: {
  start: string
  end: string
  collaboratorId?: string
  storeId?: string
}): Promise<number> {
  let query = getCardplusClient()
    .from('records')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', filters.start)
    .lte('created_at', filters.end)

  if (filters.collaboratorId) query = query.eq('collaborator_id', filters.collaboratorId)
  if (filters.storeId) query = query.eq('store_id', filters.storeId)

  const { count, error } = await query
  if (error) throw new Error(`Erro ao contar cartões: ${error.message}`)
  return count ?? 0
}

async function listPaged<T>(loadPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
    const page = await loadPage(from, from + PAGE_SIZE - 1)
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

export async function listStores(storeId?: string | null): Promise<StoreOption[]> {
  let query = getCardplusClient().from('stores').select('id, name, created_at').order('name')
  if (storeId) query = query.eq('id', storeId)
  const data = await throwIfError(await query, 'Erro ao carregar unidades')
  return ((data ?? []) as StoreRow[]).map((store) => ({
    id: store.id,
    name: store.name,
    createdAt: store.created_at
  }))
}

export async function createStore(name: string): Promise<StoreOption> {
  const normalized = normalizeName(name)
  if (!normalized) throw new Error('Nome da unidade é obrigatório.')
  const { data, error } = await getCardplusClient()
    .from('stores')
    .insert({ name: normalized })
    .select('id, name, created_at')
    .single()
  if (error || !data) {
    throw new Error(`Erro ao cadastrar unidade: ${error?.message ?? 'resposta vazia'}`)
  }
  const row = data as StoreRow
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

export async function renameStore(id: string, name: string): Promise<StoreOption> {
  const normalized = normalizeName(name)
  if (!normalized) throw new Error('Nome da unidade é obrigatório.')
  const { data, error } = await getCardplusClient()
    .from('stores')
    .update({ name: normalized })
    .eq('id', id)
    .select('id, name, created_at')
    .single()
  if (error || !data) {
    throw new Error(`Erro ao renomear unidade: ${error?.message ?? 'resposta vazia'}`)
  }
  const row = data as StoreRow
  return { id: row.id, name: row.name, createdAt: row.created_at }
}

export async function storeMonthCardsByStore(storeId?: string | null): Promise<Map<string, number>> {
  const bounds = monthBounds(monthKeyFromDateKey(dateKeyInSaoPaulo()))
  const rows = await listPaged(async (from, to) => {
    let query = getCardplusClient()
      .from('records')
      .select('store_id')
      .gte('created_at', bounds.start)
      .lte('created_at', bounds.end)
      .range(from, to)
    if (storeId) query = query.eq('store_id', storeId)
    const { data, error } = await query
    if (error) throw new Error(`Erro ao carregar cartões das unidades: ${error.message}`)
    return (data ?? []) as Array<{ store_id: string | null }>
  })
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.store_id) continue
    counts.set(row.store_id, (counts.get(row.store_id) ?? 0) + 1)
  }
  return counts
}

async function listCollaborators(storeId?: string | null): Promise<CollaboratorRow[]> {
  const rows = await listPaged(async (from, to) => {
    let query = getCardplusClient()
      .from('collaborators')
      .select('id, name, store_id, sub_role, is_active, merged_into_id, created_at')
      .order('name')
      .range(from, to)
    if (storeId) query = query.eq('store_id', storeId)
    const { data, error } = await query
    if (error) throw new Error(`Erro ao carregar funcionários: ${error.message}`)
    return (data ?? []) as CollaboratorRow[]
  })
  return rows.filter((row) => !row.merged_into_id && belongsToStore(row.store_id, storeId))
}

export async function getCollaboratorOrNull(id: string): Promise<CollaboratorRow | null> {
  const data = await throwIfError(
    await getCardplusClient()
      .from('collaborators')
      .select('id, name, store_id, sub_role, is_active, merged_into_id, created_at')
      .eq('id', id)
      .maybeSingle(),
    'Erro ao carregar funcionário'
  )
  return (data as CollaboratorRow | null) ?? null
}

async function getCollaborator(id: string): Promise<CollaboratorRow> {
  const data = await getCollaboratorOrNull(id)
  if (!data) throw new Error('Funcionário não encontrado.')
  return data
}

async function findCollaboratorByName(name: string, storeId?: string): Promise<CollaboratorRow | null> {
  const rows = await listCollaborators(storeId)
  const key = normalizePersonName(name)
  if (!key) return null
  const matches = rows.filter((row) => normalizePersonName(row.name) === key)
  if (storeId) return matches.find((row) => row.store_id === storeId) ?? null
  return matches.length === 1 ? matches[0] : null
}

async function monthCardCounts(monthKey: string, storeId?: string | null): Promise<Map<string, number>> {
  const bounds = monthBounds(monthKey)
  const rows = await listPaged(async (from, to) => {
    let query = getCardplusClient()
      .from('records')
      .select('collaborator_id')
      .gte('created_at', bounds.start)
      .lte('created_at', bounds.end)
      .range(from, to)
    if (storeId) query = query.eq('store_id', storeId)
    const { data, error } = await query
    if (error) throw new Error(`Erro ao carregar cartões do mês: ${error.message}`)
    return (data ?? []) as Array<{ collaborator_id: string }>
  })

  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.collaborator_id, (counts.get(row.collaborator_id) ?? 0) + 1)
  }
  return counts
}

async function listRecentCards(
  limit: number,
  collaboratorId?: string,
  storeId?: string | null
): Promise<RecentCard[]> {
  let query = getCardplusClient()
    .from('records')
    .select('id, collaborator_id, operator_name, client_name, amount_in_cents, amount_used_in_cents, created_at, activated, activated_later, store_id, stores(name)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (collaboratorId) query = query.eq('collaborator_id', collaboratorId)
  if (storeId) query = query.eq('store_id', storeId)

  const data = await throwIfError(await query, 'Erro ao carregar cartões recentes')
  return ((data ?? []) as RecordRow[])
    .filter((row) => belongsToStore(row.store_id, storeId))
    .map((row) => ({
    id: row.id,
    operatorName: row.operator_name,
    clientName: row.client_name,
    amountInCents: row.amount_in_cents,
    amountUsedInCents: row.amount_used_in_cents ?? 0,
    createdAt: row.created_at,
    storeName: row.stores?.name ?? 'Unidade',
    activated: row.activated,
    activatedLater: Boolean(row.activated_later)
  }))
}

async function monthGoalMap(monthKeys: string[], storeId?: string | null): Promise<Map<string, number>> {
  const data = await listGoalsByPrefix(MONTH_CARDS_PREFIX, storeId)
  const wanted = new Set(monthKeys.map((key) => `${MONTH_CARDS_PREFIX}${key}`))
  const totals = new Map<string, number>()
  for (const row of data) {
    if (!wanted.has(row.date_key) || !belongsToStore(row.store_id, storeId)) continue
    const monthKey = row.date_key.slice(MONTH_CARDS_PREFIX.length)
    totals.set(monthKey, (totals.get(monthKey) ?? 0) + row.goal)
  }
  return totals
}

async function storeMonthGoal(storeId: string, monthKey: string): Promise<number | null> {
  const { data, error } = await getCardplusClient()
    .from('daily_goals')
    .select('goal')
    .eq('store_id', storeId)
    .eq('date_key', `${MONTH_CARDS_PREFIX}${monthKey}`)
    .maybeSingle()

  if (error) throw new Error(`Erro ao carregar meta da unidade: ${error.message}`)
  return typeof data?.goal === 'number' ? data.goal : null
}

async function todayGoalTotal(dateKey: string, storeId?: string | null): Promise<number | null> {
  let query = getCardplusClient().from('daily_goals').select('goal, date_key').eq('date_key', dateKey)
  if (storeId) query = query.eq('store_id', storeId)
  const { data, error } = await query

  if (error) throw new Error(`Erro ao carregar meta do dia: ${error.message}`)
  const rows = (data ?? []) as Array<{ goal: number }>
  if (rows.length === 0) return null
  return rows.reduce((total, row) => total + row.goal, 0)
}

export async function listGoalsByPrefix(prefix: string, storeId?: string | null): Promise<GoalRow[]> {
  return listPaged(async (from, to) => {
    let query = getCardplusClient()
      .from('daily_goals')
      .select('store_id, date_key, goal')
      .like('date_key', `${prefix}%`)
      .range(from, to)
    if (storeId) query = query.eq('store_id', storeId)
    const { data, error } = await query
    if (error) throw new Error(`Erro ao carregar planejamento do Card+: ${error.message}`)
    return ((data ?? []) as GoalRow[]).filter((row) => belongsToStore(row.store_id, storeId))
  })
}

function sumMatchingGoals(rows: GoalRow[], match: (row: GoalRow) => boolean): number | null {
  let total = 0
  let found = false
  for (const row of rows) {
    if (!match(row)) continue
    found = true
    total += row.goal
  }
  return found ? total : null
}

function monthSalesGoalMapFromRows(rows: GoalRow[], monthKeys: string[]): Map<string, number> {
  const wanted = new Set(monthKeys.map((key) => `${MONTH_SALES_PREFIX}${key}`))
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (!wanted.has(row.date_key)) continue
    const monthKey = row.date_key.slice(MONTH_SALES_PREFIX.length)
    totals.set(monthKey, (totals.get(monthKey) ?? 0) + row.goal)
  }
  return totals
}

function dailySalesByMonth(rows: GoalRow[], monthKeys: string[]): Map<string, number> {
  const wanted = new Set(monthKeys)
  const totals = new Map<string, number>()
  for (const key of monthKeys) totals.set(key, 0)
  for (const row of rows) {
    if (!row.date_key.startsWith(DAILY_SALE_PREFIX)) continue
    const dateKey = row.date_key.slice(DAILY_SALE_PREFIX.length)
    const monthKey = monthKeyFromDateKey(dateKey)
    if (!wanted.has(monthKey)) continue
    totals.set(monthKey, (totals.get(monthKey) ?? 0) + row.goal)
  }
  return totals
}

function toEmployeeItem(
  row: CollaboratorRow,
  stores: Map<string, string>,
  identity: IdentityRecord | null | undefined,
  cardsThisMonth: number
): EmployeeListItem {
  const flowRole = suggestedFlowRole(identity?.flowRole, row.sub_role)
  return {
    id: row.id,
    name: row.name,
    storeId: row.store_id,
    storeName: stores.get(row.store_id) ?? 'Unidade',
    cardplusRole: floorCardPlusRole(row.sub_role),
    flowRole,
    flowRoleLabel: employeeRoleLabel(flowRole, row.sub_role),
    cpfMasked: identityMask(identity),
    hasCpf: Boolean(identity?.cpfDigits),
    isActive: row.is_active,
    cardsThisMonth,
    createdAt: row.created_at,
    sundayCycle: identity?.sundayCycle ?? null,
    sundayCycleStart: identity?.sundayCycleStart ?? null,
    directorySource: 'collaborator',
    isGlobalDesk: false
  }
}

async function sumDigitacoes(range: { start: string; end: string }, storeId?: string | null): Promise<number> {
  const rows = await listPaged(async (from, to) => {
    let query = getCardplusClient()
      .from('digitacoes')
      .select('quantity, store_id')
      .gte('created_at', range.start)
      .lte('created_at', range.end)
      .range(from, to)
    if (storeId) query = query.eq('store_id', storeId)
    const { data, error } = await query
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return []
      throw new Error(`Erro ao carregar digitações: ${error.message}`)
    }
    return (data ?? []) as Array<{ quantity: number | null; store_id: string | null }>
  })
  return rows
    .filter((row) => belongsToStore(row.store_id, storeId))
    .reduce((total, row) => total + (Number(row.quantity) || 0), 0)
}

async function sumCustomerFlow(monthKey: string, storeId?: string | null): Promise<number | null> {
  const last = String(lastDayOfMonth(monthKey)).padStart(2, '0')
  try {
    const rows = await listPaged(async (from, to) => {
      let query = getCardplusClient()
        .from('daily_metrics')
        .select('total_customers, date_key, store_id')
        .gte('date_key', `${monthKey}-01`)
        .lte('date_key', `${monthKey}-${last}`)
        .range(from, to)
      if (storeId) query = query.eq('store_id', storeId)
      const { data, error } = await query
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return []
        throw error
      }
      return (data ?? []) as Array<{ total_customers: number | null; date_key: string; store_id: string | null }>
    })
    const scoped = rows.filter((row) => belongsToStore(row.store_id, storeId))
    if (scoped.length === 0) return null
    return scoped.reduce((total, row) => total + (Number(row.total_customers) || 0), 0)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/42P01|PGRST205/.test(message)) return null
    throw new Error(`Erro ao carregar fluxo de clientes: ${message}`)
  }
}

async function countPendingCards(range: { start: string; end: string }, storeId?: string | null): Promise<number> {
  let query = getCardplusClient()
    .from('records')
    .select('id', { count: 'exact', head: true })
    .eq('activated', false)
    .gte('created_at', range.start)
    .lte('created_at', range.end)
  if (storeId) query = query.eq('store_id', storeId)
  const { count, error } = await query
  if (error) throw new Error(`Erro ao contar cartões pendentes: ${error.message}`)
  return count ?? 0
}

export async function getOverview(storeId?: string | null): Promise<OverviewMetrics> {
  const today = dateKeyInSaoPaulo()
  const monthKey = monthKeyFromDateKey(today)
  const lastMonthKey = shiftMonth(monthKey, -1)
  const monthKeys = lastTwelveMonthKeys(monthKey)
  const todayRange = dayBounds(today)
  const monthRange = monthBounds(monthKey)
  const todaySaleKey = `${DAILY_SALE_PREFIX}${today}`

  const [stores, collaborators, cardsToday, monthCounts, goals, todayGoal, recentCards, digitacoesToday, digitacoesMonth, customerFlow, pendingCards, saleRows] = await Promise.all([
    listStores(storeId),
    listCollaborators(storeId),
    countRecords({ ...todayRange, storeId: storeId ?? undefined }),
    Promise.all(
      monthKeys.map(async (key) => ({
        key,
        cards: await countRecords({ ...monthBounds(key), storeId: storeId ?? undefined })
      }))
    ),
    monthGoalMap(monthKeys, storeId),
    todayGoalTotal(today, storeId),
    listRecentCards(8, undefined, storeId),
    sumDigitacoes(todayRange, storeId),
    sumDigitacoes(monthRange, storeId),
    sumCustomerFlow(monthKey, storeId),
    countPendingCards(monthRange, storeId),
    listGoalsByPrefix(DAILY_SALE_PREFIX, storeId)
  ])

  const countsByMonth = new Map(monthCounts.map((row) => [row.key, row.cards]))
  const months = monthKeys.map((key) => ({
    key,
    label: monthLabel(key),
    cards: countsByMonth.get(key) ?? 0,
    goal: goals.get(key) ?? null
  })) satisfies MonthPoint[]

  const monthGoal = goals.get(monthKey) ?? null
  const cardsThisMonth = countsByMonth.get(monthKey) ?? 0
  const clientesMonth = customerFlow ?? 0
  const conversionBase = digitacoesMonth + cardsThisMonth
  const remainingToMonthGoal = monthGoal === null ? null : Math.max(monthGoal - cardsThisMonth, 0)
  const workingDays = workingDaysInMonth(monthKey)
  const remainingDays = workingDaysInMonth(monthKey, today)
  const pacePerDay =
    remainingToMonthGoal === null || remainingDays === 0
      ? null
      : Math.round(remainingToMonthGoal / remainingDays)

  return {
    cardsToday,
    cardsThisMonth,
    cardsLastMonth: countsByMonth.get(lastMonthKey) ?? 0,
    monthGoal,
    todayGoal,
    remainingToMonthGoal,
    saleTodayCents: sumMatchingGoals(saleRows, (row) => row.date_key === todaySaleKey),
    digitacoesToday,
    digitacoesMonth,
    clientesMonth,
    aproveitamentoPct: conversionBase > 0 ? Number(((cardsThisMonth / conversionBase) * 100).toFixed(1)) : null,
    customerFlowMonth: customerFlow,
    approvalRatePct: digitacoesMonth > 0 ? Number(((cardsThisMonth / digitacoesMonth) * 100).toFixed(1)) : null,
    pacePerDay,
    workingDaysMonth: workingDays,
    workingDaysRemaining: remainingDays,
    pendingCardsThisMonth: pendingCards,
    storeCount: stores.length,
    employeeCount: collaborators.filter((row) => row.is_active && row.name.trim().toUpperCase() !== 'CAIXA').length,
    storeName: storeId ? stores[0]?.name ?? null : null,
    months,
    recentCards
  }
}

export async function getFinance(storeId?: string | null, monthKeyInput?: string | null): Promise<FinanceMetrics> {
  const today = dateKeyInSaoPaulo()
  const currentMonth = monthKeyFromDateKey(today)
  const monthKey = monthKeyInput && /^\d{4}-\d{2}$/.test(monthKeyInput) ? monthKeyInput : currentMonth
  const lastMonthKey = shiftMonth(monthKey, -1)
  const monthKeys = lastTwelveMonthKeys(monthKey)
  const todaySaleKey = `${DAILY_SALE_PREFIX}${today}`

  const [stores, salesGoalRows, dailySaleRows] = await Promise.all([
    listStores(storeId),
    listGoalsByPrefix(MONTH_SALES_PREFIX, storeId),
    listGoalsByPrefix(DAILY_SALE_PREFIX, storeId)
  ])

  const storeMap = new Map(stores.map((store) => [store.id, store.name]))
  const monthGoals = monthSalesGoalMapFromRows(salesGoalRows, monthKeys)
  const monthSales = dailySalesByMonth(dailySaleRows, monthKeys)
  const monthSalesGoalCents = monthGoals.get(monthKey) ?? null
  const salesThisMonthCents = monthSales.get(monthKey) ?? 0
  const saleTodayCents =
    monthKey === currentMonth ? sumMatchingGoals(dailySaleRows, (row) => row.date_key === todaySaleKey) : null

  const salesByDate = new Map<string, number>()
  const registeredDates = new Set<string>()
  for (const row of dailySaleRows) {
    if (!row.date_key.startsWith(DAILY_SALE_PREFIX) || !belongsToStore(row.store_id, storeId)) continue
    const dateKey = row.date_key.slice(DAILY_SALE_PREFIX.length)
    if (!dateKey.startsWith(monthKey)) continue
    registeredDates.add(dateKey)
    salesByDate.set(dateKey, (salesByDate.get(dateKey) ?? 0) + row.goal)
  }

  const last = lastDayOfMonth(monthKey)
  const days = Array.from({ length: last }, (_, index) => {
    const dateKey = `${monthKey}-${String(last - index).padStart(2, '0')}`
    return {
      dateKey,
      saleCents: registeredDates.has(dateKey) ? (salesByDate.get(dateKey) ?? 0) : null,
      goalCents: null,
      lastYearCents: null,
      pu: null
    }
  })

  const recentSales = dailySaleRows
    .map((row) => {
      const dateKey = row.date_key.slice(DAILY_SALE_PREFIX.length)
      return {
        dateKey,
        storeId: row.store_id,
        storeName: storeMap.get(row.store_id) ?? 'Unidade',
        amountInCents: row.goal
      }
    })
    .filter((row) => row.dateKey.startsWith(monthKey) && belongsToStore(row.storeId, storeId))
    .sort((left, right) => {
      const byDate = right.dateKey.localeCompare(left.dateKey)
      if (byDate !== 0) return byDate
      return left.storeName.localeCompare(right.storeName, 'pt-BR')
    })

  return {
    monthKey,
    storeId: storeId ?? null,
    storeName: storeId ? stores[0]?.name ?? null : null,
    saleTodayCents,
    salesThisMonthCents,
    salesLastMonthCents: monthSales.get(lastMonthKey) ?? 0,
    monthSalesGoalCents,
    remainingToMonthSalesGoalCents:
      monthSalesGoalCents === null ? null : Math.max(monthSalesGoalCents - salesThisMonthCents, 0),
    puAverage: null,
    puRegisteredDays: 0,
    storeCount: stores.length,
    registeredDaysThisMonth: registeredDates.size,
    months: monthKeys.map((key) => ({
      key,
      label: monthLabel(key),
      salesCents: monthSales.get(key) ?? 0,
      goalCents: monthGoals.get(key) ?? null
    })),
    days,
    storeDays: [],
    recentSales
  }
}

export async function upsertDailySale(input: {
  storeId: string
  dateKey: string
  amountInCents: number
}): Promise<DailySaleRow> {
  if (!input.storeId) throw new Error('Unidade é obrigatória.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) throw new Error('Data inválida.')
  if (!Number.isFinite(input.amountInCents) || input.amountInCents < 0) {
    throw new Error('Valor de venda inválido.')
  }
  const amountInCents = Math.round(input.amountInCents)
  const dateKey = `${DAILY_SALE_PREFIX}${input.dateKey}`
  const stores = await listStores(input.storeId)
  const store = stores[0]
  if (!store) throw new Error('Unidade não encontrada no Card+.')

  const existing = await throwIfError(
    await getCardplusClient()
      .from('daily_goals')
      .select('store_id, date_key, goal')
      .eq('store_id', input.storeId)
      .eq('date_key', dateKey)
      .maybeSingle(),
    'Erro ao carregar venda do dia'
  )

  if (existing) {
    const { error } = await getCardplusClient()
      .from('daily_goals')
      .update({ goal: amountInCents })
      .eq('store_id', input.storeId)
      .eq('date_key', dateKey)
    if (error) throw new Error(`Erro ao atualizar venda do dia: ${error.message}`)
  } else {
    const { error } = await getCardplusClient().from('daily_goals').insert({
      store_id: input.storeId,
      date_key: dateKey,
      goal: amountInCents
    })
    if (error) throw new Error(`Erro ao registrar venda do dia: ${error.message}`)
  }

  return {
    dateKey: input.dateKey,
    storeId: input.storeId,
    storeName: store.name,
    amountInCents
  }
}

export async function listEmployees(storeId?: string | null): Promise<EmployeeListItem[]> {
  const [collaborators, stores, identities, monthCounts] = await Promise.all([
    listCollaborators(storeId),
    listStores(storeId),
    listIdentities(),
    monthCardCounts(monthKeyFromDateKey(dateKeyInSaoPaulo()), storeId)
  ])

  const storeMap = new Map(stores.map((store) => [store.id, store.name]))
  return collaborators
    .filter((row) => !storeId || row.store_id === storeId)
    .map((row) => toEmployeeItem(row, storeMap, identities.get(row.id), monthCounts.get(row.id) ?? 0))
}

export async function assertEmployeeInStore(id: string, storeId?: string | null): Promise<void> {
  const current = await getCollaborator(id)
  if (storeId && current.store_id !== storeId) {
    throw new Error('Funcionário fora da unidade selecionada.')
  }
}

export async function getEmployee(id: string, storeId?: string | null): Promise<EmployeeProfile> {
  const today = dateKeyInSaoPaulo()
  const monthKey = monthKeyFromDateKey(today)
  const monthKeys = lastTwelveMonthKeys(monthKey)
  const todayRange = dayBounds(today)

  const row = await getCollaborator(id)
  if (storeId && row.store_id !== storeId) {
    throw new Error('Funcionário fora da unidade selecionada.')
  }
  const [stores, identity, cardsToday, monthCounts, cardsTotal, storeGoal, recentCards, edges, latest] =
    await Promise.all([
      listStores(),
      getIdentity(id),
      countRecords({ ...todayRange, collaboratorId: id }),
      Promise.all(
        monthKeys.map(async (key) => ({
          key,
          cards: await countRecords({ ...monthBounds(key), collaboratorId: id })
        }))
      ),
      (async () => {
        const { count, error } = await getCardplusClient()
          .from('records')
          .select('id', { count: 'exact', head: true })
          .eq('collaborator_id', id)
        if (error) throw new Error(`Erro ao contar cartões do funcionário: ${error.message}`)
        return count ?? 0
      })(),
      storeMonthGoal(row.store_id, monthKey),
      listRecentCards(12, id),
      getCardplusClient()
        .from('records')
        .select('created_at')
        .eq('collaborator_id', id)
        .order('created_at', { ascending: true })
        .limit(1),
      getCardplusClient()
        .from('records')
        .select('created_at')
        .eq('collaborator_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
    ])

  if (edges.error) throw new Error(`Erro ao carregar histórico: ${edges.error.message}`)
  if (latest.error) throw new Error(`Erro ao carregar último cartão: ${latest.error.message}`)

  const countsByMonth = new Map(monthCounts.map((row) => [row.key, row.cards]))
  const cardsThisMonth = countsByMonth.get(monthKey) ?? 0
  const storeMap = new Map(stores.map((store) => [store.id, store.name]))
  const employee = toEmployeeItem(row, storeMap, identity, cardsThisMonth)

  const months = monthKeys.map((key) => ({
    key,
    label: monthLabel(key),
    cards: countsByMonth.get(key) ?? 0,
    goal: null
  })) satisfies MonthPoint[]

  const elapsed = daysElapsedInMonth(today)
  const projectedMonth = elapsed > 0 ? Math.round((cardsThisMonth / elapsed) * lastDayOfMonth(monthKey)) : null

  return {
    employee,
    metrics: {
      cardsToday,
      cardsThisMonth,
      cardsTotal,
      firstCardAt: edges.data?.[0]?.created_at ?? null,
      lastCardAt: latest.data?.[0]?.created_at ?? null,
      storeMonthGoal: storeGoal,
      projectedMonth,
      projectionLabel:
        'Estimativa com base no ritmo atual do mês. Não é informação do Card+.'
    },
    months,
    recentCards
  }
}

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeListItem> {
  const name = normalizeName(input.name)
  if (!name) throw new Error('Nome é obrigatório.')
  if (!input.storeId) throw new Error('Unidade é obrigatória.')
  parseIdentityInput(input.cpf, input.flowRole)

  const { data, error } = await getCardplusClient()
    .from('collaborators')
    .insert({
      name,
      store_id: input.storeId,
      sub_role: collaboratorFloorRole(input.cardplusRole),
      is_active: true
    })
    .select('id, name, store_id, sub_role, is_active, merged_into_id, created_at')
    .single()

  if (error || !data) {
    throw new Error(`Erro ao cadastrar funcionário: ${error?.message ?? 'resposta vazia'}`)
  }

  await upsertIdentity(data.id, input.cpf, input.flowRole)
  const [stores, identity] = await Promise.all([listStores(), getIdentity(data.id)])
  const storeMap = new Map(stores.map((store) => [store.id, store.name]))
  return toEmployeeItem(data as CollaboratorRow, storeMap, identity, 0)
}

export async function updateEmployee(input: UpdateEmployeeInput): Promise<EmployeeListItem> {
  const name = normalizeName(input.name)
  if (!name) throw new Error('Nome é obrigatório.')
  if (!input.storeId) throw new Error('Unidade é obrigatória.')
  parseIdentityInput(input.cpf, input.flowRole)

  const current = await getCollaboratorOrNull(input.id)
  if (!current) {
    const existing = await findCollaboratorByName(name, input.storeId)
    if (existing) {
      const existingIdentity = await getIdentity(existing.id)
      const cpf = input.cpf.trim() || existingIdentity?.cpfDigits || ''
      await upsertIdentity(input.id, cpf, input.flowRole)
      return updateEmployee({ ...input, id: existing.id, cpf })
    }
    await upsertIdentity(input.id, input.cpf, input.flowRole)
    return createEmployee({
      name,
      storeId: input.storeId,
      cardplusRole: collaboratorFloorRole(input.cardplusRole),
      flowRole: input.flowRole,
      cpf: input.cpf
    })
  }

  const nextRole = collaboratorFloorRole(input.cardplusRole)
  const { error } = await getCardplusClient()
    .from('collaborators')
    .update({
      name,
      store_id: input.storeId,
      sub_role: nextRole,
      is_active: input.isActive
    })
    .eq('id', input.id)

  if (error) throw new Error(`Erro ao atualizar funcionário: ${error.message}`)

  if (current.name !== name) {
    const rename = await getCardplusClient()
      .from('records')
      .update({ operator_name: name })
      .eq('collaborator_id', input.id)
    if (rename.error) throw new Error(`Erro ao atualizar nome nos cartões: ${rename.error.message}`)
  }

  if (current.store_id !== input.storeId) {
    const transfer = await getCardplusClient()
      .from('records')
      .update({ store_id: input.storeId })
      .eq('collaborator_id', input.id)
    if (transfer.error) throw new Error(`Erro ao transferir cartões: ${transfer.error.message}`)
  }

  await upsertIdentity(input.id, input.cpf, input.flowRole)

  const [stores, identity, monthCounts] = await Promise.all([
    listStores(),
    getIdentity(input.id),
    monthCardCounts(monthKeyFromDateKey(dateKeyInSaoPaulo()))
  ])
  const storeMap = new Map(stores.map((store) => [store.id, store.name]))
  const updated = {
    ...current,
    name,
    store_id: input.storeId,
    sub_role: nextRole,
    is_active: input.isActive
  }
  return toEmployeeItem(updated, storeMap, identity, monthCounts.get(input.id) ?? 0)
}

export async function ensureOperationalCollaborator(input: {
  storeId: string
  name: string
  flowRole?: string | null
  sourceId?: string | null
}): Promise<EmployeeListItem> {
  const name = normalizeName(input.name)
  if (!name) throw new Error('Nome é obrigatório.')
  if (!input.storeId) throw new Error('Unidade é obrigatória.')
  const wantedRole =
    input.flowRole && isFlowRole(input.flowRole) && input.flowRole !== 'SUPERVISOR'
      ? input.flowRole
      : 'LIDER_OPERACAO'

  const existing = await findCollaboratorByName(name, input.storeId)
  if (existing) {
    const identity = await getIdentity(existing.id)
    const nextFlow = identity?.flowRole && identity.flowRole !== 'SUPERVISOR' ? identity.flowRole : wantedRole
    if (isGlobalDeskRole(existing.sub_role)) {
      const { error } = await getCardplusClient()
        .from('collaborators')
        .update({ sub_role: 'Funcionario Operacional', merged_into_id: null, is_active: true })
        .eq('id', existing.id)
      if (error) throw new Error(`Erro ao tornar o TI operacional na loja: ${error.message}`)
      existing.sub_role = 'Funcionario Operacional'
    }
    const cpf = identity?.cpfDigits ?? ''
    await upsertIdentity(existing.id, cpf, nextFlow)
    if (input.sourceId && input.sourceId !== existing.id) {
      await upsertIdentity(input.sourceId, cpf, nextFlow)
    }
    const stores = await listStores()
    const storeMap = new Map(stores.map((store) => [store.id, store.name]))
    return toEmployeeItem({ ...existing, is_active: true }, storeMap, await getIdentity(existing.id), 0)
  }

  const created = await createEmployee({
    name,
    storeId: input.storeId,
    cardplusRole: 'Funcionario Operacional',
    flowRole: wantedRole,
    cpf: ''
  })
  if (input.sourceId && input.sourceId !== created.id) {
    await upsertIdentity(input.sourceId, '', wantedRole)
  }
  return created
}

export async function ensureCaixaCollaborator(storeId: string): Promise<string> {
  const { data: existing, error: findError } = await getCardplusClient()
    .from('collaborators')
    .select('id, is_active')
    .eq('store_id', storeId)
    .ilike('name', 'CAIXA')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (findError) throw new Error(`Erro ao buscar colaborador CAIXA: ${findError.message}`)

  if (existing?.id) {
    if (!existing.is_active) {
      const { error } = await getCardplusClient()
        .from('collaborators')
        .update({ is_active: true, merged_into_id: null })
        .eq('id', existing.id)
      if (error) throw new Error(`Erro ao reativar CAIXA: ${error.message}`)
    }
    return existing.id
  }

  const { data: created, error: createError } = await getCardplusClient()
    .from('collaborators')
    .insert({ name: 'CAIXA', store_id: storeId, sub_role: 'Caixa', is_active: true })
    .select('id')
    .single()

  if (createError || !created?.id) {
    throw new Error(`Não foi possível criar o colaborador CAIXA: ${createError?.message ?? 'resposta vazia'}`)
  }
  return created.id
}

export async function deleteEmployee(id: string, storeId?: string | null): Promise<void> {
  const current = await getCollaborator(id)
  if (storeId && current.store_id !== storeId) {
    throw new Error('Funcionário fora da unidade selecionada.')
  }
  if (normalizeName(current.name).toUpperCase() === 'CAIXA') {
    throw new Error('O colaborador fixo CAIXA não pode ser excluído.')
  }

  const caixaId = await ensureCaixaCollaborator(current.store_id)

  const records = await getCardplusClient()
    .from('records')
    .update({ collaborator_id: caixaId, operator_name: 'CAIXA' })
    .eq('collaborator_id', id)
    .eq('store_id', current.store_id)
  if (records.error) {
    throw new Error(`Erro ao transferir cartões para o CAIXA: ${records.error.message}`)
  }

  const optional = await Promise.all([
    getCardplusClient()
      .from('digitacoes')
      .update({ collaborator_id: caixaId, operator_name: 'CAIXA' })
      .eq('collaborator_id', id)
      .eq('store_id', current.store_id),
    getCardplusClient()
      .from('viradas_pu')
      .update({ collaborator_id: caixaId, collaborator_name: 'CAIXA' })
      .eq('collaborator_id', id)
      .eq('store_id', current.store_id),
    getCardplusClient()
      .from('remarcacoes')
      .update({ collaborator_id: caixaId, operator_name: 'CAIXA' })
      .eq('collaborator_id', id)
      .eq('store_id', current.store_id)
  ])

  const optionalError = optional.find((result) => {
    const code = result.error?.code
    return result.error && code !== '42P01' && code !== '42703' && code !== 'PGRST204'
  })?.error
  if (optionalError) {
    throw new Error(`Erro ao transferir dependências para o CAIXA: ${optionalError.message}`)
  }

  const { error } = await getCardplusClient().from('collaborators').delete().eq('id', id)
  if (error) {
    if (error.code === '23503') {
      throw new Error('Não foi possível excluir. Os cartões foram transferidos, mas ainda há vínculo no Card+.')
    }
    throw new Error(`Erro ao excluir funcionário no Card+: ${error.message}`)
  }
}
