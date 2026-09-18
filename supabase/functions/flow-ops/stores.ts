import log from './log.ts'
import {
  assertAccessUsernameAvailable,
  createOperationalAccess,
  listEmployeeDirectory,
  listOperationalStoreIds
} from './access.ts'
import {
  DAILY_SALE_PREFIX,
  MONTH_CARDS_PREFIX,
  MONTH_SALES_PREFIX,
  createStore as createCardplusStore,
  ensureCaixaCollaborator,
  listGoalsByPrefix,
  listStores,
  renameStore as renameCardplusStore,
  storeMonthCardsByStore
} from './cardplus.ts'
import { listCardTotalOverrides, overlayMonthTotal } from './card-overrides.ts'
import { dateKeyInSaoPaulo, monthKeyFromDateKey } from './dates.ts'
import { getFlowAdminClient } from './supabase-clients.ts'
import type {
  StoreBoard,
  StoreBoardItem,
  StorePerson,
  StoreSeat,
  StoreWriteInput
} from './_shared/operations.ts'
import { STORE_SEATS } from './_shared/operations.ts'
import { isGlobalDeskRole, isSupervisorSeatCandidate } from './_shared/roles.ts'

type ProfileRow = {
  cardplus_store_id: string
  internal_code: string | null
  notes: string | null
  flagged: boolean
}

type SeatRow = {
  cardplus_store_id: string
  seat: string
  cardplus_collaborator_id: string
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_store_leadership|flow_store_profiles/i.test(error.message ?? '')
  )
}

function missingSql(): Error {
  return new Error('Rode o SQL 0006_flow_store_desk.sql no Supabase do FLOW para gerenciar liderança das unidades.')
}

function isSeat(value: string): value is StoreSeat {
  return (STORE_SEATS as readonly string[]).includes(value)
}

function asOptionalId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function personOf(id: string | null, names: Map<string, string>): StorePerson | null {
  if (!id) return null
  return { id, name: names.get(id) ?? 'Funcionário' }
}

async function listProfiles(): Promise<Map<string, ProfileRow>> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_store_profiles')
    .select('cardplus_store_id, internal_code, notes, flagged')
  if (error) {
    if (isMissingTable(error)) return new Map()
    throw new Error(`Erro ao carregar dados das unidades: ${error.message}`)
  }
  return new Map(((data ?? []) as ProfileRow[]).map((row) => [row.cardplus_store_id, row]))
}

async function listSeats(): Promise<SeatRow[]> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_store_leadership')
    .select('cardplus_store_id, seat, cardplus_collaborator_id')
  if (error) {
    if (isMissingTable(error)) return []
    throw new Error(`Erro ao carregar liderança das unidades: ${error.message}`)
  }
  return (data ?? []) as SeatRow[]
}

function goalForStore(rows: Array<{ store_id: string; date_key: string; goal: number }>, storeId: string, key: string): number | null {
  const row = rows.find((item) => item.store_id === storeId && item.date_key === key)
  return typeof row?.goal === 'number' ? row.goal : null
}

function salesForStore(
  rows: Array<{ store_id: string; date_key: string; goal: number }>,
  storeId: string,
  monthKey: string
): number {
  let total = 0
  for (const row of rows) {
    if (row.store_id !== storeId || !row.date_key.startsWith(DAILY_SALE_PREFIX)) continue
    const dateKey = row.date_key.slice(DAILY_SALE_PREFIX.length)
    if (dateKey.startsWith(monthKey)) total += row.goal
  }
  return total
}

function asPerson(item: { id: string; name: string; storeName: string; flowRoleLabel: string; isActive?: boolean }): StorePerson {
  return {
    id: item.id,
    name: item.name,
    storeName: item.storeName,
    roleLabel: item.flowRoleLabel,
    isActive: item.isActive
  }
}

function asGlobalDeskPerson(item: {
  id: string
  name: string
  storeName: string
  cardplusRole: string
  isActive: boolean
  globalDeskLabel?: string | null
}): StorePerson {
  return {
    id: item.id,
    name: item.name,
    storeName: item.storeName?.trim() ? item.storeName : 'Rede',
    roleLabel: item.globalDeskLabel || (isGlobalDeskRole(item.cardplusRole) ? item.cardplusRole : 'Gerente Regional'),
    isActive: item.isActive
  }
}

function mergePeople(list: StorePerson[]): StorePerson[] {
  const seen = new Set<string>()
  const next: StorePerson[] = []
  for (const person of list) {
    if (seen.has(person.id)) continue
    seen.add(person.id)
    next.push(person)
  }
  return next.sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
}

