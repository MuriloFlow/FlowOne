// Vínculo PC ↔ celular da assinatura digital (dura 24h).
// O PC guarda o código da sessão pareada; o celular também. Enquanto o
// vínculo valer, todo pagamento aberto no PC dispara a tela de assinatura no
// celular automaticamente — sem parear de novo.

export type SignatureLink = { code: string; expiresAt: number }

const LINK_TTL_MS = 24 * 60 * 60 * 1000
const PC_KEY = 'flow.signature.pc-link'
const PHONE_KEY = 'flow.signature.phone-link'
const CHANGE_EVENT = 'flow-signature-link-change'

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    return window.localStorage
  } catch {
    return null
  }
}

function emitChange(): void {
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    /* ambiente sem eventos */
  }
}

function normalize(raw: string | null): SignatureLink | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as SignatureLink
    if (!parsed?.code || typeof parsed.expiresAt !== 'number') return null
    if (parsed.expiresAt <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export function getSignatureLink(side: 'pc' | 'phone'): SignatureLink | null {
  const storage = safeStorage()
  if (!storage) return null
  return normalize(storage.getItem(side === 'pc' ? PC_KEY : PHONE_KEY))
}

export function setSignatureLink(side: 'pc' | 'phone', code: string): SignatureLink {
  const link: SignatureLink = { code, expiresAt: Date.now() + LINK_TTL_MS }
  const storage = safeStorage()
  try {
    storage?.setItem(side === 'pc' ? PC_KEY : PHONE_KEY, JSON.stringify(link))
  } catch {
    /* storage cheio/indisponível */
  }
  emitChange()
  return link
}

export function clearSignatureLink(side: 'pc' | 'phone', code?: string): void {
  const storage = safeStorage()
  if (!storage) return
  const key = side === 'pc' ? PC_KEY : PHONE_KEY
  if (code) {
    const current = normalize(storage.getItem(key))
    if (current && current.code !== code) return
  }
  try {
    storage.removeItem(key)
  } catch {
    /* ignore */
  }
  emitChange()
}

export function subscribeSignatureLink(listener: () => void): () => void {
  try {
    window.addEventListener(CHANGE_EVENT, listener)
    window.addEventListener('storage', listener)
    return () => {
      window.removeEventListener(CHANGE_EVENT, listener)
      window.removeEventListener('storage', listener)
    }
  } catch {
    return () => undefined
  }
}

export const SIGNATURE_LINK_TTL_MS = LINK_TTL_MS

export function hoursLeft(expiresAt: number): number {
  return Math.max(0, Math.round((expiresAt - Date.now()) / (60 * 60 * 1000)))
}
