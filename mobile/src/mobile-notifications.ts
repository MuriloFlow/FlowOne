import { callOp } from '../../src/renderer/src/lib/flow-ops-client'
import type { FlowNotification } from '../../src/shared/operations'

// Notificações do FLOW Mobile. Polling leve (20s com app aberto; adiantado ao
// voltar do background) na central flow_notifications:
//  - cardplus_card: "Funcionário X registrou um cartão (ATIVADO)" — chega para
//    todos os dispositivos com o app instalado.
//  - signature_available: PC marcou uma assinatura para o celular vinculado —
//    a notificação "Assinatura digital disponível" abre direto na tela de
//    assinatura daquela requisição ao tocar (abre o app se estiver fechado:
//    a tela branca abre sozinha porque o PC já sinalizou open_count).

const POLL_INTERVAL_MS = 20_000
// Janela padrão: últimos 90s (o intervalo é 20s, mas tolera ticks perdidos).
const DEFAULT_WINDOW_MS = 90_000
const MAX_SEEN = 200

type LocalNotificationsModule = {
  requestPermissions: () => Promise<{ display: 'granted' | 'denied' | 'prompt' }>
  schedule: (options: {
    notifications: Array<{
      id: number
      title: string
      body: string
      smallIcon?: string
      largeIcon?: string
      iconColor?: string
    }>
  }) => Promise<unknown>
  addListener: (
    eventName: 'localNotificationActionPerformed',
    listener: (action: { notification?: { id?: number; extra?: Record<string, unknown> } }) => void
  ) => Promise<{ remove: () => void }>
}

let localNotifications: LocalNotificationsModule | null = null
let timer: ReturnType<typeof setInterval> | null = null
let sinceIso: string | null = null
const seenIds = new Set<string>()

function rememberSeen(): void {
  if (seenIds.size <= MAX_SEEN) return
  for (const id of seenIds) {
    seenIds.delete(id)
    if (seenIds.size <= MAX_SEEN / 2) break
  }
}

async function ensurePermissions(): Promise<boolean> {
  try {
    if (!localNotifications) {
      const loaded = await import('@capacitor/local-notifications')
      localNotifications = loaded.LocalNotifications as unknown as LocalNotificationsModule
    }
    const { display } = await localNotifications.requestPermissions()
    return display === 'granted'
  } catch {
    return false
  }
}

let notificationIdSeq = 5000

async function showLocal(notification: FlowNotification): Promise<void> {
  const granted = await ensurePermissions()
  if (!granted || !localNotifications) return
  const isSignature = notification.kind === 'signature_available'
  notificationIdSeq += 1
  try {
    await localNotifications.schedule({
      notifications: [
        {
          id: notificationIdSeq % 2_000_000_000,
          title: notification.title,
          body: notification.body,
          smallIcon: 'ic_launcher',
          largeIcon: 'ic_launcher',
          iconColor: isSignature ? '#34D399' : '#F0EFEC'
        }
      ]
    })
  } catch {
    /* bandeja indisponível: segue */
  }
}

// Deep-link: tocar na notificação de assinatura reabre o app no modo sync
// (o host de assinatura é global e reage ao open_count sozinho).
let onSignatureTap: (() => void) | null = null

export function setSignatureTapHandler(handler: (() => void) | null): void {
  onSignatureTap = handler
}

async function bindTapAction(): Promise<void> {
  try {
    if (!localNotifications) await ensurePermissions()
    if (!localNotifications) return
    await localNotifications.addListener('localNotificationActionPerformed', () => {
      // Ao tocar em qualquer notificação do FLOW, traz o app para frente;
      // se a fila tinha assinatura pendente, o host reabre a tela branca.
      onSignatureTap?.()
    })
  } catch {
    /* sem listener */
  }
}

async function poll(): Promise<void> {
  try {
    const storeId = readCurrentStoreId()
    const { notifications } = await callOp<{ notifications: FlowNotification[] }>('pollNotifications', {
      since: sinceIso ?? new Date(Date.now() - DEFAULT_WINDOW_MS).toISOString(),
      storeId
    })
    sinceIso = new Date(Date.now() - 2_000).toISOString()
    for (const notification of notifications) {
      if (seenIds.has(notification.id)) continue
      seenIds.add(notification.id)
      rememberSeen()
      void showLocal(notification)
      if (notification.kind === 'signature_available') {
        // Notificação de assinatura: também funciona como "toque" — o host
        // global verifica open_count no próximo poll (1.1s) e abre a tela.
        onSignatureTap?.()
      }
    }
  } catch {
    /* rede/sessão: tenta no próximo tick */
  }
}

// storeId corrente (escopo de unidade para notificações miradas).
function readCurrentStoreId(): string | null {
  try {
    const module = window as unknown as { __flowStoreId?: string | null }
    return module.__flowStoreId ?? null
  } catch {
    return null
  }
}

export function installNotificationRuntime(): void {
  void bindTapAction()
  void poll()
  if (!timer) timer = setInterval(() => void poll(), POLL_INTERVAL_MS)
  // Ao voltar do background, adianta o poll.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void poll()
  })
}

export function refreshNotificationStoreScope(storeId: string | null): void {
  const module = window as unknown as { __flowStoreId?: string | null }
  module.__flowStoreId = storeId
}