export async function getStoreBoard(storeId?: string | null): Promise<StoreBoard> {
  const today = dateKeyInSaoPaulo()
  const monthKey = monthKeyFromDateKey(today)
  const [stores, directory, cards, cardGoals, saleGoals, dailySales, profiles, seats, operationalStores, cardOverrides] =
    await Promise.all([
      listStores(storeId),
      listEmployeeDirectory(),
      storeMonthCardsByStore(storeId),
      listGoalsByPrefix(MONTH_CARDS_PREFIX, storeId),
      listGoalsByPrefix(MONTH_SALES_PREFIX, storeId),
      listGoalsByPrefix(DAILY_SALE_PREFIX, storeId),
      listProfiles(),
      listSeats(),
      listOperationalStoreIds(),
      listCardTotalOverrides(monthKey)
    ])

  const names = new Map(directory.map((item) => [item.id, item.name]))
  const localPeople = directory
    .filter(
      (item) =>
        item.directorySource !== 'app_user' &&
        item.isActive &&
        item.name.trim().toUpperCase() !== 'CAIXA' &&
        (!storeId || item.storeId === storeId)
    )
    .map(asPerson)
  const globalPeople = directory.filter((item) => item.isGlobalDesk).map(asGlobalDeskPerson)
  const supervisorPeople = mergePeople([
    ...globalPeople,
    ...directory
      .filter(
        (item) =>
          item.isActive &&
          item.name.trim().toUpperCase() !== 'CAIXA' &&
          isSupervisorSeatCandidate(item.flowRole, item.cardplusRole)
      )
      .map(asPerson)
  ])
  const people = mergePeople([...globalPeople, ...localPeople])

  const board = stores.map((store) => {
    const profile = profiles.get(store.id)
    const storeSeats = seats.filter((row) => row.cardplus_store_id === store.id)
    const managers = storeSeats
      .filter((row) => row.seat === 'GERENTE')
      .map((row) => personOf(row.cardplus_collaborator_id, names))
      .filter((item): item is StorePerson => Boolean(item))
    const generalManager = personOf(
      storeSeats.find((row) => row.seat === 'GERENTE_GERAL')?.cardplus_collaborator_id ?? null,
      names
    )
    const supervisor = personOf(
      storeSeats.find((row) => row.seat === 'SUPERVISOR')?.cardplus_collaborator_id ?? null,
      names
    )
    const operationLead = personOf(
      storeSeats.find((row) => row.seat === 'LIDER_OPERACAO')?.cardplus_collaborator_id ?? null,
      names
    )
    const employeeCount = directory.filter(
      (item) =>
        item.directorySource !== 'app_user' &&
        item.storeId === store.id &&
        item.isActive &&
        item.name.trim().toUpperCase() !== 'CAIXA'
    ).length
    const missingLeadership = !generalManager || !supervisor || managers.length === 0
    return {
      id: store.id,
      name: store.name,
      createdAt: store.createdAt ?? null,
      internalCode: profile?.internal_code ?? null,
      notes: profile?.notes ?? null,
      flagged: Boolean(profile?.flagged),
      employeeCount,
      cardsThisMonth: overlayMonthTotal(cards.get(store.id) ?? 0, cardOverrides.get(store.id)),
      monthGoal: goalForStore(cardGoals, store.id, `${MONTH_CARDS_PREFIX}${monthKey}`),
      salesThisMonthCents: salesForStore(dailySales, store.id, monthKey),
      monthSalesGoalCents: goalForStore(saleGoals, store.id, `${MONTH_SALES_PREFIX}${monthKey}`),
      managers,
      generalManager,
      supervisor,
      operationLead,
      missingLeadership,
      hasOperationalAccess: operationalStores.has(store.id)
    } satisfies StoreBoardItem
  })

  return {
    canCreate: false,
    canEdit: false,
    storeCount: board.length,
    flaggedCount: board.filter((item) => item.flagged).length,
    missingLeadershipCount: board.filter((item) => item.missingLeadership).length,
    employeeCount: board.reduce((total, item) => total + item.employeeCount, 0),
    cardsThisMonth: board.reduce((total, item) => total + item.cardsThisMonth, 0),
    people,
    supervisorPeople,
    stores: board
  }
}

async function writeProfile(storeId: string, input: StoreWriteInput): Promise<void> {
  const internalCode = input.internalCode?.trim() ? input.internalCode.trim().slice(0, 24) : null
  const notes = input.notes?.trim() ? input.notes.trim().slice(0, 2000) : null
  const { error } = await getFlowAdminClient().from('flow_store_profiles').upsert(
    {
      cardplus_store_id: storeId,
      internal_code: internalCode,
      notes,
      flagged: Boolean(input.flagged),
      updated_at: new Date().toISOString()
    },
    { onConflict: 'cardplus_store_id' }
  )
  if (error) {
    if (isMissingTable(error)) throw missingSql()
    throw new Error(`Erro ao salvar dados da unidade: ${error.message}`)
  }
}

