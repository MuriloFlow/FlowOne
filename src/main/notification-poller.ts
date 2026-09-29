import log from 'electron-log'
import { pollNotifications, showNativeNotification, type FlowNotification } from './notifications'

// Poller de notificações do desktop. Roda no main (independe do renderer):
// a cada 15s consulta eventos novos e dispara a notificação nativa do Windows.
// Dedupe em memória: cada evento é mostrado uma única vez por sessão.

const POLL_INTERVAL_MS = 15_000
const seen = new Set<string>()

function notify(notification: FlowNotification): void {
  if (seen.has(notification.id)) return
  seen.add(notification.id)
  if (seen.size > 300) {
    // Sessão longa: solta os mais antigos.
    const first = seen.values().next().value
    if (first) seen.delete(first)
  }
  showNativeNotification(notification.title, notification.body)
}

let timer: ReturnType<typeof setInterval> | null = null
let lastSince = new Date(Date.now() - 60_000).toISOString()
let running = false

async function tick(): Promise<void> {
  if (running) return
  running = true
  try {
    const { notifications } = await pollNotifications({ since: lastSince })
    if (notifications.length > 0) {
      lastSince = notifications[0].createdAt
      for (const item of notifications) notify(item)
    }
  } catch (error) {
    // Silencioso: rede/banco indisponível — tenta no próximo tick.
    log.debug?.('[notification-poller] tick falhou', error instanceof Error ? error.message : error)
  } finally {
    running = false
  }
}

/** Só roda com usuário logado (senão o resolveActor falha — inofensivo, mas evita lixo no log). */
export function startNotificationPoller(): void {
  if (timer) return
  timer = setInterval(() => void tick(), POLL_INTERVAL_MS)
}

export function stopNotificationPoller(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
