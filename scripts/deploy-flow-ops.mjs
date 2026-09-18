import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const projectRef = 'sirupkygppdladkpzytc'
const envPath = resolve(root, '.env.local')

function parseEnv(file) {
  const map = {}
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const cut = line.indexOf('=')
    if (cut <= 0) continue
    map[line.slice(0, cut).trim()] = line.slice(cut + 1).trim()
  }
  return map
}

function required(env, key) {
  const value = env[key]?.trim()
  if (!value) throw new Error(`Falta ${key} em .env.local`)
  return value
}

function run(args, extraEnv = {}) {
  const result = spawnSync('npx', ['--yes', 'supabase@2.117.0', ...args], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...extraEnv }
  })
  if (result.status !== 0) {
    throw new Error(`supabase ${args.join(' ')} failed (${result.status})`)
  }
}

const env = parseEnv(envPath)
const secrets = {
  FLOW_SUPABASE_URL: required(env, 'VITE_SUPABASE_URL'),
  SUPABASE_ANON_KEY: required(env, 'VITE_SUPABASE_ANON_KEY'),
  FLOW_SUPABASE_ANON_KEY: required(env, 'VITE_SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: required(env, 'SUPABASE_SERVICE_ROLE_KEY'),
  CARDPLUS_SUPABASE_URL: required(env, 'CARDPLUS_SUPABASE_URL'),
  CARDPLUS_SUPABASE_SERVICE_ROLE_KEY: required(env, 'CARDPLUS_SUPABASE_SERVICE_ROLE_KEY'),
  OPENAI_API_KEY: required(env, 'OPENAI_API_KEY'),
  OPENAI_BASE_URL: env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
  OPENAI_MODEL: env.OPENAI_MODEL?.trim() || 'gpt-4o',
  OPENAI_FALLBACK: env.OPENAI_FALLBACK?.trim() || 'gpt-4o-mini'
}

const sql = readFileSync(resolve(root, 'supabase/migrations/0015_flow_attendance_photos.sql'), 'utf8')
const queryUrl = `${secrets.FLOW_SUPABASE_URL.replace(/\/$/, '')}/pg/query`
try {
  const queryRes = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      apikey: secrets.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${secrets.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  })
  console.log('SQL 0015 via /pg/query:', queryRes.status)
} catch (error) {
  console.log('SQL 0015 via /pg/query skipped:', error instanceof Error ? error.message : error)
}

const dir = mkdtempSync(join(tmpdir(), 'flow-ops-secrets-'))
const file = join(dir, '.env')
writeFileSync(
  file,
  Object.entries(secrets)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n'
)

try {
  console.log('Setting function secrets (values not printed)')
  run(['secrets', 'set', '--project-ref', projectRef, '--env-file', file])
  console.log('Deploying flow-ops')
  run(['functions', 'deploy', 'flow-ops', '--project-ref', projectRef, '--no-verify-jwt'])
  console.log('FLOW ops published')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const opsUrl = `${secrets.FLOW_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/flow-ops`
const authRes = await fetch(`${secrets.FLOW_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: {
    apikey: secrets.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: required(env, 'FLOW_BOOTSTRAP_EMAIL'),
    password: required(env, 'FLOW_BOOTSTRAP_PASSWORD')
  })
})
const authJson = await authRes.json()
if (!authRes.ok || !authJson.access_token) {
  throw new Error(`Login FLOW falhou (${authRes.status}).`)
}

async function callOp(op, payload) {
  const res = await fetch(opsUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authJson.access_token}`,
      apikey: secrets.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ op, payload })
  })
  const json = await res.json()
  if (!json.ok) throw new Error(`${op}: ${json.error || res.status}`)
  return json.data
}

const stores = await callOp('listStores')
const overview = await callOp('getOverview', { storeId: null })
const attendance = await callOp('getAttendanceBoard', { storeId: null, monthKey: null })
const schedule = await callOp('getScheduleBoard', { storeId: Array.isArray(stores) && stores[0]?.id ? stores[0].id : null })
console.log(
  JSON.stringify(
    {
      stores: Array.isArray(stores) ? stores.length : 0,
      funcionarios: overview?.employeeCount ?? null,
      atestadosTableMissing: attendance?.tableMissing ?? false,
      escalaDias: schedule?.days?.length ?? 0
    },
    null,
    2
  )
)
