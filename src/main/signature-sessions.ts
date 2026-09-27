import log from 'electron-log'
import { getFlowAdminClient } from './supabase-clients'
import { resolveStoreFilter } from './scope'
import type { ActorScope } from './scope'

// Espelho do supabase/functions/flow-ops/signature-sessions.ts — mantenha os
// dois em sincronia. Assinatura digital sincronizada (PC ↔ celular).

export type SignatureStrokePoint = { x: number; y: number; m?: 1 }

export type SignatureSessionStatus =
  | 'waiting'
  | 'linked'
  | 'signed'
  | 'confirmed'
  | 'cancelled'
  | 'expired'

export type SignatureSessionView = {
  id: string
  code: string
  status: SignatureSessionStatus
  ownerToken: string | null
  collaboratorName: string | null
  amountCents: number | null
  aspect: number
  strokes: SignatureStrokePoint[]
  expiresAt: string
}

const SESSION_TTL_MINUTES = 15
const MAX_POINTS = 6000

type SignatureRow = {
  id: string
  code: string
  status: string
  created_by: string | null
  store_id: string | null
  collaborator_id: string | null
  collaborator_name: string | null
  amount_cents: number | null
  aspect: number | null
  strokes: SignatureStrokePoint[] | null
  created_at: string
  linked_at: string | null
  signed_at: string | null
  confirmed_at: string | null
  expires_at: string
  owner_token?: string | null
}

function randomCode(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) code += String(byte % 10)
  return code
}

function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function expiryDate(): string {
  return new Date(Date.now() + SESSION_TTL_MINUTES * 60_000).toISOString()
}

function isFresh(row: SignatureRow): boolean {
  return new Date(row.expires_at).getTime() > Date.now() - 60_000
}

function normalizeStatus(row: SignatureRow): SignatureSessionStatus {
  if (isFresh(row)) return row.status as SignatureSessionStatus
  return row.status === 'waiting' || row.status === 'linked'
    ? 'expired'
    : (row.status as SignatureSessionStatus)
}

function toView(row: SignatureRow, options?: { withToken?: boolean }): SignatureSessionView {
  return {
    id: row.id,
    code: row.code,
    status: normalizeStatus(row),
    ownerToken: options?.withToken ? row.owner_token ?? null : null,
    collaboratorName: row.collaborator_name ?? null,
    amountCents: row.amount_cents ?? null,
    aspect: row.aspect ?? 2.2,
    strokes: Array.isArray(row.strokes) ? row.strokes : [],
    expiresAt: row.expires_at
  }
}

function safePoints(value: unknown): SignatureStrokePoint[] | null {
  if (!Array.isArray(value)) return null
  const points: SignatureStrokePoint[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Record<string, unknown>
    if (item.m === 1) {
      // Marcador de novo traço (sem coordenadas reais).
      points.push({ x: 0, y: 0, m: 1 })
      continue
    }
    const x = Number(item.x)
    const y = Number(item.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    points.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
    if (points.length >= 800) break
  }
  return points
}

async function purgeExpired(): Promise<void> {
  try {
    await getFlowAdminClient()
      .from('flow_signature_sessions')
      .delete()
      .lt('expires_at', new Date(Date.now() - 30 * 60_000).toISOString())
  } catch (error) {
    log.warn('signature purge', error instanceof Error ? error.message : error)
  }
}

async function loadByCode(code: string): Promise<SignatureRow | null> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_signature_sessions')
    .select('*')
    .eq('code', code)
    .maybeSingle()
  if (error) throw new Error(`Erro ao carregar sessão de assinatura: ${error.message}`)
  return (data as SignatureRow | null) ?? null
}

