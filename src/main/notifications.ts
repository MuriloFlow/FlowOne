import { Notification, BrowserWindow } from 'electron'
import log from 'electron-log'
import { getCardplusClient, getFlowAdminClient } from './supabase-clients'

// Central de notificações do desktop (espelho da edge flow-ops/notifications.ts).
// Duas famílias de evento:
//  - cardplus_card: funcionário registrou cartão no CARD+ (banco externo) —
//    detector compara cartões novos com o último notificado.
//  - signature_available: PC abriu assinatura para o celular vinculado.
//
// O desktop roda o MESMO detector da edge ao polliar: quem chegar primeiro
// (edge ou main) cria o evento; dedupe_key (unique) evita duplicar.

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

export async function detectNewCardplusCards(): Promise<void> {
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
    const { error: insertError } = await getFlowAdminClient().from('flow_notifications').insert(inserts)
    if (insertError && insertError.code !== '23505') {
      log.warn('[notifications] insert eventos', insertError.message)
    }
  } catch (error) {
    log.warn('[notifications] detector', error instanceof Error ? error.message : error)
  }
}

/** Notificação nativa do Windows (bandeja). Clicar traz a janela do FLOW. */
export function showNativeNotification(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return
    const notification = new Notification({ title, body, silent: false })
    notification.on('click', () => {
      const window = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
      if (window) {
        if (window.isMinimized()) window.restore()
        window.show()
        window.focus()
      }
    })
    notification.show()
  } catch (error) {
    log.warn('[notifications] nativa', error instanceof Error ? error.message : error)
  }
}

/** Lista eventos novos (created_at > since). Roda o detector CARD+ antes. */
export async function pollNotifications(payload: unknown): Promise<{ notifications: FlowNotification[] }> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const sinceRaw = typeof body.since === 'string' ? body.since : ''
  const sinceDate = sinceRaw ? new Date(sinceRaw) : null
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

  if (Math.random() < 0.01) {
    void getFlowAdminClient()
      .from('flow_notifications')
      .delete()
      .lt('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
  }
  return { notifications }
}
