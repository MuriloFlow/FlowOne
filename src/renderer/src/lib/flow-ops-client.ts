import { supabase } from '@/lib/supabase'
import { currentAccessToken } from '@/lib/auth'
import { isMobileShell } from '@/lib/is-mobile-shell'

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')

// Fallbacks em ordem: a URL explícita sempre primeiro; se ela estiver apontando
// para um host antigo/quebrado, tentamos derivar a canônica do próprio banco
// informado no build do app.
function fallbackOpsUrls(): string[] {
  const list: string[] = []
  const push = (value: string | undefined | null) => {
    const candidate = value?.trim()
    if (candidate && candidate.startsWith('http') && !list.includes(candidate)) list.push(candidate)
  }
  push(import.meta.env.VITE_FLOW_OPS_URL)
  push(`${SUPABASE_URL}/functions/v1/flow-ops`)
  push('https://flowone.db.flwdesk.com/functions/v1/flow-ops')
  return list
}

const ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')

type OpsEnvelope<T> = { ok?: boolean; data?: T; error?: string }

export class OpsUnavailableError extends Error {
  constructor(message = 'Sem conexão com o FLOW agora. Confira a internet e tente de novo.') {
    super(message)
    this.name = 'OpsUnavailableError'
  }
}

const OPS_TIMEOUT_MS = 20_000

async function postOps(url: string, op: string, payload: unknown, token: string): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), OPS_TIMEOUT_MS)
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ op, payload }),
      signal: controller.signal
    })
  } finally {
    window.clearTimeout(timer)
  }
}

function parseOpsBody<T>(text: string): OpsEnvelope<T> | null {
  try {
    return JSON.parse(text) as OpsEnvelope<T>
  } catch {
    return null
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function requestAccessToken(): Promise<string> {
  const active = currentAccessToken()
  if (active) return active

  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) return data.session.access_token

  const persisted = await window.flow?.auth.readSession()
  if (persisted?.accessToken && persisted.refreshToken) {
    const restored = await supabase.auth
      .setSession({ access_token: persisted.accessToken, refresh_token: persisted.refreshToken })
      .catch(() => null)
    const token = restored?.data.session?.access_token
    if (token) return token
    if (persisted.accessToken) return persisted.accessToken
  }

  throw new Error('Sua sessão expirou. Entre de novo no FLOW.')
}

export async function callOp<T>(op: string, payload?: unknown): Promise<T> {
  const urls = fallbackOpsUrls()
  if (urls.length === 0) {
    throw new Error('O app está sem o endereço do FLOW. Atualize o aplicativo.')
  }

  const token = await requestAccessToken()
  const native = isMobileShell()
  const attemptsPerUrl = native ? 2 : 1
  let lastError: unknown = null

  for (const url of urls) {
    for (let attempt = 1; attempt <= attemptsPerUrl; attempt += 1) {
      try {
        const response = await postOps(url, op, payload, token)
        const text = await response.text()
        const json = parseOpsBody<T>(text)
        if (!json) {
          // Gateway fora do ar devolve HTML/erro sem JSON; tenta o próximo alvo.
          lastError = new OpsUnavailableError('O servidor FLOW não respondeu. Tente de novo.')
          continue
        }
        if (!json.ok) {
          const message = json.error?.trim() || 'Não foi possível concluir esta operação.'
          throw new Error(message)
        }
        return json.data as T
      } catch (error) {
        lastError = error
        if (error instanceof OpsUnavailableError) continue
        if (error instanceof Error) {
          // Abort/timeout e falha de rede tentam o próximo alvo; erro de
          // negócio (sessão, permissão, validação) propaga direto.
          const transient = error.name === 'AbortError' || /network|fetch|timeout|failed/i.test(error.message)
          if (!transient) throw error
        }
      }
      if (attempt < attemptsPerUrl) await delay(450 * attempt)
    }
  }

  if (lastError instanceof OpsUnavailableError) throw lastError
  throw new OpsUnavailableError()
}
