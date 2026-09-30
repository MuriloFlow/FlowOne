import { listStores } from './cardplus.ts'
import { getFlowAdminClient, getFlowUserClient } from './supabase-clients.ts'
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
  must_set_password?: boolean | null
  cardplus_store_id?: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * Senha temporária de REDEFINIÇÃO/primeiro acesso: exatamente 8 DÍGITOS
 * NUMÉRICOS aleatórios — fácil de ler no WhatsApp e digitar no celular.
 * O usuário troca por uma senha definitiva no próximo login (must_set_password).
 */
function generateTemporaryPassword(): string {
  const digits = '0123456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let password = ''
  for (let index = 0; index < 8; index += 1) password += digits[bytes[index] % digits.length]
  return password
}

type StoreNameEntry = readonly [string, string]

function toStoreNames(stores: Awaited<ReturnType<typeof listStores>>): Map<string, string> {
  return new Map<string, string>(stores.map((store): StoreNameEntry => [store.id, store.name]))
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

function parseWrite(input: FlowLauncherUserWrite): {
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
  // Senha é OPCIONAL em criar e editar: sem senha o sistema gera uma
  // temporária de 8 dígitos (must_set_password). Validações de senha
  // definitiva (mínimo, confirmar) pertencem SÓ ao fluxo do funcionário.
  const password = input.password?.trim() ?? ''
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
  const storeNames = toStoreNames(stores)
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
  const parsed = parseWrite(input)
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
    const user = toUser(await loadProfile(created.data.user.id), toStoreNames(stores))
    // Criação SEM senha: devolve a temporária de 8 dígitos para o gestor
    // copiar/entregar (mesmo contrato da redefinição de senha).
    if (needsSetup) user.temporaryPassword = temporary
    return user
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
  return toUser(await loadProfile(input.id), toStoreNames(stores))
}

/**
 * Usuário LOGADO define a própria senha (tela "Nova senha / Confirmar" do
 * primeiro acesso ou pós-redefinição). Roda a RPC no banco com a identidade
 * do chamador (auth.uid() limita a troca à própria conta).
 */
export async function setOwnFlowPassword(
  payload: unknown,
  accessToken: string
): Promise<{ ok: boolean }> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword.trim() : ''
  if (newPassword.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.')
  if (newPassword.length > 128) throw new Error('A senha é longa demais.')
  const client = getFlowUserClient(accessToken)
  const { error } = await client.rpc('flow_auth_set_own_password', { p_new_password: newPassword })
  if (error) {
    if (/Sess[aã]o inv[aá]lida|JWT|auth/i.test(error.message)) {
      throw new Error('Sua sessão expirou. Faça login novamente.')
    }
    throw new Error(`Não foi possível salvar a senha: ${error.message}`)
  }
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
export async function resetFlowUserPassword(
  id: string,
  actorRole: string
): Promise<{ temporaryPassword: string }> {
  if (!canManageFlowUsers(actorRole)) {
    throw new Error(
      'Só Lider de Operação, Supervisor e Diretor redefinem senhas. Seu cargo atual não tem essa permissão.'
    )
  }
  const flow = getFlowAdminClient()
  const current = await loadProfile(id)
  if (!current) throw new Error('Não achei este acesso do FLOW.')
  const temporary = generateTemporaryPassword()
  const updated = await flow.auth.admin.updateUserById(id, { password: temporary })
  if (updated.error) throw new Error(`Erro ao redefinir a senha: ${updated.error.message}`)
  await flagPasswordSetup(id, true)
  // Sessões abertas morrem: senha resetada = acesso invalidado até trocar.
  await flow.from('flow_sessions').update({ revoked_at: new Date().toISOString(), revoke_reason: 'password_reset' }).eq('user_id', id)
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
