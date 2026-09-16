import bcrypt from 'bcryptjs'
import { getCardplusClient } from './supabase-clients'
import { listStores } from './cardplus'
import type { StoreAccessAccount, StoreAccessWriteInput } from '../shared/operations'

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
  const { data, error } = await getCardplusClient()
    .from('app_users')
    .insert({
      username,
      password_hash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: 'EMPLOYEE',
      name: displayName || `Operadores - ${storeName}`,
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
