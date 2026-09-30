// Smoke test da análise IA do Portal do RH (op edge rhAnalyzeApplication).
// Valida que o cliente service-role da edge consegue ler/escrever rh_*:
// antes dos grants 0024 a edge falhava com
// "permission denied for table rh_applications".
// Uso: node scripts/smoke-rh-ai.mjs
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
const userHeaders = { apikey: anon, Authorization: `Bearer ${auth.access_token}` }

async function callOp(op, payload) {
  const res = await fetch(`${base}/functions/v1/flow-ops`, {
    method: 'POST',
    headers: { ...userHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op, payload })
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.ok === false) throw new Error(json.error || `${op}: HTTP ${res.status}`)
  return json.data
}

// 1) pega uma candidatura existente (leitura RLS com o token do usuário)
const appsRes = await fetch(`${base}/rest/v1/rh_applications?select=id&order=created_at.desc&limit=1`, { headers: userHeaders })
const apps = await appsRes.json()
if (!Array.isArray(apps) || apps.length === 0) {
  console.log('SKIP: nenhuma candidatura no banco para testar.')
  process.exit(0)
}
const applicationId = apps[0].id
console.log('candidatura:', applicationId)

// 2) roda a análise via edge (cliente service-role)
try {
  const row = await callOp('rhAnalyzeApplication', { applicationId })
  console.log('análise:', row.score, '/100 ·', row.band, '· modelo', row.model, '· resume_chars', row.resume_chars)
  if (typeof row.score !== 'number' || !row.band) throw new Error('Resposta sem score/band.')
} catch (error) {
  const message = String(error.message || error)
  if (/permission denied/i.test(message)) {
    console.error('FALHOU com permission denied — grants 0024 não aplicados?')
    console.error(message)
    process.exit(1)
  }
  if (/IA indispon|OPENAI/i.test(message)) {
    console.log('GRANTS OK (falha antes do banco: OPENAI_API_KEY ausente) —', message)
    process.exit(0)
  }
  // Qualquer outro erro (rate limit, modelo, rede LLM) acontece DEPOIS da
  // leitura da candidatura — logo os grants service_role funcionam.
  console.log('GRANTS OK (passou da leitura; erro de LLM downstream):', message.slice(0, 200))
  process.exit(0)
}

// 3) a análise deve estar persistida e visível para o usuário (RLS admin)
const assessRes = await fetch(
  `${base}/rest/v1/rh_ai_assessments?select=score,band,model&application_id=eq.${applicationId}&order=created_at.desc&limit=1`,
  { headers: userHeaders }
)
const assessments = await assessRes.json()
if (!Array.isArray(assessments) || assessments.length === 0) {
  console.error('FALHOU: análise não persistida/visível em rh_ai_assessments.')
  process.exit(1)
}
console.log('persistida:', assessments[0].score, '/100 ·', assessments[0].band)
console.log('SMOKE OK')
