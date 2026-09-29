// Smoke test E2E das signature sessions + vouchers (leitura do board).
// Uso: node scripts/smoke-signature.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const raw of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const cut = line.indexOf('=')
  env[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
}

const base = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const anon = env.VITE_SUPABASE_ANON_KEY
if (!base || !anon) throw new Error('VITE_SUPABASE_URL/ANON_KEY ausentes no .env.local')

const authRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.FLOW_BOOTSTRAP_EMAIL, password: env.FLOW_BOOTSTRAP_PASSWORD })
})
const auth = await authRes.json()
if (!authRes.ok || !auth.access_token) throw new Error(`Login falhou (${authRes.status})`)

async function callOp(op, payload) {
  const res = await fetch(`${base}/functions/v1/flow-ops`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      apikey: anon,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ op, payload })
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) throw new Error(`${op}: ${json.error || res.status}`)
  return json.data
}

// 1) create (simula o celular gerando o código)
const session = await callOp('createSignatureSession', { aspect: 2.2 })
console.log('create:', session.code, session.status)

// 2) join (simula o PC inserindo o código — vira linked com 24h)
const joined = await callOp('joinSignatureSession', { code: session.code })
const hours = joined.expiresAt ? ((new Date(joined.expiresAt) - Date.now()) / 3600000).toFixed(1) : '?'
console.log('join:', joined.status, `+${hours}h`)

// 3) push de traços (m:1 fecha o traço) + finish
const strokes = []
for (let i = 0; i < 10; i += 1) strokes.push({ x: 0.1 + i * 0.05, y: 0.5 })
strokes.push({ x: -1, y: -1, m: 1 })
const pushed = await callOp('pushSignatureStrokes', { code: session.code, strokes })
console.log('push:', pushed.strokes.length, 'pontos')
const finished = await callOp('finishSignatureSession', { code: session.code })
console.log('finish:', finished.status)

// 4) confirm
const confirmed = await callOp('confirmSignatureSession', { code: session.code })
console.log('confirm:', confirmed.status)

// 5) rejoin recicla a sessão 24h (limpa traços, volta a linked)
const rejoined = await callOp('joinSignatureSession', { code: session.code })
console.log('rejoin:', rejoined.status, 'strokes:', rejoined.strokes.length)

// 6) tap (reset) bumpa linked_at e silent não bumpa
const tapped = await callOp('pushSignatureStrokes', { code: session.code, reset: true })
console.log('tap linkedAt:', tapped.linkedAt)
const silent = await callOp('pushSignatureStrokes', { code: session.code, reset: true, silent: true })
console.log('silent linkedAt igual:', silent.linkedAt === tapped.linkedAt)

// 7) open (PC manda celular abrir) e close (volta standby sem desvincular)
const opened = await callOp('openSignatureSession', { code: session.code, aspect: 2.2 })
console.log('open: openCount', opened.openCount, 'status', opened.status)
const reopened = await callOp('openSignatureSession', { code: session.code })
console.log('open de novo: openCount', reopened.openCount, '(deve ser +1)', 'openAt:', reopened.openAt ? 'ok' : 'ausente')

// 7b) notificação de assinatura disponível (criada pelo open) chega no poll
const poll1 = await callOp('pollNotifications', {})
const sigNotification = poll1.notifications.find((n) => n.kind === 'signature_available')
console.log('poll notific assinatura:', sigNotification ? `ok (${sigNotification.title})` : 'AUSENTE')

// 7c) preview PNG do celular: finish aceita data URL e get devolve
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
await callOp('pushSignatureStrokes', { code: session.code, strokes })
const finishedPreview = await callOp('finishSignatureSession', { code: session.code, previewDataUrl: tinyPng })
console.log('finish c/ preview:', finishedPreview.status, finishedPreview.previewDataUrl ? 'preview salvo' : 'PREVIEW AUSENTE')
const fetched = await callOp('getSignatureSession', { code: session.code })
console.log('get preview:', fetched.previewDataUrl === tinyPng ? 'ok (idêntico)' : 'DIFERENTE')
await callOp('confirmSignatureSession', { code: session.code })
console.log('confirm:', (await callOp('getSignatureSession', { code: session.code })).status)

const closed = await callOp('closeSignatureSession', { code: session.code })
console.log('close:', closed.status, 'strokes:', closed.strokes.length, '(deve seguir linked)')

// 8) board de vales agora deve trazer paymentSignature das linhas PAGO
const board = await callOp('listVouchers', {})
const paid = board.groups.flatMap((group) => group.rows).filter((row) => row.status === 'PAGO')
console.log(
  'board:',
  board.groups.flatMap((group) => group.rows).length,
  'linhas;',
  paid.length,
  'pagas;',
  paid.filter((row) => row.paymentSignature).length,
  'com assinatura persistida'
)

// 9) closeout do domingo (persistência da finalização)
const savedCloseout = await callOp('saveVoucherCloseout', {
  payments: paid.map((row) => ({
    collaboratorId: row.collaboratorId,
    name: row.name,
    lunchCents: row.lunchCents,
    transportCents: row.transportCents,
    totalCents: row.dayTotalCents,
    signature: row.paymentSignature
  }))
})
const rereadCloseout = await callOp('getVoucherCloseout', {})
console.log(
  'closeout:',
  rereadCloseout.paymentsCount,
  'pagos | refinalizar substitui:',
  rereadCloseout.paymentsCount === savedCloseout.paymentsCount
)

await callOp('cancelSignatureSession', { code: session.code })

// 10) detector de cartões CARD+ via poll (best-effort: depende de existir
// cartão novo no dia — só valida que a op não explode)
const pollCards = await callOp('pollNotifications', {})
console.log('poll cartões CARD+:', pollCards.notifications.filter((n) => n.kind === 'cardplus_card').length, 'evento(s)')
console.log('SMOKE OK')
