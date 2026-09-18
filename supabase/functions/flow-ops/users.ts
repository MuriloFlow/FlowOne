import { listStores } from './cardplus.ts'
import { getFlowAdminClient } from './supabase-clients.ts'
import type { FlowLauncherUser, FlowLauncherUserWrite } from './_shared/operations.ts'
import {
  canLoginWithRole,
  canManageFlowUsers,
  isFlowRole,
  needsStoreBinding,
  roleLabel,
  type FlowRoleId
} from './_shared/roles.ts'

type ProfileRow = {
  user_id: string
  email: string
  display_name: string | null
  role: string
  status: string
  cardplus_store_id?: string | null
  created_at: string | null
  updated_at: string | null
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function asStatus(value: string | null | undefined): FlowLauncherUser['status'] {
  if (value === 'inactive' || value === 'locked') return value
  return 'active'
}

function toUser(row: ProfileRow, storeNames: Map<string, string>): FlowLauncherUser {
  const storeId = typeof row.cardplus_store_id === 'string' ? row.cardplus_store_id : null
  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name?.trim() || row.email.split('@')[0] || 'Usuário',
    role: row.role,
    roleLabel: roleLabel(row.role),
    status: asStatus(row.status),
    storeId,
    storeName: storeId ? (storeNames.get(storeId) ?? 'Unidade') : 'Rede',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function parseWrite(input: FlowLauncherUserWrite, requirePassword: boolean): {
  email: string
  displayName: string
  role: FlowRoleId
  password: string
  storeId: string | null
  status: 'active' | 'inactive'
} {
  const email = normalizeEmail(input.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.')
  const displayName = input.displayName.trim()
  if (!displayName) throw new Error('Nome é obrigatório.')
  if (!isFlowRole(input.role) || !canLoginWithRole(input.role)) {
    throw new Error('Este cargo não entra no launcher. Escolha Lider, Gerente, Supervisor ou Diretor.')
  }
  const password = input.password?.trim() ?? ''
  if (requirePassword && password.length < 8) {
    throw new Error('A senha precisa ter pelo menos 8 caracteres.')
  }
  if (password && password.length < 8) {
    throw new Error('A senha precisa ter pelo menos 8 caracteres.')
  }
  const storeId = input.storeId?.trim() || null
  if (needsStoreBinding(input.role) && !storeId) {
    throw new Error('Este cargo precisa de uma unidade.')
  }
  return {
    email,
    displayName,
    role: input.role,
    password,
    storeId: needsStoreBinding(input.role) ? storeId : null,
    status: input.status === 'inactive' ? 'inactive' : 'active'
  }
}

async function loadProfile(userId: string): Promise<ProfileRow> {
  const full = await getFlowAdminClient()
    .from('flow_profiles')
    .select('user_id, email, display_name, role, status, cardplus_store_id, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!full.error && full.data) return full.data as ProfileRow
  const basic = await getFlowAdminClient()
    .from('flow_profiles')
    .select('user_id, email, display_name, role, status, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (basic.error || !basic.data) throw new Error('Não achei este acesso do FLOW.')
  return basic.data as ProfileRow
}

export async function listFlowUsers(): Promise<FlowLauncherUser[]> {
  const [stores, full] = await Promise.all([
    listStores(),
    getFlowAdminClient()
      .from('flow_profiles')
      .select('user_id, email, display_name, role, status, cardplus_store_id, created_at, updated_at')
      .order('display_name')
  ])
  const storeNames = new Map(stores.map((store) => [store.id, store.name]))
  if (!full.error) {
    return ((full.data ?? []) as ProfileRow[]).map((row) => toUser(row, storeNames))
  }
  if (!/cardplus_store_id/i.test(full.error.message)) {
    throw new Error(`Erro ao carregar usuários do FLOW: ${full.error.message}`)
  }
  const basic = await getFlowAdminClient()
    .from('flow_profiles')
    .select('user_id, email, display_name, role, status, created_at, updated_at')
    .order('display_name')
  if (basic.error) throw new Error(`Erro ao carregar usuários do FLOW: ${basic.error.message}`)
  return ((basic.data ?? []) as ProfileRow[]).map((row) => toUser(row, storeNames))
}

export async function upsertFlowUser(
  input: FlowLauncherUserWrite,
  actorUserId: string,
  actorRole: string
): Promise<FlowLauncherUser> {
  if (!canManageFlowUsers(actorRole)) {
    throw new Error('Só Lider de Operação, Supervisor e Diretor gerenciam acessos do FLOW.')
  }
  const parsed = parseWrite(input, !input.id)
  const flow = getFlowAdminClient()

  if (!input.id) {
    const created = await flow.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: { role: parsed.role, full_name: parsed.displayName }
    })
    if (created.error || !created.data.user) {
      const message = created.error?.message ?? 'resposta vazia'
      if (/already|registered|exists/i.test(message)) {
        throw new Error('Este e-mail já tem acesso ao FLOW.')
      }
      throw new Error(`Erro ao criar acesso: ${message}`)
    }
    await writeProfile(created.data.user.id, parsed)
    const stores = await listStores()
    return toUser(await loadProfile(created.data.user.id), new Map(stores.map((store) => [store.id, store.name])))
  }

  if (input.id === actorUserId && parsed.status === 'inactive') {
    throw new Error('Você não pode desativar o próprio acesso.')
  }
  if (input.id === actorUserId && !canManageFlowUsers(parsed.role)) {
    throw new Error('Você não pode tirar do próprio usuário o acesso de rede.')
  }

  const current = await loadProfile(input.id)
  if (parsed.email !== normalizeEmail(current.email) || parsed.password) {
    const patch: { email?: string; password?: string; user_metadata?: Record<string, string> } = {
      user_metadata: { role: parsed.role, full_name: parsed.displayName }
    }
    if (parsed.email !== normalizeEmail(current.email)) patch.email = parsed.email
    if (parsed.password) patch.password = parsed.password
    const updated = await flow.auth.admin.updateUserById(input.id, patch)
    if (updated.error) throw new Error(`Erro ao atualizar o login: ${updated.error.message}`)
  }
  await writeProfile(input.id, parsed)
  const stores = await listStores()
  return toUser(await loadProfile(input.id), new Map(stores.map((store) => [store.id, store.name])))
}

async function writeProfile(
  userId: string,
  parsed: { email: string; displayName: string; role: FlowRoleId; storeId: string | null; status: 'active' | 'inactive' }
): Promise<void> {
  const payload: Record<string, unknown> = {
    email: parsed.email,
    display_name: parsed.displayName,
    role: parsed.role,
    status: parsed.status,
    updated_at: new Date().toISOString()
  }
  const withStore = { ...payload, cardplus_store_id: parsed.storeId }
  const first = await getFlowAdminClient().from('flow_profiles').update(withStore).eq('user_id', userId)
  if (!first.error) return
  if (!/cardplus_store_id/i.test(first.error.message)) {
    throw new Error(`Erro ao salvar o acesso: ${first.error.message}`)
  }
  const fallback = await getFlowAdminClient().from('flow_profiles').update(payload).eq('user_id', userId)
  if (fallback.error) throw new Error(`Erro ao salvar o acesso: ${fallback.error.message}`)
}
