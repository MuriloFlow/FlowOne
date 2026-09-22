import { z } from 'zod'
import type { PersistedAuthSession } from '../../../shared/ipc'
import { createSessionId, sha256Hex } from './crypto'
import { getPublicIp } from './ip'
import { isMobileShell } from './is-mobile-shell'
import { canLoginWithRole, canViewAllStores, DEFAULT_LOGIN_ROLE, normalizeRole, roleLabel } from './roles'
import { supabase } from './supabase'

const emailSchema = z.string().trim().email()
const passwordSchema = z.string().min(8).max(128)

export class AuthFlowError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

type LockoutState = {
  locked?: boolean
  failures?: number
  retry_after_seconds?: number
}

type SessionValidation = {
  valid?: boolean
  reason?: string
  role?: string
  email?: string
  display_name?: string
}

export type AuthUser = {
  id: string
  email: string
  role: string
  displayRole: string
  displayName: string
  storeId: string | null
  canFilterStores: boolean
}

function readFlowApi() {
  if (!window.flow) {
    throw new AuthFlowError('desktop', 'O launcher não está disponível.')
  }
  return window.flow
}

export function validateEmail(email: string): string {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) {
    throw new AuthFlowError('invalid_email', 'Informe um e-mail válido.')
  }
  return parsed.data.toLowerCase()
}

export function validatePassword(password: string): string {
  const parsed = passwordSchema.safeParse(password)
  if (!parsed.success) {
    throw new AuthFlowError('invalid_password', 'A senha precisa ter pelo menos 8 caracteres.')
  }
  return parsed.data
}

type FlowProfileRow = {
  role?: string | null
  display_name?: string | null
  email?: string | null
  status?: string | null
  cardplus_store_id?: string | null
}

async function readProfile(userId: string): Promise<FlowProfileRow | null> {
  const full = await supabase
    .from('flow_profiles')
    .select('role, display_name, email, status, cardplus_store_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (!full.error) return full.data
  const basic = await supabase
    .from('flow_profiles')
    .select('role, display_name, email, status')
    .eq('user_id', userId)
    .maybeSingle()
  return basic.data
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) {
    console.error(`[auth] ${name}`, error.message)
    return null
  }
  return data as T
}

function lockoutMessage(lockout: LockoutState | null): string | null {
  if (lockout?.locked) {
    const minutes = Math.max(1, Math.ceil((lockout.retry_after_seconds ?? 900) / 60))
    return `Muitas tentativas. Tente novamente em ${minutes} min.`
  }
  return null
}

export async function signInWithEmailPassword(emailInput: string, passwordInput: string): Promise<AuthUser> {
  const email = validateEmail(emailInput)
  const password = validatePassword(passwordInput)
  readFlowApi()
  const ip = await getPublicIp()
  const userAgent = navigator.userAgent

  const lockout = await rpc<LockoutState>('flow_auth_check_lockout', { p_email: email })
  const lockedMessage = lockoutMessage(lockout)
  if (lockedMessage) throw new AuthFlowError('locked', lockedMessage)

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    console.error('[auth] signInWithPassword', {
      status: error.status,
      message: error.message,
      url: import.meta.env.VITE_SUPABASE_URL
    })
  }

  await rpc('flow_auth_record_attempt', {
    p_email: email,
    p_success: !error && Boolean(data.session),
    p_reason: error?.message ?? null,
    p_ip: ip,
    p_user_agent: userAgent
  })

  if (error || !data.user || !data.session) {
    if (isTransientAuthError(error)) {
      throw new AuthFlowError(
        'auth_unavailable',
        `Não conectou em ${import.meta.env.VITE_SUPABASE_URL || 'URL vazia'}: ${error?.message || 'falha de rede'}`
      )
    }
    const afterFailure = await rpc<LockoutState>('flow_auth_check_lockout', { p_email: email })
    const nextLock = lockoutMessage(afterFailure)
    throw new AuthFlowError('invalid_credentials', nextLock ?? 'E-mail ou senha inválidos.')
  }

  const sessionId = createSessionId()
  await persistLocalSession(sessionId, data.session)
  await registerFlowSession(sessionId, String(data.session.refresh_token ?? ''), ip, userAgent)
  startAuthSessionSync()

  const profile = await readProfile(data.user.id)

  if (profile?.status && profile.status !== 'active') {
    await signOut()
    throw new AuthFlowError('inactive', 'Esta conta está inativa.')
  }

  const role = normalizeRole(profile?.role ?? DEFAULT_LOGIN_ROLE)
  if (!canLoginWithRole(role)) {
    await signOut()
    throw new AuthFlowError('no_access', 'Este cargo não possui acesso ao launcher.')
  }

  return {
    id: data.user.id,
    email: profile?.email ?? data.user.email ?? email,
    role,
    displayRole: roleLabel(role),
    displayName: profile?.display_name ?? 'Usuário',
    storeId: typeof profile?.cardplus_store_id === 'string' ? profile.cardplus_store_id : null,
    canFilterStores: canViewAllStores(role)
  }
}

function persistExpiry(expiresAt: number | undefined): number {
  return Number(expiresAt ?? Math.floor(Date.now() / 1000) + 3600)
}