async function loadByToken(token: string): Promise<SignatureRow | null> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_signature_sessions')
    .select('*')
    .eq('owner_token', token)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Erro ao carregar sessão de assinatura: ${error.message}`)
  return (data as SignatureRow | null) ?? null
}

export async function createSignatureSession(payload: unknown, actor: ActorScope): Promise<SignatureSessionView> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const aspectRaw = Number(body.aspect)
  const aspect = Number.isFinite(aspectRaw) ? Math.min(4, Math.max(1, aspectRaw)) : 2.2
  const storeId = resolveStoreFilter(actor, body.storeId ?? null)
  const collaboratorName = typeof body.collaboratorName === 'string' ? body.collaboratorName.slice(0, 120) : null
  const amountCents = Number.isFinite(Number(body.amountCents))
    ? Math.max(0, Math.round(Number(body.amountCents)))
    : null
  const collaboratorId = typeof body.collaboratorId === 'string' && body.collaboratorId ? body.collaboratorId : null

  await purgeExpired()

  const ownerToken = randomToken()
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = randomCode()
    const existing = await loadByCode(code)
    if (existing && isFresh(existing) && existing.status !== 'cancelled') continue
    const { data, error } = await getFlowAdminClient()
      .from('flow_signature_sessions')
      .insert({
        code,
        status: 'waiting',
        created_by: actor.userId,
        store_id: storeId,
        collaborator_id: collaboratorId,
        collaborator_name: collaboratorName,
        amount_cents: amountCents,
        aspect,
        strokes: [],
        owner_token: ownerToken,
        expires_at: expiryDate()
      })
      .select('*')
      .single()
    if (error) {
      if (error.code === '23505') continue // código em uso — sorteia outro
      throw new Error(`Erro ao abrir assinatura sincronizada: ${error.message}`)
    }
    return toView(data as SignatureRow, { withToken: true })
  }
  throw new Error('Não foi possível gerar um código agora. Tente de novo.')
}

export async function joinSignatureSession(payload: unknown): Promise<SignatureSessionView> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const code = String(body.code ?? '').trim()
  if (!/^\d{4}$/.test(code)) throw new Error('Digite o código de 4 dígitos mostrado no computador.')
  const row = await loadByCode(code)
  if (!row) throw new Error('Código não encontrado. Confira os 4 dígitos no computador.')
  if (!isFresh(row) || row.status === 'expired' || row.status === 'cancelled') {
    throw new Error('Este código expirou. Peça um código novo no computador.')
  }
  if (row.status === 'waiting') {
    const { data, error } = await getFlowAdminClient()
      .from('flow_signature_sessions')
      .update({ status: 'linked', linked_at: new Date().toISOString() })
      .eq('id', row.id)
      .select('*')
      .single()
    if (error) throw new Error(`Erro ao vincular o celular: ${error.message}`)
    return toView(data as SignatureRow)
  }
  return toView(row)
}

export async function getSignatureSession(payload: unknown): Promise<SignatureSessionView> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const token = typeof body.ownerToken === 'string' ? body.ownerToken.trim() : ''
  if (token) {
    const row = await loadByToken(token)
    if (!row) throw new Error('Sessão de assinatura não encontrada. Abra uma nova.')
    return toView(row, { withToken: true })
  }
  if (!/^\d{4}$/.test(code)) throw new Error('Sessão de assinatura inválida.')
  const row = await loadByCode(code)
  if (!row) throw new Error('Sessão de assinatura não encontrada. Confira o código no computador.')
  return toView(row)
}

export async function pushSignatureStrokes(payload: unknown): Promise<SignatureSessionView> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const code = String(body.code ?? '').trim()
  if (!/^\d{4}$/.test(code)) throw new Error('Sessão de assinatura inválida.')
  const row = await loadByCode(code)
  if (!row) throw new Error('Sessão de assinatura não encontrada.')
  if (!isFresh(row)) throw new Error('Esta sessão expirou. Peça um código novo no computador.')
  if (row.status === 'confirmed' || row.status === 'cancelled') {
    throw new Error('Esta assinatura já foi concluída no computador.')
  }

  if (body.reset === true) {
    const { data, error } = await getFlowAdminClient()
      .from('flow_signature_sessions')
      .update({ strokes: [], status: 'linked' })
      .eq('id', row.id)
      .select('*')
      .single()
    if (error) throw new Error(`Erro ao limpar a assinatura: ${error.message}`)
    return toView(data as SignatureRow)
  }

  const batch = safePoints(body.strokes)
  if (!batch || batch.length === 0) return toView(row)

  const existing = Array.isArray(row.strokes) ? row.strokes : []
  if (existing.length >= MAX_POINTS) throw new Error('Assinatura muito longa. Levante o dedo e continue.')
  const merged = [...existing, ...batch].slice(0, MAX_POINTS)
  const { data, error } = await getFlowAdminClient()
    .from('flow_signature_sessions')
    .update({ strokes: merged, status: 'linked' })
    .eq('id', row.id)
    .select('*')
    .single()
  if (error) throw new Error(`Erro ao enviar a assinatura: ${error.message}`)
  return toView(data as SignatureRow)
}

export async function finishSignatureSession(payload: unknown): Promise<SignatureSessionView> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const code = String(body.code ?? '').trim()
  if (!/^\d{4}$/.test(code)) throw new Error('Sessão de assinatura inválida.')
  const row = await loadByCode(code)
  if (!row) throw new Error('Sessão de assinatura não encontrada.')
  if (!isFresh(row)) throw new Error('Esta sessão expirou. Peça um código novo no computador.')
  const strokes = Array.isArray(row.strokes) ? row.strokes : []
  if (strokes.length < 8) throw new Error('Desenhe a assinatura antes de enviar.')
  const { data, error } = await getFlowAdminClient()
    .from('flow_signature_sessions')
    .update({ status: 'signed', signed_at: new Date().toISOString() })
    .eq('id', row.id)
    .select('*')
    .single()
  if (error) throw new Error(`Erro ao finalizar a assinatura: ${error.message}`)
  log.info('signature-session signed', code)
  return toView(data as SignatureRow)
}

export async function confirmSignatureSession(payload: unknown): Promise<SignatureSessionView> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const token = typeof body.ownerToken === 'string' ? body.ownerToken.trim() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const row = token ? await loadByToken(token) : code ? await loadByCode(code) : null
  if (!row) throw new Error('Sessão de assinatura não encontrada.')
  const strokes = Array.isArray(row.strokes) ? row.strokes : []
  if (strokes.length < 8) throw new Error('Nenhuma assinatura recebida do celular ainda.')
  const { data, error } = await getFlowAdminClient()
    .from('flow_signature_sessions')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', row.id)
    .select('*')
    .single()
  if (error) throw new Error(`Erro ao confirmar a assinatura: ${error.message}`)
  return toView(data as SignatureRow, { withToken: Boolean(token) })
}

export async function cancelSignatureSession(payload: unknown): Promise<SignatureSessionView | null> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const token = typeof body.ownerToken === 'string' ? body.ownerToken.trim() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const row = token ? await loadByToken(token) : code ? await loadByCode(code) : null
  if (!row) return null
  const { data, error } = await getFlowAdminClient()
    .from('flow_signature_sessions')
    .update({ status: 'cancelled' })
    .eq('id', row.id)
    .select('*')
    .single()
  if (error) throw new Error(`Erro ao encerrar a assinatura: ${error.message}`)
  return toView(data as SignatureRow, { withToken: Boolean(token) })
}
