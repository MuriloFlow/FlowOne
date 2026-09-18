import bcrypt from 'npm:bcryptjs@3.0.3'
import { getCardplusClient, getFlowAdminClient } from './supabase-clients.ts'
import { listEmployees, listStores } from './cardplus.ts'
import { identityMask, listIdentities, syncProfileRoleIfSamePerson, upsertIdentity, type IdentityRecord } from './identities.ts'
import { resolveActor } from './scope.ts'
import { scheduleActorMatchScore } from './_shared/schedules.ts'
import type { EmployeeListItem, StoreAccessAccount, StoreAccessWriteInput } from './_shared/operations.ts'
import {
  cardplusAccessRoleLabel,
  employeeRoleLabel,
  floorCardPlusRole,
  isGlobalDeskAppRole,
  isTiAdminAppRole,
  normalizePersonName,
  suggestedFlowRole
} from './_shared/roles.ts'

const BCRYPT_ROUNDS = 10

type AppUserRow = {
  id: string
  username: string
  role: string
  name: string | null
  is_active: boolean
  store_id: string | null
  is_primary: boolean
  updated_at: string | null
}

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE: 'Operacional',
  MANAGER: 'Gerente',
  REGIONAL_MANAGER: 'Gerente regional',
  TI_ADMIN: 'TI',
  GLOBAL_ADMIN: 'Administrador'
}

export type GlobalDeskAccount = {
  id: string
  username: string
  name: string
  role: string
  roleLabel: string
  storeId: string | null
  isActive: boolean
  createdAt: string
}

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '.')
}

function isUsernameValid(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{2,47}$/.test(value)
}

function toAccount(row: AppUserRow): StoreAccessAccount {
  return {
    id: row.id,
    storeId: row.store_id ?? '',
    username: row.username,
    displayName: row.name?.trim() || row.username,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] ?? row.role,
    isActive: row.is_active,
    isPrimary: Boolean(row.is_primary),
    updatedAt: row.updated_at
  }
}

async function throwIfError<T>(
  result: { data: T; error: { message: string; code?: string } | null },
  message: string
): Promise<T> {
  if (result.error) throw new Error(`${message}: ${result.error.message}`)
  return result.data
}

export function suggestOperationalUsername(storeName: string): string {
  const digits = storeName.match(/\d+/g)?.join('')
  if (digits) return `operacao.${digits}`
  const slug = storeName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
    .split('.')
    .find(Boolean)
  return slug ? `operacao.${slug}` : 'operacao'
}

export async function listStoreAccess(storeId: string): Promise<StoreAccessAccount[]> {
  const data = await throwIfError(
    await getCardplusClient()
      .from('app_users')
      .select('id, username, role, name, is_active, store_id, is_primary, updated_at')
      .eq('store_id', storeId)
      .order('username'),
    'Erro ao carregar acessos do Card+'
  )
  return ((data ?? []) as AppUserRow[]).map(toAccount)
}

export async function listOperationalStoreIds(): Promise<Set<string>> {
  const { data, error } = await getCardplusClient()
    .from('app_users')
    .select('store_id')
    .eq('role', 'EMPLOYEE')
    .eq('is_active', true)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return new Set()
    throw new Error(`Erro ao carregar logins operacionais: ${error.message}`)
  }
  return new Set(
    ((data ?? []) as Array<{ store_id: string | null }>)
      .map((row) => row.store_id)
      .filter((id): id is string => Boolean(id))
  )
}

async function assertUsernameFree(username: string, ignoreId?: string): Promise<void> {
  const { data, error } = await getCardplusClient()
    .from('app_users')
    .select('id')
    .eq('username', username)
    .maybeSingle()
  if (error) throw new Error(`Erro ao validar login: ${error.message}`)
  if (data?.id && data.id !== ignoreId) {
    throw new Error('Esse login já existe no Card+.')
  }
}

export async function assertAccessUsernameAvailable(username: string): Promise<string> {
  const normalized = username.trim().toLowerCase().replace(/\s+/g, '.')
  if (!/^[a-z0-9][a-z0-9._-]{2,47}$/.test(normalized)) {
    throw new Error('O login precisa ter 3 a 48 caracteres: letras, números, ponto ou hífen.')
  }
  await assertUsernameFree(normalized)
  return normalized
}

export async function createOperationalAccess(
  storeId: string,
  username: string,
  password: string,
  displayName?: string
): Promise<StoreAccessAccount> {
  const stores = await listStores(storeId)
  const store = stores[0]
  if (!store) throw new Error('Unidade não encontrada no Card+.')
  return upsertStoreAccess({
    storeId,
    username,
    password,
    displayName: displayName?.trim() || `Operadores - ${store.name}`,
    isActive: true
  })
}