async function persistLocalSession(
  sessionId: string,
  session: { access_token: string; refresh_token?: string | null; expires_at?: number }
): Promise<PersistedAuthSession> {
  const persisted: PersistedAuthSession = {
    accessToken: String(session.access_token),
    refreshToken: String(session.refresh_token ?? ''),
    expiresAt: persistExpiry(session.expires_at),
    sessionId
  }
  await readFlowApi().auth.persistSession(persisted)
  return persisted
}

async function registerFlowSession(
  sessionId: string,
  refreshToken: string,
  ip: string | null,
  userAgent: string
): Promise<void> {
  await rpc('flow_auth_register_session', {
    p_session_id: sessionId,
    p_refresh_token_hash: await sha256Hex(refreshToken),
    p_user_agent: userAgent,
    p_ip: ip,
    p_device_label: isMobileShell() ? 'FLOW Mobile' : 'FLOW Launcher',
    p_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
  })
}

async function clearLocalSession(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' })
  await window.flow?.auth.clearSession()
}

function isTransientAuthError(error: { message?: string; status?: number } | null): boolean {
  if (!error) return false
  if (error.status && error.status >= 500) return true
  const message = (error.message ?? '').toLowerCase()
  return /network|fetch|timeout|offline|failed to fetch/i.test(message)
}

function restoreFailureMessage(reason?: string): string {
  if (reason === 'inactive') return 'Esta conta está inativa.'
  if (reason === 'revoked') return 'Sua sessão foi encerrada. Entre novamente.'
  return 'Sua sessão expirou. Entre novamente.'
}

let authSyncStarted = false
let signingOut = false
let restoring = false

async function syncRefreshedTokens(session: {
  access_token: string
  refresh_token?: string | null
  expires_at?: number
}): Promise<void> {
  if (signingOut || restoring || !window.flow || !session.refresh_token) return
  const existing = await window.flow.auth.readSession()
  if (!existing) return
  await registerFlowSession(existing.sessionId, session.refresh_token, null, navigator.userAgent)
  await persistLocalSession(existing.sessionId, session)
}

export function startAuthSessionSync(): void {
  if (authSyncStarted || typeof window === 'undefined' || !window.flow) return
  authSyncStarted = true
  supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'TOKEN_REFRESHED' || !session) return
    void syncRefreshedTokens(session)
  })
}

export async function restoreSession(): Promise<AuthUser | null> {
  const flow = window.flow
  if (!flow) return null

  const persisted = await flow.auth.readSession()
  if (!persisted) return null

  restoring = true
  try {
    const originalRefresh = persisted.refreshToken
    const originalHash = await sha256Hex(originalRefresh)
    const { data, error } = await supabase.auth.setSession({
      access_token: persisted.accessToken,
      refresh_token: persisted.refreshToken
    })

    if (error || !data.session || !data.user) {
      if (isTransientAuthError(error)) {
        throw new AuthFlowError(
          'restore_failed',
          'Não foi possível restaurar a sessão. Verifique a conexão e tente de novo.'
        )
      }
      await clearLocalSession()
      throw new AuthFlowError('session_expired', 'Sua sessão expirou. Entre novamente.')
    }

    const sessionId = persisted.sessionId
    await persistLocalSession(sessionId, data.session)

    const ip = await getPublicIp()
    const validation = await rpc<SessionValidation>('flow_auth_validate_session', {
      p_session_id: sessionId,
      p_refresh_token_hash: originalHash,
      p_ip: ip,
      p_user_agent: navigator.userAgent
    })

    if (validation && validation.valid === false) {
      await clearLocalSession()
      throw new AuthFlowError('session_invalid', restoreFailureMessage(validation.reason))
    }

    if (data.session.refresh_token && data.session.refresh_token !== originalRefresh) {
      await registerFlowSession(sessionId, data.session.refresh_token, ip, navigator.userAgent)
    }

    const profile = await readProfile(data.user.id)
    const role = normalizeRole(profile?.role ?? validation?.role ?? DEFAULT_LOGIN_ROLE)
    if (!canLoginWithRole(role)) {
      await clearLocalSession()
      throw new AuthFlowError('no_access', 'Este cargo não possui acesso ao launcher.')
    }

    startAuthSessionSync()

    return {
      id: data.user.id,
      email: profile?.email ?? validation?.email ?? data.user.email ?? '',
      role,
      displayRole: roleLabel(role),
      displayName: profile?.display_name ?? validation?.display_name ?? 'Usuário',
      storeId: typeof profile?.cardplus_store_id === 'string' ? profile.cardplus_store_id : null,
      canFilterStores: canViewAllStores(role)
    }
  } finally {
    restoring = false
  }
}

export async function refreshAuthUser(): Promise<AuthUser | null> {
  const user = await restoreSession()
  if (user) {
    window.dispatchEvent(new CustomEvent('flow:auth-changed', { detail: user }))
  }
  return user
}

export async function signOut(): Promise<void> {
  signingOut = true
  try {
    const persisted = await window.flow?.auth.readSession()
    if (persisted?.sessionId) {
      await rpc('flow_auth_revoke_session', {
        p_session_id: persisted.sessionId,
        p_reason: 'logout'
      })
    }

    await supabase.auth.signOut()
    await window.flow?.auth.clearSession()
  } finally {
    signingOut = false
  }
}
