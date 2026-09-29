import { listStores } from './cardplus'
import { getFlowAdminClient } from './supabase-clients'
import type { FlowLauncherUser, FlowLauncherUserWrite } from '../shared/operations'
import {
  canLoginWithRole,
  canManageFlowUsers,
  isFlowRole,
  needsStoreBinding,
  roleLabel,
  type FlowRoleId
} from '../shared/roles'

type ProfileRow = {
  user_id: string
  email: string
  display_name: string | null
  role: string
  status: string
  must_set_password?: boolean | null
  cardplus_store_id?: string | null
  created_at: string | null
  updated_at: string | null
}

/** Senha temporária legível: pares de letras + dígitos, 12 caracteres. */
function generateTemporaryPassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'
  const digits = '23456789'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let password = ''
  for (let index = 0; index < 8; index += 1) password += letters[bytes[index] % letters.length]
  for (let index = 8; index < 12; index += 1) password += digits[bytes[index] % digits.length]
  return password
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
    mustSetPassword: row.must_set_password === true,
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
    .select('user_id, email, display_name, role, status, must_set_password, cardplus_store_id, created_at, updated_at')
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
      .select('user_id, email, display_name, role, status, must_set_password, cardplus_store_id, created_at, updated_at')
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
    // NOVO MODELO: acesso criado SEM senha (ou com senha temporária quando o
    // gestor optar por digitar). Sem senha = must_set_password: no primeiro
    // login a pessoa cria a própria "Nova senha + Confirmar".
    const temporary = parsed.password || generateTemporaryPassword()
    const needsSetup = !parsed.password
    const created = await flow.auth.admin.createUser({
      email: parsed.email,
      password: temporary,
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
    await writeProfile(created.data.user.id, parsed, needsSetup)
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
    if (parsed.password) {
      patch.password = parsed.password
      // Senha digitada pelo gestor na edição NÃO pede setup no login.
      await flagPasswordSetup(input.id, false)
    }
    const updated = await flow.auth.admin.updateUserById(input.id, patch)
    if (updated.error) throw new Error(`Erro ao atualizar o login: ${updated.error.message}`)
  }
  await writeProfile(input.id, parsed)
  const stores = await listStores()
  return toUser(await loadProfile(input.id), new Map(stores.map((store) => [store.id, store.name])))
}

/**
 * Usuário LOGADO define a própria senha (tela "Nova senha / Confirmar"). No
 * desktop vai direto pela RPC do banco com o token do usuário (mesmo modelo
 * da edge); valida tamanho antes para mensagem amigável.
 */
export async function setOwnFlowPassword(payload: unknown): Promise<{ ok: boolean }> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : ''
  if (newPassword.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.')
  if (newPassword.length > 128) throw new Error('A senha é longa demais.')
  // O token do chamador vem no body (processo renderer é confiável aqui;
  // a RPC do banco valida auth.uid() — ninguém troca senha de outro).
  const token = typeof body.accessToken === 'string' ? body.accessToken : ''
  if (!token) throw new Error('Sua sessão expirou. Faça login novamente.')
  const url = process.env.VITE_SUPABASE_URL?.trim() || process.env.FLOW_SUPABASE_URL?.trim()
  if (!url) throw new Error('Banco FLOW ausente no .env.local')
  const { createClient } = await import('@supabase/supabase-js')
  const client = createClient(url, process.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
  const { error } = await client.rpc('flow_auth_set_own_password', { p_new_password: newPassword })
  if (error) throw new Error(`Não foi possível salvar a senha: ${error.message}`)
  return { ok: true }
}

/** Marca/limpa must_set_password (senha temporária → usuário troca no login). */
async function flagPasswordSetup(userId: string, needs: boolean): Promise<void> {
  const { error } = await getFlowAdminClient()
    .from('flow_profiles')
    .update({ must_set_password: needs, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) throw new Error(`Erro ao marcar a senha pendente: ${error.message}`)
}

/**
 * REDEFINIR SENHA: gestor reseta a senha de um funcionário (esqueceu a senha).
 * Gera senha temporária, marca must_set_password e REVOGA todas as sessões
 * ativas — no próximo login a pessoa cria "Nova senha + Confirmar".
 */
export async function resetFlowUserPassword(id: string, actorRole: string): Promise<{ temporaryPassword: string }> {
  if (!canManageFlowUsers(actorRole)) {
    throw new Error('Só Lider de Operação, Supervisor e Diretor redefinem senhas.')
  }
  const flow = getFlowAdminClient()
  const current = await loadProfile(id)
  if (!current) throw new Error('Não achei este acesso do FLOW.')
  const temporary = generateTemporaryPassword()
  const updated = await flow.auth.admin.updateUserById(id, { password: temporary })
  if (updated.error) throw new Error(`Erro ao redefinir a senha: ${updated.error.message}`)
  await flagPasswordSetup(id, true)
  // Sessões abertas morrem: senha resetada = acesso invalidado até trocar.
  await flow
    .from('flow_sessions')
    .update({ revoked_at: new Date().toISOString(), revoke_reason: 'password_reset' })
    .eq('user_id', id)
  await flow.from('flow_login_attempts').delete().eq('email_normalized', normalizeEmail(current.email))
  return { temporaryPassword: temporary }
}

async function writeProfile(
  userId: string,
  parsed: { email: string; displayName: string; role: FlowRoleId; storeId: string | null; status: 'active' | 'inactive' },
  needsPasswordSetup = false
): Promise<void> {
  const payload: Record<string, unknown> = {
    email: parsed.email,
    display_name: parsed.displayName,
    role: parsed.role,
    status: parsed.status,
    must_set_password: needsPasswordSetup,
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