export async function listGlobalDeskAccounts(): Promise<GlobalDeskAccount[]> {
  const { data, error } = await getCardplusClient()
    .from('app_users')
    .select('id, username, role, name, is_active, store_id, created_at')
    .order('name')
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw new Error(`Erro ao carregar contas globais do Card+: ${error.message}`)
  }
  return ((data ?? []) as Array<{
    id: string
    username: string
    role: string
    name: string | null
    is_active: boolean
    store_id: string | null
    created_at: string | null
  }>)
    .filter((row) => isGlobalDeskAppRole(row.role))
    .map((row) => ({
      id: row.id,
      username: row.username,
      name: (row.name ?? '').trim() || row.username,
      role: row.role,
      roleLabel: cardplusAccessRoleLabel(row.role),
      storeId: row.store_id,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at ?? new Date(0).toISOString()
    }))
}

function uniqueCollaboratorByName(list: EmployeeListItem[], name: string): EmployeeListItem | null {
  const key = normalizePersonName(name)
  if (!key) return null
  const matches = list.filter(
    (item) => item.directorySource !== 'app_user' && normalizePersonName(item.name) === key
  )
  return matches.length === 1 ? matches[0] : null
}

function toGlobalEmployee(
  account: GlobalDeskAccount,
  matched: EmployeeListItem | null,
  storeNames: Map<string, string>,
  identities: Map<string, IdentityRecord>
): EmployeeListItem {
  const accountIdentity = identities.get(account.id)
  const matchedIdentity = matched ? identities.get(matched.id) : null
  const flowRole = suggestedFlowRole(
    matched?.flowRole ?? matchedIdentity?.flowRole ?? accountIdentity?.flowRole,
    account.roleLabel,
    account.roleLabel
  )
  if (matched) {
    return {
      ...matched,
      flowRole,
      flowRoleLabel: employeeRoleLabel(flowRole, matched.cardplusRole, account.roleLabel),
      cardplusRole: floorCardPlusRole(matched.cardplusRole),
      cpfMasked: matched.cpfMasked ?? identityMask(accountIdentity) ?? identityMask(matchedIdentity),
      hasCpf: matched.hasCpf || Boolean(accountIdentity?.cpfDigits || matchedIdentity?.cpfDigits),
      isGlobalDesk: true,
      globalDeskLabel: account.roleLabel,
      directorySource: 'collaborator'
    }
  }
  const storeName = account.storeId ? (storeNames.get(account.storeId) ?? 'Unidade') : 'Rede'
  return {
    id: account.id,
    name: account.name,
    storeId: account.storeId ?? '',
    storeName,
    cardplusRole: 'Funcionario Operacional',
    flowRole,
    flowRoleLabel: employeeRoleLabel(flowRole, 'Funcionario Operacional', account.roleLabel),
    cpfMasked: identityMask(accountIdentity),
    hasCpf: Boolean(accountIdentity?.cpfDigits),
    isActive: account.isActive,
    cardsThisMonth: 0,
    createdAt: account.createdAt,
    directorySource: 'app_user',
    isGlobalDesk: true,
    globalDeskLabel: account.roleLabel
  }
}

