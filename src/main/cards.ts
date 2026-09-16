import {
  dateKeyFromIso,
  dateKeyInSaoPaulo,
  dayBounds,
  isoFromDateKey,
  lastDayOfMonth,
  monthBounds,
  monthKeyFromDateKey
} from './dates'
import { listStores } from './cardplus'
import { getCardplusClient } from './supabase-clients'
import type { CardRecord, CardWriteInput, CardsBoard, StorePerson } from '../shared/operations'

type RecordRow = {
  id: string
  collaborator_id: string
  operator_name: string
  client_name: string
  amount_in_cents: number
  amount_used_in_cents: number | null
  created_at: string
  activated: boolean
  activated_later: boolean | null
  store_id: string | null
}

type CollaboratorRow = {
  id: string
  name: string
  store_id: string
  is_active: boolean
  merged_into_id: string | null
}

const PAGE_SIZE = 1000

function usedOf(row: Pick<RecordRow, 'amount_used_in_cents'>): number {
  return Math.max(0, Number(row.amount_used_in_cents) || 0)
}

function toRecord(row: RecordRow, stores: Map<string, string>): CardRecord {
  const used = usedOf(row)
  const limit = Math.max(0, Number(row.amount_in_cents) || 0)
  return {
    id: row.id,
    collaboratorId: row.collaborator_id,
    operatorName: row.operator_name,
    clientName: row.client_name,
    amountInCents: limit,
    amountUsedInCents: used,
    availableInCents: Math.max(0, limit - used),
    createdAt: row.created_at,
    dateKey: dateKeyFromIso(row.created_at),
    storeId: row.store_id ?? '',
    storeName: stores.get(row.store_id ?? '') ?? 'Unidade',
    activated: Boolean(row.activated),
    activatedLater: Boolean(row.activated_later)
  }
}