async function writeSeats(storeId: string, input: StoreWriteInput, allowedPeople: Set<string>): Promise<void> {
  const next: Array<{ seat: StoreSeat; collaboratorId: string }> = []
  const uniqueManagers = [...new Set((input.managerIds ?? []).map((id) => id.trim()).filter(Boolean))]
  for (const id of uniqueManagers) next.push({ seat: 'GERENTE', collaboratorId: id })
  const general = asOptionalId(input.generalManagerId)
  const supervisor = asOptionalId(input.supervisorId)
  const lead = asOptionalId(input.operationLeadId)
  if (general) next.push({ seat: 'GERENTE_GERAL', collaboratorId: general })
  if (supervisor) next.push({ seat: 'SUPERVISOR', collaboratorId: supervisor })
  if (lead) next.push({ seat: 'LIDER_OPERACAO', collaboratorId: lead })

  for (const row of next) {
    if (!allowedPeople.has(row.collaboratorId)) {
      throw new Error('Só é possível atribuir funcionários cadastrados.')
    }
    if (!isSeat(row.seat)) throw new Error('Assento de liderança inválido.')
  }

  const existing = await getFlowAdminClient()
    .from('flow_store_leadership')
    .delete()
    .eq('cardplus_store_id', storeId)
  if (existing.error) {
    if (isMissingTable(existing.error)) throw missingSql()
    throw new Error(`Erro ao atualizar liderança: ${existing.error.message}`)
  }

  if (next.length === 0) return
  const { error } = await getFlowAdminClient().from('flow_store_leadership').insert(
    next.map((row) => ({
      cardplus_store_id: storeId,
      seat: row.seat,
      cardplus_collaborator_id: row.collaboratorId,
      updated_at: new Date().toISOString()
    }))
  )
  if (error) {
    if (isMissingTable(error)) throw missingSql()
    throw new Error(`Erro ao salvar liderança: ${error.message}`)
  }
}

async function audit(action: string, storeId: string, metadata: Record<string, unknown>): Promise<void> {
  try {
    await getFlowAdminClient().from('flow_audit_logs').insert({
      action,
      entity_type: 'flow_store_desk',
      entity_id: storeId,
      metadata
    })
  } catch (error) {
    log.warn('[stores] auditoria não registrada', error)
  }
}

async function allowedPeople(): Promise<Set<string>> {
  const employees = await listEmployeeDirectory()
  return new Set(
    employees.filter((item) => item.name.trim().toUpperCase() !== 'CAIXA').map((item) => item.id)
  )
}

async function boardItem(storeId: string): Promise<StoreBoardItem> {
  const board = await getStoreBoard(storeId)
  const item = board.stores.find((store) => store.id === storeId)
  if (!item) throw new Error('Unidade não encontrada.')
  return item
}

export async function createStoreDesk(input: StoreWriteInput): Promise<StoreBoardItem> {
  const username = input.accessUsername?.trim() ?? ''
  const password = input.accessPassword?.trim() ?? ''
  if (!username || !password) {
    throw new Error('Informe o login e a senha operacional da unidade.')
  }
  if (password.length < 6) throw new Error('A senha operacional precisa ter pelo menos 6 caracteres.')
  const normalizedUsername = await assertAccessUsernameAvailable(username)
  const created = await createCardplusStore(input.name)
  try {
    await ensureCaixaCollaborator(created.id)
    await createOperationalAccess(created.id, normalizedUsername, password, input.accessDisplayName)
  } catch (error) {
    log.warn('[stores] unidade criada, acesso operacional incompleto', error)
    throw error instanceof Error ? error : new Error('Unidade criada, mas o login operacional falhou.')
  }
  const people = await allowedPeople()
  try {
    await writeProfile(created.id, input)
    await writeSeats(created.id, input, people)
  } catch (error) {
    log.warn('[stores] unidade criada no Card+, mesa FLOW incompleta', error)
    if (error instanceof Error && /0006_flow_store_desk/.test(error.message)) throw error
  }
  await audit('store.create', created.id, { name: created.name, accessUsername: username })
  return boardItem(created.id)
}

export async function updateStoreDesk(input: StoreWriteInput): Promise<StoreBoardItem> {
  if (!input.id) throw new Error('Unidade é obrigatória.')
  await renameCardplusStore(input.id, input.name)
  const people = await allowedPeople()
  await writeProfile(input.id, input)
  await writeSeats(input.id, input, people)
  await audit('store.update', input.id, {
    name: input.name,
    flagged: Boolean(input.flagged),
    managers: input.managerIds ?? [],
    generalManagerId: input.generalManagerId ?? null,
    supervisorId: input.supervisorId ?? null,
    operationLeadId: input.operationLeadId ?? null
  })
  return boardItem(input.id)
}
