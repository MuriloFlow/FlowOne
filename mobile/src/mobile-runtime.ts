import { supabase } from '../../src/renderer/src/lib/supabase'
import { OpsUnavailableError } from '../../src/renderer/src/lib/flow-ops-client'

type StoredSession = {
  accessToken: string
  refreshToken: string
  expiresAt: number
  sessionId: string
}

const UPDATE_NOTICE_KEY = 'flow.mobile.shown-update-version'
const UPDATE_NOTICE_DURATION_MS = 4_200
const UPDATE_NOTICE_STYLE_ID = 'flow-mobile-update-notice-style'

let installPromise: Promise<void> | null = null
let recoveryPromise: Promise<void> | null = null

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<StoredSession>
  return (
    typeof session.accessToken === 'string' &&
    typeof session.refreshToken === 'string' &&
    typeof session.sessionId === 'string'
  )
}

function sessionId(value: string): string {
  if (value.trim().length >= 16) return value
  return `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function renewMobileSession(forceRefresh = false): Promise<void> {
  const flow = window.flow
  if (!flow) return

  const stored = await flow.auth.readSession()
  if (!isStoredSession(stored)) return

  const restored = await supabase.auth.setSession({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken
  })
  let session = restored.data.session
  if (restored.error || !session?.access_token || !session.refresh_token) return

  if (forceRefresh) {
    const refreshed = await supabase.auth.refreshSession()
    if (refreshed.data.session?.access_token && refreshed.data.session.refresh_token) {
      session = refreshed.data.session
    }
  }

  const persisted: StoredSession = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: Number(session.expires_at ?? Math.floor(Date.now() / 1_000) + 3_600),
    sessionId: sessionId(stored.sessionId)
  }
  await flow.auth.persistSession(persisted)

  // A sessão de dispositivo é uma proteção extra do FLOW. No mobile ela precisa
  // ser reparada antes da tela montar, pois o token pode ter sido renovado pelo
  // Android/iOS enquanto o app estava fechado.
  const { error } = await supabase.rpc('flow_auth_register_session', {
    p_session_id: persisted.sessionId,
    p_refresh_token_hash: await sha256(persisted.refreshToken),
    p_user_agent: navigator.userAgent,
    p_ip: null,
    p_device_label: 'FLOW Mobile',
    p_expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
  })
  if (error) console.warn('[mobile-session] registro de dispositivo', error.message)
}

function recoverMobileSession(): Promise<void> {
  if (!recoveryPromise) {
    // A recuperação SEMPRE força a renovação do token: se chegou aqui, a
    // sessão atual já falhou em pelo menos uma chamada.
    recoveryPromise = renewMobileSession(true).finally(() => {
      recoveryPromise = null
    })
  }
  return recoveryPromise
}

const READ_OPERATIONS = new Set([
  'getOverview',
  'getFinance',
  'listStores',
  'listEmployees',
  'getEmployee',
  'getEmployeeIdentity',
  'getEmployeeDocument',
  'getStorePreference',
  'listStoreBoard',
  'listStoreAccess',
  'getCardsBoard',
  'getScheduleBoard',
  'getAttendanceBoard',
  'listVouchers',
  'listVoucherHistory',
  'lookupSorteioClient',
  'listSorteioBoard',
  'listFlowUsers',
  'getActorScope'
])

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? '')
}

function isSessionIssue(error: unknown): boolean {
  const message = errorMessage(error)
  return /sess[aã]o\s+(inv[aá]lida|expirou)|token\s+(inv[aá]lido|expirado)|jwt|unauthoriz|autoriz/i.test(message)
}

function isReadConnectionIssue(error: unknown): boolean {
  const message = errorMessage(error)
  return /network|offline|timeout|failed to fetch|sem conex[aã]o|servidor flow n[aã]o respondeu/i.test(message)
}

function waitForConnectionRetry(attempt: number): Promise<void> {
  const backoffMs = 600 * attempt
  return new Promise((resolve) => window.setTimeout(resolve, backoffMs))
}

function wrapMobileOperations(): void {
  const flow = window.flow
  if (!flow || (flow.operations as { __mobileReliable?: boolean }).__mobileReliable) return

  const originalOperations = flow.operations as Record<PropertyKey, unknown>
  const wrappers = new Map<PropertyKey, unknown>()
  const operations = new Proxy(originalOperations, {
    get(target, property, receiver) {
      if (property === '__mobileReliable') return true
      const original = Reflect.get(target, property, receiver)
      if (typeof original !== 'function') return original
      if (wrappers.has(property)) return wrappers.get(property)

      const wrapped = async (...args: unknown[]) => {
        const isRead = typeof property === 'string' && READ_OPERATIONS.has(property)
        // Leituras recuperam sozinhas de sessão/conexão; escritas só tentam
        // de novo quando o problema foi de sessão.
        const maxAttempts = isRead ? 3 : 2
        for (let attempt = 1; ; attempt += 1) {
          try {
            return await original.apply(target, args)
          } catch (error) {
            const sessionProblem = isSessionIssue(error)
            const connectionProblem = error instanceof OpsUnavailableError || isReadConnectionIssue(error)
            const canRetry = attempt < maxAttempts && (sessionProblem || (isRead && connectionProblem))
            if (!canRetry) throw error
            if (sessionProblem) await recoverMobileSession()
            else await waitForConnectionRetry(attempt)
          }
        }
      }
      wrappers.set(property, wrapped)
      return wrapped
    }
  })

  const originalInvoke = flow.invoke.bind(flow)
  flow.invoke = async (channel: string, payload?: unknown) => {
    try {
      return await originalInvoke(channel, payload)
    } catch (error) {
      if (!isSessionIssue(error)) throw error
      await recoverMobileSession()
      return originalInvoke(channel, payload)
    }
  }
  flow.operations = operations as typeof flow.operations
}

function installNoticeStyles(): void {
  if (document.getElementById(UPDATE_NOTICE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = UPDATE_NOTICE_STYLE_ID
  style.textContent = `
    @keyframes flow-mobile-update-in {
      from { opacity: 0; transform: translate(-50%, calc(100% + 28px)); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }
    @keyframes flow-mobile-update-out {
      from { opacity: 1; transform: translate(-50%, 0); }
      to { opacity: 0; transform: translate(-50%, calc(100% + 28px)); }
    }
    .flow-mobile-update-notice {
      position: fixed;
      z-index: 2147483647;
      left: 50%;
      bottom: max(20px, calc(env(safe-area-inset-bottom, 0px) + 14px));
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 230px;
      padding: 12px 18px;
      border: 1px solid rgba(110, 231, 183, .34);
      border-radius: 16px;
      background: #064e3b;
      box-shadow: 0 16px 38px rgba(0, 0, 0, .36);
      color: #ecfdf5;
      font: 600 13px/1 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      cursor: pointer;
      animation: flow-mobile-update-in .34s cubic-bezier(.22, 1, .36, 1) both;
    }
    .flow-mobile-update-notice--leaving {
      animation: flow-mobile-update-out .26s ease-in both;
    }
    .flow-mobile-update-notice__check {
      display: grid;
      width: 20px;
      height: 20px;
      place-items: center;
      border-radius: 50%;
      background: #34d399;
      color: #052e24;
      font-size: 13px;
      font-weight: 800;
    }
    .flow-mobile-update-notice__text {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .flow-mobile-update-notice__title {
      font-size: 13px;
      letter-spacing: .01em;
    }
    .flow-mobile-update-notice__sub {
      font-size: 11px;
      font-weight: 500;
      color: rgba(236, 253, 245, .72);
    }
  `
  document.head.append(style)
}

function showUpdateNotice(version: string): void {
  if (document.querySelector('.flow-mobile-update-notice')) return
  installNoticeStyles()
  const notice = document.createElement('div')
  notice.className = 'flow-mobile-update-notice'
  notice.setAttribute('role', 'status')
  notice.setAttribute('aria-live', 'polite')

  const check = document.createElement('span')
  check.className = 'flow-mobile-update-notice__check'
  check.textContent = '✓'

  const text = document.createElement('span')
  text.className = 'flow-mobile-update-notice__text'
  const title = document.createElement('span')
  title.className = 'flow-mobile-update-notice__title'
  title.textContent = 'FLOW ATUALIZADO'
  const sub = document.createElement('span')
  sub.className = 'flow-mobile-update-notice__sub'
  sub.textContent = `Versão ${version} pronta para uso`
  text.append(title, sub)

  notice.append(check, text)
  // Clicar apenas fecha o aviso — o app já está na versão nova.
  notice.addEventListener('click', () => {
    notice.classList.add('flow-mobile-update-notice--leaving')
    window.setTimeout(() => notice.remove(), 300)
  })
  document.body.append(notice)

  window.setTimeout(() => {
    notice.classList.add('flow-mobile-update-notice--leaving')
    window.setTimeout(() => notice.remove(), 300)
  }, UPDATE_NOTICE_DURATION_MS)
}

// Notificação nativa do Android/iOS: fica na bandeja e abre o app ao tocar.
async function notifyNativeUpdate(version: string): Promise<void> {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { display } = await LocalNotifications.requestPermissions()
    if (display !== 'granted') return
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 20260926,
          title: 'FLOW ATUALIZADO',
          body: `Sua versão ${version} foi aplicada com sucesso.`,
          smallIcon: 'ic_launcher',
          largeIcon: 'ic_launcher',
          iconColor: '#34D399'
        }
      ]
    })
  } catch (error) {
    console.warn('[mobile-update] notificação nativa', error)
  }
}

async function showAppliedUpdateOnce(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (!Capacitor.isNativePlatform()) return

    const [{ Preferences }, { CapacitorUpdater }] = await Promise.all([
      import('@capacitor/preferences'),
      import('@capgo/capacitor-updater')
    ])
    const current = await CapacitorUpdater.current()
    const version = current.bundle?.version?.trim()
    if (!version || version === 'builtin') return

    const shown = (await Preferences.get({ key: UPDATE_NOTICE_KEY })).value
    if (shown === version) return
    await Preferences.set({ key: UPDATE_NOTICE_KEY, value: version })
    showUpdateNotice(version)
    void notifyNativeUpdate(version)
  } catch (error) {
    console.warn('[mobile-update] aviso de versão', error)
  }
}

async function install(): Promise<void> {
  await renewMobileSession()
  wrapMobileOperations()
  void showAppliedUpdateOnce()
}

export function installMobileRuntime(): Promise<void> {
  if (!installPromise) installPromise = install()
  return installPromise
}
