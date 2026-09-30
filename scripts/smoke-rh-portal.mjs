// Smoke E2E do PORTAL PÚBLICO do RH (mesmas chamadas que rh.flwdesk.com/digaspi faz):
//   1. anon lê vagas abertas + perguntas ativas (policies 0023)
//   2. anon sobe currículo no bucket rh-files/cvs
//   3. RPC rh_submit_application (atômica: candidato + candidatura + respostas + pontuação + arquivo)
//   4. admin (bootstrap) vê a candidatura na central com arquivo e respostas
//   5. limpeza completa dos dados de teste
// Uso: node scripts/smoke-rh-portal.mjs
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

function api(pathname, options = {}) {
  options.headers = Object.assign({ apikey: anon, 'Content-Type': 'application/json' }, options.headers || {})
  return fetch(base + pathname, options).then(async (res) => {
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`${pathname}: ${json?.message || json?.error_description || res.status}`)
    return json
  })
}

// PDF mínimo válido (%PDF-1.4 ...) — suficiente para o bucket aceitar o mime.
const MIN_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\ntrailer<</Size 4/Root 1 0 R>>\n%%EOF',
  'utf8'
)

const stamp = Date.now().toString(36).slice(-6)
const candidateEmail = `portal.smoke.${stamp}@flow.test`

// ---------- 1) anon: vagas + perguntas ----------
console.log('1) anon lê vagas abertas...')
const jobs = await api('/rest/v1/rh_jobs?select=id,title,slug,status&status=eq.open&order=created_at.desc')
console.log('   vagas abertas:', jobs.length)
if (jobs.length === 0) throw new Error('Nenhuma vaga aberta para testar — crie uma vaga no FLOW antes do smoke.')
const job = jobs[0]

console.log('2) anon lê perguntas ativas...')
const questions = await api('/rest/v1/rh_questions?select=*,rh_options(*)&active=eq.true&order=order_index.asc')
const relevant = questions.filter((question) => question.scope === 'GLOBAL' || question.job_id === job.id)
console.log('   perguntas relevantes:', relevant.length, '(globais + da vaga)')

// ---------- 2) anon: upload do currículo ----------
console.log('3) anon sobe currículo no bucket rh-files/cvs...')
const storagePath = `cvs/smoke-${stamp}/curriculo-smoke.pdf`
const upRes = await fetch(`${base}/storage/v1/object/rh-files/${storagePath}`, {
  method: 'POST',
  headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/pdf' },
  body: MIN_PDF
})
if (!upRes.ok) {
  const text = await upRes.text().catch(() => '')
  throw new Error(`upload anon falhou (${upRes.status}): ${text.slice(0, 160)}`)
}
console.log('   upload ok:', storagePath)

// ---------- 3) anon: candidatura atômica ----------
console.log('4) RPC rh_submit_application...')
const answers = {}
for (const question of relevant.slice(0, 3)) {
  if (question.type === 'SELECT' && question.rh_options?.length) answers[question.id] = question.rh_options[0].value
  else if (question.type === 'BOOLEAN') answers[question.id] = 'sim'
  else if (question.type === 'TEXTAREA' || question.type === 'TEXT') answers[question.id] = 'Resposta do smoke E2E do portal público.'
}
const submitted = await api('/rest/v1/rpc/rh_submit_application', {
  method: 'POST',
  headers: { Authorization: `Bearer ${anon}` },
  body: JSON.stringify({
    p_payload: {
      job_id: job.id,
      full_name: `Smoke Portal ${stamp}`,
      email: candidateEmail,
      phone: '(11) 90000-0000',
      city: 'Ribeirão Pires',
      state: 'SP',
      answers,
      file: {
        storage_path: storagePath,
        file_name: 'curriculo-smoke.pdf',
        mime_type: 'application/pdf',
        size_bytes: MIN_PDF.length
      }
    }
  })
})
if (!submitted?.application_id) throw new Error('RPC não retornou application_id: ' + JSON.stringify(submitted))
console.log('   candidatura:', submitted.application_id, '| score:', submitted.score, '| duplicada:', submitted.duplicate)

// ---------- 4) admin vê a candidatura ----------
console.log('5) admin (bootstrap) valida a candidatura na central...')
const authRes = await fetch(`${base}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.FLOW_BOOTSTRAP_EMAIL, password: env.FLOW_BOOTSTRAP_PASSWORD })
})
const adminAuth = await authRes.json()
if (!authRes.ok || !adminAuth.access_token) throw new Error('Login do bootstrap falhou')
const adminToken = adminAuth.access_token
const adminHeaders = { apikey: anon, Authorization: `Bearer ${adminToken}` }

const apps = await api(
  `/rest/v1/rh_applications?select=*,candidate:rh_candidates!inner(email),rh_files(*)&rh_candidates.email=eq.${candidateEmail}`,
  { headers: adminHeaders }
)
const found = apps.find((application) => application.id === submitted.application_id)
if (!found) throw new Error('Candidatura não visível para o admin (RLS?)')
console.log(
  '   admin vê:',
  found.candidate?.full_name,
  '| status:',
  found.status,
  '| arquivos:',
  found.rh_files?.length ?? 0
)

// move status (RPC admin com auditoria)
await api('/rest/v1/rpc/rh_move_application', {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ p_application_id: found.id, p_to_status: 'in_review', p_note: 'Smoke do portal' })
})
const moved = await api(`/rest/v1/rh_applications?select=status&id=eq.${found.id}`, { headers: adminHeaders })
console.log('   status movido para:', moved[0]?.status)

// ---------- 5) limpeza ----------
console.log('6) limpeza dos dados de teste...')
const detail = await api(`/rest/v1/rh_applications?select=*&id=eq.${found.id}`, { headers: adminHeaders })
const candidateId = detail[0]?.candidate_id
for (const table of ['rh_files', 'rh_status_history', 'rh_interviews', 'rh_internal_notes', 'rh_answers']) {
  await api(`/rest/v1/${table}?application_id=eq.${found.id}`, { method: 'DELETE', headers: adminHeaders }).catch(() => undefined)
}
if (candidateId) {
  await api(`/rest/v1/rh_candidates?id=eq.${candidateId}`, { method: 'DELETE', headers: adminHeaders }).catch(() => undefined)
}
await api(`/rest/v1/rh_applications?id=eq.${found.id}`, { method: 'DELETE', headers: adminHeaders }).catch(() => undefined)
await fetch(`${base}/storage/v1/object/rh-files/${storagePath}`, {
  method: 'DELETE',
  headers: { apikey: anon, Authorization: `Bearer ${adminToken}` }
}).catch(() => undefined)
console.log('   candidatura + candidato + arquivo removidos')

console.log('SMOKE PORTAL OK')
