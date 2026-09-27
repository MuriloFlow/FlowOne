// Testa a persistência real: paga um vale com assinatura, confere no board e reverte.
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
const authRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.FLOW_BOOTSTRAP_EMAIL, password: env.FLOW_BOOTSTRAP_PASSWORD })
})
const auth = await authRes.json()
if (!auth.access_token) throw new Error('login falhou')

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

const signature =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const board = await callOp('listVouchers', {})
const rows = board.groups.flatMap((group) => group.rows)
const target = rows.find((row) => row.status === 'PENDENTE' && row.cpf)
if (!target) throw new Error('nenhum pendente com CPF para testar')
console.log('teste em:', target.name, target.status)

// 1) paga com assinatura (igual faz o celular / desktop)
await callOp('updateVoucher', { collaboratorId: target.collaboratorId, status: 'PAGO', signature })

// 2) relê o board (igual o polling do desktop)
const after = await callOp('listVouchers', {})
const paid = after.groups
  .flatMap((group) => group.rows)
  .find((row) => row.collaboratorId === target.collaboratorId)
console.log('após pagar:', paid.status, '| assinatura persistida:', Boolean(paid.paymentSignature))

// 3) também sem mexer no status (patch de valor) não pode apagar a assinatura
await callOp('updateVoucher', { collaboratorId: target.collaboratorId, lunchCents: paid.lunchCents })
const kept = await callOp('listVouchers', {})
const keptRow = kept.groups
  .flatMap((group) => group.rows)
  .find((row) => row.collaboratorId === target.collaboratorId)
console.log('patch de valor mantém assinatura:', Boolean(keptRow.paymentSignature))

// 4) volta ao estado original
await callOp('updateVoucher', { collaboratorId: target.collaboratorId, status: 'PENDENTE' })
const reverted = await callOp('listVouchers', {})
const finalRow = reverted.groups
  .flatMap((group) => group.rows)
  .find((row) => row.collaboratorId === target.collaboratorId)
console.log('revertido:', finalRow.status, '| assinatura limpa:', finalRow.paymentSignature === null)
console.log(finalRow.status === 'PENDENTE' && finalRow.paymentSignature === null ? 'PERSIST OK' : 'FALHOU')
