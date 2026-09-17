import log from 'electron-log'
import type { FinanceDayRow, FinanceMetrics, FinanceStoreDayRow } from '../shared/operations'
import { getFinance, listStores } from './cardplus'
import { dateKeyInSaoPaulo, lastDayOfMonth, monthKeyFromDateKey } from './dates'
import { getFlowAdminClient } from './supabase-clients'

type FlowFinanceDayRow = {
  cardplus_store_id: string
  date_key: string
  goal_cents: number | string | null
  last_year_cents: number | string | null
  pu: number | string | null
}

export type FlowFinanceDay = {
  storeId: string
  dateKey: string
  goalCents: number | null
  lastYearCents: number | null
  pu: number | null
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_finance_days/i.test(error.message ?? '')
  )
}

export function missingFinanceDaysSql(): Error {
  return new Error('Rode o SQL 0007_flow_finance_days.sql no Supabase do FLOW para registrar meta do dia, last year e PU.')
}

function asNullableNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) return null
  return amount
}

function round1(value: number): number {
  return Number(value.toFixed(1))
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return round1(values.reduce((total, item) => total + item, 0) / values.length)
}

function sumOrNull(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((total, item) => total + item, 0)
}

function toFlowDay(row: FlowFinanceDayRow): FlowFinanceDay {
  return {
    storeId: row.cardplus_store_id,
    dateKey: row.date_key,
    goalCents: asNullableNumber(row.goal_cents),
    lastYearCents: asNullableNumber(row.last_year_cents),
    pu: asNullableNumber(row.pu)
  }
}

function resolveMonthKey(monthKey?: string | null): string {
  if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) return monthKey
  return monthKeyFromDateKey(dateKeyInSaoPaulo())
}

export async function getFinanceBoard(storeId?: string | null, monthKey?: string | null): Promise<FinanceMetrics> {
  const [finance, flowRows, stores] = await Promise.all([
    getFinance(storeId, monthKey),
    listFinanceDays(monthKey, storeId),
    listStores(storeId)
  ])
  return mergeFinanceDays(finance, flowRows, new Map(stores.map((store) => [store.id, store.name])))
}

export async function listFinanceDays(monthKey?: string | null, storeId?: string | null): Promise<FlowFinanceDay[]> {
  const key = resolveMonthKey(monthKey)
  const last = String(lastDayOfMonth(key)).padStart(2, '0')
  let query = getFlowAdminClient()
    .from('flow_finance_days')
    .select('cardplus_store_id, date_key, goal_cents, last_year_cents, pu')
    .gte('date_key', `${key}-01`)
    .lte('date_key', `${key}-${last}`)

  if (storeId) query = query.eq('cardplus_store_id', storeId)

  const { data, error } = await query
  if (error) {
    if (isMissingTable(error)) {
      log.warn('[finance-days] tabela flow_finance_days ainda não existe')
      return []
    }
    throw new Error(`Erro ao carregar o dia financeiro: ${error.message}`)
  }

  return ((data ?? []) as FlowFinanceDayRow[]).map(toFlowDay)
}

export function mergeFinanceDays(
  finance: FinanceMetrics,
  flowRows: FlowFinanceDay[],
  storeNames: Map<string, string>
): FinanceMetrics {
  const flowByDate = new Map<string, FlowFinanceDay[]>()
  for (const row of flowRows) {
    const list = flowByDate.get(row.dateKey) ?? []
    list.push(row)
    flowByDate.set(row.dateKey, list)
  }

  const days: FinanceDayRow[] = finance.days.map((day) => {
    const extras = flowByDate.get(day.dateKey) ?? []
    const pus = extras.map((item) => item.pu).filter((value): value is number => value !== null)
    return {
      dateKey: day.dateKey,
      saleCents: day.saleCents,
      goalCents: sumOrNull(extras.map((item) => item.goalCents).filter((value): value is number => value !== null)),
      lastYearCents: sumOrNull(
        extras.map((item) => item.lastYearCents).filter((value): value is number => value !== null)
      ),
      pu: average(pus)
    }
  })

  const storeDayMap = new Map<string, FinanceStoreDayRow>()
  for (const sale of finance.recentSales) {
    storeDayMap.set(`${sale.storeId}:${sale.dateKey}`, {
      dateKey: sale.dateKey,
      storeId: sale.storeId,
      storeName: sale.storeName,
      saleCents: sale.amountInCents,
      goalCents: null,
      lastYearCents: null,
      pu: null
    })
  }
  for (const row of flowRows) {
    const key = `${row.storeId}:${row.dateKey}`
    const existing = storeDayMap.get(key)
    storeDayMap.set(key, {
      dateKey: row.dateKey,
      storeId: row.storeId,
      storeName: existing?.storeName ?? storeNames.get(row.storeId) ?? 'Unidade',
      saleCents: existing?.saleCents ?? null,
      goalCents: row.goalCents,
      lastYearCents: row.lastYearCents,
      pu: row.pu
    })
  }

  const storeDays = [...storeDayMap.values()].sort((left, right) => {
    const byDate = right.dateKey.localeCompare(left.dateKey)
    if (byDate !== 0) return byDate
    return left.storeName.localeCompare(right.storeName, 'pt-BR')
  })

  const dailyPu = days.map((day) => day.pu).filter((value): value is number => value !== null)

  return {
    ...finance,
    days,
    storeDays,
    puAverage: average(dailyPu),
    puRegisteredDays: dailyPu.length
  }
}

function parseMoneyCents(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${field} inválido.`)
  }
  return Math.round(amount)
}

function parsePu(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('PU inválido.')
  }
  return round1(amount)
}

export async function upsertFinanceDayExtras(input: {
  storeId: string
  dateKey: string
  goalCents: number | null
  lastYearCents: number | null
  pu: number | null
}): Promise<void> {
  if (!input.storeId) throw new Error('Unidade é obrigatória.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) throw new Error('Data inválida.')

  const goalCents = parseMoneyCents(input.goalCents, 'Meta do dia')
  const lastYearCents = parseMoneyCents(input.lastYearCents, 'Last Year')
  const pu = parsePu(input.pu)
  const client = getFlowAdminClient()

  if (goalCents === null && lastYearCents === null && pu === null) {
    const { error } = await client
      .from('flow_finance_days')
      .delete()
      .eq('cardplus_store_id', input.storeId)
      .eq('date_key', input.dateKey)
    if (error && isMissingTable(error)) return
    if (error) throw new Error(`Erro ao limpar o dia financeiro: ${error.message}`)
    return
  }

  const payload = {
    cardplus_store_id: input.storeId,
    date_key: input.dateKey,
    goal_cents: goalCents,
    last_year_cents: lastYearCents,
    pu,
    updated_at: new Date().toISOString()
  }

  const { error } = await client.from('flow_finance_days').upsert(payload, {
    onConflict: 'cardplus_store_id,date_key'
  })

  if (error) {
    if (isMissingTable(error)) throw missingFinanceDaysSql()
    throw new Error(`Erro ao salvar o dia financeiro: ${error.message}`)
  }

  try {
    await client.from('flow_audit_logs').insert({
      action: 'finance.day.upsert',
      entity_type: 'flow_finance_days',
      entity_id: input.storeId,
      metadata: {
        date_key: input.dateKey,
        has_goal: goalCents !== null,
        has_last_year: lastYearCents !== null,
        has_pu: pu !== null
      }
    })
  } catch (auditError) {
    log.warn('[finance-days] auditoria não registrada', auditError)
  }
}