async function listPaged<T>(loadPage: (from: number, to: number) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = []
  let from = 0
  for (let page = 0; page < 40; page += 1) {
    const chunk = await loadPage(from, from + PAGE_SIZE - 1)
    rows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

async function getCollaborator(id: string): Promise<CollaboratorRow> {
  const { data, error } = await getCardplusClient()
    .from('collaborators')
    .select('id, name, store_id, is_active, merged_into_id')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Erro ao carregar funcionário: ${error.message}`)
  if (!data) throw new Error('Funcionário não encontrado.')
  return data as CollaboratorRow
}

async function listPeople(storeId?: string | null): Promise<StorePerson[]> {
  let query = getCardplusClient()
    .from('collaborators')
    .select('id, name, store_id, is_active, merged_into_id')
    .order('name')
  if (storeId) query = query.eq('store_id', storeId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar equipe: ${error.message}`)
  return ((data ?? []) as CollaboratorRow[])
    .filter((row) => !row.merged_into_id && row.is_active && (!storeId || row.store_id === storeId))
    .map((row) => ({ id: row.id, name: row.name }))
}

async function loadRecord(id: string): Promise<RecordRow> {
  const { data, error } = await getCardplusClient()
    .from('records')
    .select(
      'id, collaborator_id, operator_name, client_name, amount_in_cents, amount_used_in_cents, created_at, activated, activated_later, store_id'
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Erro ao carregar cartão: ${error.message}`)
  if (!data) throw new Error('Cartão não encontrado.')
  return data as RecordRow
}

async function asCard(row: RecordRow): Promise<CardRecord> {
  const stores = await listStores(row.store_id)
  return toRecord(row, new Map(stores.map((store) => [store.id, store.name])))
}

async function todayGoal(dateKey: string, storeId?: string | null): Promise<number | null> {
  let query = getCardplusClient().from('daily_goals').select('goal').eq('date_key', dateKey)
  if (storeId) query = query.eq('store_id', storeId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar meta do dia: ${error.message}`)
  const rows = (data ?? []) as Array<{ goal: number }>
  if (rows.length === 0) return null
  return rows.reduce((total, row) => total + row.goal, 0)
}

async function monthGoal(monthKey: string, storeId?: string | null): Promise<number | null> {
  let query = getCardplusClient()
    .from('daily_goals')
    .select('goal')
    .eq('date_key', `month-cards:${monthKey}`)
  if (storeId) query = query.eq('store_id', storeId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar meta do mês: ${error.message}`)
  const rows = (data ?? []) as Array<{ goal: number }>
  if (rows.length === 0) return null
  return rows.reduce((total, row) => total + row.goal, 0)
}

async function dayGoalsMap(monthKey: string, storeId?: string | null): Promise<Map<string, number>> {
  const last = String(lastDayOfMonth(monthKey)).padStart(2, '0')
  let query = getCardplusClient()
    .from('daily_goals')
    .select('date_key, goal')
    .gte('date_key', `${monthKey}-01`)
    .lte('date_key', `${monthKey}-${last}`)
  if (storeId) query = query.eq('store_id', storeId)
  const { data, error } = await query
  if (error) throw new Error(`Erro ao carregar metas do dia: ${error.message}`)
  const map = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ date_key: string; goal: number }>) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date_key)) continue
    map.set(row.date_key, (map.get(row.date_key) ?? 0) + row.goal)
  }
  return map
}

async function sumDigitacoesByDay(
  range: { start: string; end: string },
  storeId?: string | null
): Promise<Map<string, number>> {
  const rows = await listPaged(async (from, to) => {
    let query = getCardplusClient()
      .from('digitacoes')
      .select('quantity, created_at, store_id')
      .gte('created_at', range.start)
      .lte('created_at', range.end)
      .range(from, to)
    if (storeId) query = query.eq('store_id', storeId)
    const { data, error } = await query
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return []
      throw new Error(`Erro ao carregar digitações: ${error.message}`)
    }
    return (data ?? []) as Array<{ quantity: number | null; created_at: string; store_id: string | null }>
  })
  const map = new Map<string, number>()
  for (const row of rows) {
    if (storeId && row.store_id && row.store_id !== storeId) continue
    const key = dateKeyFromIso(row.created_at)
    map.set(key, (map.get(key) ?? 0) + (Number(row.quantity) || 0))
  }
  return map
}

export async function getCardsBoard(monthKeyInput?: string | null, storeId?: string | null): Promise<CardsBoard> {
  const today = dateKeyInSaoPaulo()
  const monthKey = monthKeyInput && /^\d{4}-\d{2}$/.test(monthKeyInput) ? monthKeyInput : monthKeyFromDateKey(today)
  const range = monthBounds(monthKey)
  const todayRange = dayBounds(today)

  const [stores, people, monthRows, digitacoes, todayCount, totalCount, dayGoal, monthGoalValue, dayGoals] =
    await Promise.all([
    listStores(storeId),
    listPeople(storeId),
    listPaged(async (from, to) => {
      let query = getCardplusClient()
        .from('records')
        .select(
          'id, collaborator_id, operator_name, client_name, amount_in_cents, amount_used_in_cents, created_at, activated, activated_later, store_id'
        )
        .gte('created_at', range.start)
        .lte('created_at', range.end)
        .order('created_at', { ascending: false })
        .range(from, to)
      if (storeId) query = query.eq('store_id', storeId)
      const { data, error } = await query
      if (error) throw new Error(`Erro ao carregar cartões: ${error.message}`)
      return (data ?? []) as RecordRow[]
    }),
    sumDigitacoesByDay(range, storeId),
    (async () => {
      let query = getCardplusClient()
        .from('records')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayRange.start)
        .lte('created_at', todayRange.end)
      if (storeId) query = query.eq('store_id', storeId)
      const { count, error } = await query
      if (error) throw new Error(`Erro ao contar cartões do dia: ${error.message}`)
      return count ?? 0
    })(),
    (async () => {
      let query = getCardplusClient().from('records').select('id', { count: 'exact', head: true })
      if (storeId) query = query.eq('store_id', storeId)
      const { count, error } = await query
      if (error) throw new Error(`Erro ao contar cartões: ${error.message}`)
      return count ?? 0
    })(),
    todayGoal(today, storeId),
    monthGoal(monthKey, storeId),
    dayGoalsMap(monthKey, storeId)
  ])

  const storeMap = new Map(stores.map((store) => [store.id, store.name]))
  const records = monthRows
    .map((row) => toRecord(row, storeMap))
    .filter((card) => !storeId || card.storeId === storeId)
  const dayMap = new Map<
    string,
    { cards: number; pending: number; activated: number; limitCents: number; usedCents: number }
  >()
  let pendingCount = 0
  let activatedCount = 0
  let idleActivatedCount = 0
  let limitCents = 0
  let usedCents = 0

  for (const card of records) {
    const current = dayMap.get(card.dateKey) ?? {
      cards: 0,
      pending: 0,
      activated: 0,
      limitCents: 0,
      usedCents: 0
    }
    current.cards += 1
    current.limitCents += card.amountInCents
    current.usedCents += card.amountUsedInCents
    if (card.activated) {
      current.activated += 1
      activatedCount += 1
      if (card.amountUsedInCents === 0 && card.amountInCents > 0) idleActivatedCount += 1
    } else {
      current.pending += 1
      pendingCount += 1
    }
    dayMap.set(card.dateKey, current)
    limitCents += card.amountInCents
    usedCents += card.amountUsedInCents
  }

  const last = lastDayOfMonth(monthKey)
  const days = Array.from({ length: last }, (_, index) => {
    const dateKey = `${monthKey}-${String(last - index).padStart(2, '0')}`
    const counts = dayMap.get(dateKey) ?? {
      cards: 0,
      pending: 0,
      activated: 0,
      limitCents: 0,
      usedCents: 0
    }
    return {
      dateKey,
      cards: counts.cards,
      pending: counts.pending,
      activated: counts.activated,
      digitacoes: digitacoes.get(dateKey) ?? 0,
      goal: dayGoals.get(dateKey) ?? null,
      limitCents: counts.limitCents,
      usedCents: counts.usedCents
    }
  })

  return {
    monthKey,
    storeId: storeId ?? null,
    storeName: storeId ? stores[0]?.name ?? null : null,
    cardsToday: monthKey === monthKeyFromDateKey(today) ? records.filter((card) => card.dateKey === today).length : todayCount,
    todayGoal: dayGoal,
    cardsThisMonth: records.length,
    monthGoal: monthGoalValue,
    cardsTotal: totalCount,
    pendingCount,
    activatedCount,
    idleActivatedCount,
    limitCents,
    usedCents,
    availableCents: Math.max(0, limitCents - usedCents),
    days,
    records,
    people
  }
}

function normalizeClient(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Nome do cliente é obrigatório.')
  return name
}

export async function writeCard(input: CardWriteInput, existingId?: string): Promise<CardRecord> {
  const collaborator = await getCollaborator(input.collaboratorId)
  if (input.storeId && collaborator.store_id !== input.storeId) {
    throw new Error('O funcionário não pertence a esta unidade.')
  }
  const clientName = normalizeClient(input.clientName)
  const amountInCents = Math.max(0, Math.round(input.amountInCents))
  const amountUsedInCents = Math.max(0, Math.round(input.amountUsedInCents))
  if (amountUsedInCents > amountInCents) {
    throw new Error('O valor gasto não pode ser maior que o limite do cartão.')
  }
  const today = dateKeyInSaoPaulo()
  const dateKey = input.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(input.dateKey) ? input.dateKey : today
  const activatedLater = input.activated && dateKey !== today

  if (existingId) {
    const current = await loadRecord(existingId)
    if (input.storeId && current.store_id && current.store_id !== input.storeId) {
      throw new Error('Cartão fora da unidade selecionada.')
    }
    const { error } = await getCardplusClient()
      .from('records')
      .update({
        collaborator_id: collaborator.id,
        operator_name: collaborator.name,
        client_name: clientName,
        amount_in_cents: amountInCents,
        amount_used_in_cents: amountUsedInCents,
        activated: input.activated,
        activated_later: input.activated ? (current.activated ? current.activated_later : activatedLater) : false,
        store_id: collaborator.store_id,
        updated_at: new Date().toISOString(),
        ...(dateKey !== dateKeyFromIso(current.created_at) ? { created_at: isoFromDateKey(dateKey) } : {})
      })
      .eq('id', existingId)
    if (error) throw new Error(`Erro ao atualizar cartão: ${error.message}`)
    return asCard(await loadRecord(existingId))
  }

  const { data, error } = await getCardplusClient()
    .from('records')
    .insert({
      collaborator_id: collaborator.id,
      operator_name: collaborator.name,
      client_name: clientName,
      amount_in_cents: amountInCents,
      amount_used_in_cents: amountUsedInCents,
      activated: input.activated,
      activated_later: activatedLater,
      store_id: collaborator.store_id,
      created_at: dateKey === today ? new Date().toISOString() : isoFromDateKey(dateKey)
    })
    .select(
      'id, collaborator_id, operator_name, client_name, amount_in_cents, amount_used_in_cents, created_at, activated, activated_later, store_id'
    )
    .single()
  if (error || !data) {
    throw new Error(`Erro ao registrar cartão no Card+: ${error?.message ?? 'resposta vazia'}`)
  }
  return asCard(data as RecordRow)
}

export async function createCard(input: CardWriteInput): Promise<CardRecord> {
  return writeCard(input)
}

export async function updateCard(input: CardWriteInput): Promise<CardRecord> {
  if (!input.id) throw new Error('Cartão é obrigatório.')
  return writeCard(input, input.id)
}

export async function transferCard(id: string, collaboratorId: string, storeId?: string | null): Promise<CardRecord> {
  const current = await loadRecord(id)
  if (storeId && current.store_id && current.store_id !== storeId) {
    throw new Error('Cartão fora da unidade selecionada.')
  }
  const collaborator = await getCollaborator(collaboratorId)
  const { error } = await getCardplusClient()
    .from('records')
    .update({
      collaborator_id: collaborator.id,
      operator_name: collaborator.name,
      store_id: collaborator.store_id,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
  if (error) throw new Error(`Erro ao transferir cartão: ${error.message}`)
  return asCard(await loadRecord(id))
}

export async function deleteCard(id: string, storeId?: string | null): Promise<void> {
  const current = await loadRecord(id)
  if (storeId && current.store_id && current.store_id !== storeId) {
    throw new Error('Cartão fora da unidade selecionada.')
  }
  const { error } = await getCardplusClient().from('records').delete().eq('id', id)
  if (error) throw new Error(`Erro ao excluir cartão: ${error.message}`)
}

export async function assertCardInStore(id: string, storeId?: string | null): Promise<void> {
  if (!storeId) return
  const current = await loadRecord(id)
  if (current.store_id && current.store_id !== storeId) {
    throw new Error('Cartão fora da unidade selecionada.')
  }
}
