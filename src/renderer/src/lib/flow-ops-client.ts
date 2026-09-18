import { supabase } from '@/lib/supabase'

const OPS_URL =
  import.meta.env.VITE_FLOW_OPS_URL?.trim() ||
  `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/flow-ops`

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  if (data.session?.access_token) return data.session.access_token

  const persisted = await window.flow?.auth.readSession()
  if (persisted?.accessToken && persisted.refreshToken) {
    const restored = await supabase.auth.setSession({
      access_token: persisted.accessToken,
      refresh_token: persisted.refreshToken
    })
    const token = restored.data.session?.access_token ?? persisted.accessToken
    if (token) return token
  }

  throw new Error('Sua sessão expirou. Entre de novo no FLOW.')
}

async function postOp(op: string, payload: unknown, token: string): Promise<Response> {
  return fetch(OPS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ op, payload })
  })
}

export async function callOp<T>(op: string, payload?: unknown): Promise<T> {
  if (!OPS_URL || !OPS_URL.startsWith('http')) {
    throw new Error('O app mobile está sem o endereço do FLOW. Reinstale o APK.')
  }

  const token = await accessToken()
  let response: Response
  try {
    response = await postOp(op, payload, token)
  } catch {
    await new Promise((resolve) => window.setTimeout(resolve, 400))
    try {
      response = await postOp(op, payload, token)
    } catch {
      throw new Error('Sem conexão com o FLOW agora. Confira a internet e tente de novo.')
    }
  }

  let json: { ok?: boolean; data?: T; error?: string }
  try {
    json = (await response.json()) as { ok?: boolean; data?: T; error?: string }
  } catch {
    throw new Error('O servidor FLOW não respondeu. Tente de novo.')
  }

  if (!json.ok) {
    throw new Error(json.error?.trim() || 'Não foi possível concluir esta operação.')
  }
  return json.data as T
}