export function mergeGlobalDeskEmployees(
  local: EmployeeListItem[],
  collaborators: EmployeeListItem[],
  accounts: GlobalDeskAccount[],
  storeNames: Map<string, string>,
  identities: Map<string, IdentityRecord> = new Map()
): EmployeeListItem[] {
  const byId = new Map<string, EmployeeListItem>(
    local.map((item) => [item.id, { ...item, directorySource: item.directorySource ?? 'collaborator' }])
  )
  for (const account of accounts) {
    const matched = uniqueCollaboratorByName(collaborators, account.name)
    const next = toGlobalEmployee(account, matched, storeNames, identities)
    const current = byId.get(next.id)
    byId.set(next.id, current ? { ...current, ...next } : next)
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
}

export async function listEmployeeDirectory(storeId?: string | null): Promise<EmployeeListItem[]> {
  const [local, all, accounts, stores, identities] = await Promise.all([
    listEmployees(storeId),
    storeId ? listEmployees() : Promise.resolve(null),
    listGlobalDeskAccounts(),
    listStores(),
    listIdentities()
  ])
  const collaborators = all ?? local
  const storeNames = new Map(stores.map((store) => [store.id, store.name]))
  const merged = mergeGlobalDeskEmployees(local, collaborators, accounts, storeNames, identities)
  return healActorDirectory(merged, identities)
}

async function healActorDirectory(
  directory: EmployeeListItem[],
  identities: Map<string, IdentityRecord>
): Promise<EmployeeListItem[]> {
  let actor: Awaited<ReturnType<typeof resolveActor>> | null = null
  try {
    actor = await resolveActor()
  } catch {
    return directory
  }
  const { data } = await getFlowAdminClient()
    .from('flow_profiles')
    .select('display_name, email, role')
    .eq('user_id', actor.userId)
    .maybeSingle()
  const profile = data as { display_name?: string | null; email?: string | null; role?: string | null } | null
  const actorName = profile?.display_name?.trim() || ''
  const actorEmail = profile?.email?.trim() || ''
  if (!actorName && !actorEmail) return directory

  return Promise.all(
    directory.map(async (item) => {
      const score = scheduleActorMatchScore(actorName, actorEmail, item.name)
      const deskTi = item.globalDeskLabel === 'TI' || isTiAdminAppRole(item.cardplusRole)
      if (score < 40 && !(deskTi && score >= 20)) return item
      const raw = item.flowRole
      const healed =
        deskTi && (!raw || raw === 'SUPERVISOR' || raw === 'OPERADOR') ? 'LIDER_OPERACAO' : raw
      const nextRole = suggestedFlowRole(healed, item.cardplusRole, item.globalDeskLabel)
      const identity = identities.get(item.id)
      if (identity?.flowRole !== nextRole) {
        await upsertIdentity(item.id, identity?.cpfDigits ?? '', nextRole)
      }
      await syncProfileRoleIfSamePerson(actor.userId, item.name, nextRole, {
        isGlobalDesk: Boolean(item.isGlobalDesk),
        email: actorEmail
      })
      return {
        ...item,
        flowRole: nextRole,
        flowRoleLabel: employeeRoleLabel(nextRole, item.cardplusRole, item.globalDeskLabel),
        cardplusRole: floorCardPlusRole(item.cardplusRole)
      }
    })
  )
}

export async function linkedDeskAccountId(name: string, collaboratorId: string): Promise<string | null> {
  const accounts = await listGlobalDeskAccounts()
  const key = normalizePersonName(name)
  const match = accounts.find(
    (account) => account.id === collaboratorId || (key && normalizePersonName(account.name) === key)
  )
  return match?.id ?? null
}

export async function syncDeskAccountName(accountId: string, name: string): Promise<void> {
  const displayName = name.trim()
  if (!accountId || !displayName) return
  const { error } = await getCardplusClient()
    .from('app_users')
    .update({ name: displayName, updated_at: new Date().toISOString() })
    .eq('id', accountId)
  if (error) throw new Error(`Erro ao atualizar a conta da rede no Card+: ${error.message}`)
}

export async function deleteGlobalDeskAccount(id: string): Promise<void> {
  const accounts = await listGlobalDeskAccounts()
  const account = accounts.find((item) => item.id === id)
  if (!account) return
  const { error } = await getCardplusClient().from('app_users').delete().eq('id', id)
  if (!error) return
  if (error.code === '23503') {
    const { error: disableError } = await getCardplusClient()
      .from('app_users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (disableError) {
      throw new Error(`Erro ao desativar o login da rede no Card+: ${disableError.message}`)
    }
    return
  }
  throw new Error(`Erro ao excluir o login da rede no Card+: ${error.message}`)
}

export async function upsertStoreAccess(input: StoreAccessWriteInput): Promise<StoreAccessAccount> {
  const username = normalizeUsername(input.username)
  if (!isUsernameValid(username)) {
    throw new Error('O login precisa ter 3 a 48 caracteres: letras, números, ponto ou hífen.')
  }
  await assertUsernameFree(username, input.id)

  const displayName = input.displayName?.trim()
  if (input.id) {
    const current = await throwIfError(
      await getCardplusClient()
        .from('app_users')
        .select('id, username, role, name, is_active, store_id, is_primary, updated_at')
        .eq('id', input.id)
        .maybeSingle(),
      'Erro ao carregar acesso'
    )
    if (!current) throw new Error('Acesso não encontrado.')
    const row = current as AppUserRow
    if (row.store_id !== input.storeId) {
      throw new Error('Esse login não pertence a esta unidade.')
    }
    const patch: Record<string, unknown> = {
      username,
      name: displayName || row.name,
      updated_at: new Date().toISOString()
    }
    if (typeof input.isActive === 'boolean') patch.is_active = input.isActive
    if (input.password?.trim()) {
      if (input.password.trim().length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
      patch.password_hash = await bcrypt.hash(input.password.trim(), BCRYPT_ROUNDS)
    }
    const { error } = await getCardplusClient().from('app_users').update(patch).eq('id', input.id)
    if (error) throw new Error(`Erro ao atualizar acesso: ${error.message}`)
    const updated = await throwIfError(
      await getCardplusClient()
        .from('app_users')
        .select('id, username, role, name, is_active, store_id, is_primary, updated_at')
        .eq('id', input.id)
        .single(),
      'Erro ao recarregar acesso'
    )
    return toAccount(updated as AppUserRow)
  }

  const password = input.password?.trim() ?? ''
  if (password.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.')
  const stores = await listStores(input.storeId)
  const storeName = stores[0]?.name ?? 'Unidade'
  const role = input.role === 'MANAGER' ? 'MANAGER' : 'EMPLOYEE'
  const { data, error } = await getCardplusClient()
    .from('app_users')
    .insert({
      username,
      password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role,
      name: displayName || (role === 'MANAGER' ? storeName : `Operadores - ${storeName}`),
      is_active: input.isActive ?? true,
      store_id: input.storeId,
      is_primary: false
    })
    .select('id, username, role, name, is_active, store_id, is_primary, updated_at')
    .single()
  if (error || !data) {
    throw new Error(`Erro ao criar login no Card+: ${error?.message ?? 'resposta vazia'}`)
  }
  return toAccount(data as AppUserRow)
}
