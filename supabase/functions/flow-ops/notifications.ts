import log from './log.ts'
import { getCardplusClient, getFlowAdminClient } from './supabase-clients.ts'
import { resolveActor } from './scope.ts'

// Central de notificações FLOW. Duas famílias de evento:
//  - cardplus_card: um funcionário registrou/aprovou cartão no CARD+ (sistema
//    externo). Um detector roda quando qualquer cliente consulta notificações —
//    compara os cartões novos com o último já notificado e cria o evento.
//  - signature_available: PC abriu uma assinatura para o celular vinculado
//    (disparado por openSignatureSession via createSignatureNotification).
//
// Os clientes (desktop Electron + mobile Capacitor) pollem pollNotifications
// e mostram notificação nativa ao encontrar evento novo (criado_at > since).

export type FlowNotification = {
  id: string
  kind: string
  title: string
  body: string
  payload: Record<string, unknown>
  target: string
  createdAt: string
}

type CardRecordRow = {
  id: string
  operator_name: string | null
  collaborator_id: string | null
  client_name: string | null
  amount_in_cents: number | null
  created_at: string
  activated: boolean | null
  activated_later?: boolean | null
}

const MAX_NOTIFICATIONS = 30
// O detector só olha cartões do dia (janela generosa de 36h para viradas de
// madrugada) — cartões mais antigos já foram notificados em poll anterior.
const DETECTION_WINDOW_HOURS = 36

function firstCollaboratorName(row: CardRecordRow): string {
  if (row.operator_name && row.operator_name.trim()) return row.operator_name.trim()
  return 'Um funcionário'
}

function cardTitle(row: CardRecordRow): string {
  const activated = row.activated === true || row.activated_later === true
  const name = firstCollaboratorName(row)
  return activated ? `${name} registrou um cartão ATIVADO` : `${name} registrou um cartão`
}

function cardBody(row: CardRecordRow): string {
  const cents = Number(row.amount_in_cents ?? 0)
  const amount = cents > 0 ? ` de R$ ${(cents / 100).toFixed(2).replace('.', ',')}` : ''
  return `Registrado no CARD+ agora${amount}.`
}

/**
 * Detector de cartões novos no CARD+ (banco externo). Barato: busca os
 * últimos cartões e compara com o último criado_at notificado; o dedupe_key
 * (id do cartão) garante um evento único por cartão mesmo com concorrência.
 */
async function detectNewCardplusCards(): Promise<void> {
  try {
    const since = new Date(Date.now() - DETECTION_WINDOW_HOURS * 3_600_000).toISOString()
    const { data, error } = await getCardplusClient()
      .from('records')
      .select(
        'id, operator_name, collaborator_id, client_name, amount_in_cents, created_at, activated, activated_later'
      )
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) {
      log.warn('[notifications] detector CARD+', error.message)
      return
    }
    const rows = (data ?? []) as CardRecordRow[]
    if (rows.length === 0) return

    // Estado do detector: último created_at já processado (guarda na própria
    // tabela via dedupe — cartões já inseridos simplesmente colidem e são
    // ignorados). Para economizar insert attempts, só considera cartões dos
    // últimos 10 minutos que ainda não foram notificados.
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString()
    const fresh = rows.filter((row) => row.created_at >= cutoff)
    if (fresh.length === 0) return

    const inserts = fresh.map((row) => ({
      kind: 'cardplus_card',
      title: cardTitle(row),
      body: cardBody(row),
      payload: {
        cardId: row.id,
        collaboratorId: row.collaborator_id ?? null,
        operatorName: row.operator_name ?? null,
        clientName: row.client_name ?? null,
        amountCents: Number(row.amount_in_cents ?? 0),
        activated: row.activated === true || row.activated_later === true
      },
      target: 'ALL',
      dedupe_key: `cardplus:${row.id}`
    }))
    const { error: insertError } = await getFlowAdminClient()
      .from('flow_notifications')
      .insert(inserts)
    if (insertError && insertError.code !== '23505') {
      // 23505 = duplicado (cartão já notificado) — é o caminho feliz.
      log.warn('[notifications] insert eventos', insertError.message)
    }
  } catch (error) {
    log.warn('[notifications] detector', error instanceof Error ? error.message : error)
  }
}

/** Cria o aviso "Assinatura digital disponível" para o celular vinculado. */
export async function createSignatureNotification(payload: {
  code: string
  collaboratorName?: string | null
  amountCents?: number | null
  storeId?: string | null
}): Promise<void> {
  try {
    const name = payload.collaboratorName?.trim() || 'recebedor'
    const cents = Number(payload.amountCents ?? 0)
    const amount = cents > 0 ? ` — R$ ${(cents / 100).toFixed(2).replace('.', ',')}` : ''
    const scope = payload.storeId ? String(payload.storeId) : 'ALL'
    await getFlowAdminClient().from('flow_notifications').insert({
      kind: 'signature_available',
      title: 'Assinatura digital disponível',
      body: `Toque para assinar o pagamento de ${name}${amount}.`,
      payload: { code: payload.code, collaboratorName: payload.collaboratorName ?? null },
      target: scope,
      dedupe_key: `signature:${payload.code}:${Date.now()}`
    })
  } catch (error) {
    // Notificação é best-effort: nunca derruba o fluxo da assinatura.
    log.warn('[notifications] assinatura', error instanceof Error ? error.message : error)
  }
}

/**
 * Lista notificações criadas depois de `since` (ISO). Toda chamada roda o
 * detector de cartões do CARD+ primeiro — polling dos clientes alimenta a
 * detecção sem precisar de cron externo.
 */
export async function pollNotifications(payload: unknown): Promise<{ notifications: FlowNotification[] }> {
  await resolveActor()
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const sinceRaw = typeof body.since === 'string' ? body.since : ''
  const sinceDate = sinceRaw ? new Date(sinceRaw) : null
  // Sem since (ou since maluco): usa 60s atrás — cliente quer "o que acabou de
  // chegar", não histórico.
  const since =
    sinceDate && !Number.isNaN(sinceDate.getTime())
      ? new Date(Math.max(sinceDate.getTime(), Date.now() - 86_400_000)).toISOString()
      : new Date(Date.now() - 60_000).toISOString()

  await detectNewCardplusCards()

  const storeId = typeof body.storeId === 'string' ? body.storeId : null
  const { data, error } = await getFlowAdminClient()
    .from('flow_notifications')
    .select('id, kind, title, body, payload, target, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_NOTIFICATIONS)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return { notifications: [] }
    throw new Error(`Erro ao carregar notificações: ${error.message}`)
  }

  const notifications = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => {
      const target = String(row.target ?? 'ALL')
      // signature_available mira a unidade do pagamento (ou todos).
      if (target === 'ALL' || !storeId) return true
      return target === storeId
    })
    .map((row) => ({
      id: String(row.id),
      kind: String(row.kind ?? ''),
      title: String(row.title ?? ''),
      body: String(row.body ?? ''),
      payload: (row.payload ?? {}) as Record<string, unknown>,
      target: String(row.target ?? 'ALL'),
      createdAt: String(row.created_at ?? '')
    }))

  // Housekeeping: apaga velhos de vez em quando (1% das chamadas).
  if (Math.random() < 0.01) {
    void getFlowAdminClient()
      .from('flow_notifications')
      .delete()
      .lt('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
  }
  return { notifications }
}
