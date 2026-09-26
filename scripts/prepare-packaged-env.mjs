import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envLocal = resolve(root, '.env.local')
const packagedEnv = resolve(root, 'build', 'env.local')

const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CARDPLUS_SUPABASE_URL',
  'CARDPLUS_SUPABASE_SERVICE_ROLE_KEY'
]

// OPENAI_API_KEY ficou opcional: sem ela o instalador sai igual e só a
// função Kobbi fica indisponível no desktop (erro claro em runtime).
const optional = ['OPENAI_API_KEY', 'CARDPLUS_SUPABASE_ANON_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_FALLBACK', 'GITHUB_OWNER', 'GITHUB_REPO']
const skipPack = new Set(['FLOW_BOOTSTRAP_EMAIL', 'FLOW_BOOTSTRAP_PASSWORD'])

function parseEnvText(text) {
  const values = new Map()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value) values.set(key, value)
  }
  return values
}

export function preparePackagedEnv() {
  const values = new Map()
  if (existsSync(envLocal)) {
    for (const [key, value] of parseEnvText(readFileSync(envLocal, 'utf8'))) {
      values.set(key, value)
    }
  }

  for (const key of [...required, ...optional]) {
    const fromEnv = process.env[key]?.trim()
    if (fromEnv) values.set(key, fromEnv)
  }

  const isLegacy = (url) => !url || url.includes('supabase.co') || url.includes('2.25.237.179')
  const vpsAnon =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwMDI5NjAwLCJleHAiOjE5NDc3MDk2MDB9.yPgutsfUlQPS6mjSegQU8MRTaPNK9cKqJiSopVh0GDA'
  const vpsService =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3OTAwMjk2MDAsImV4cCI6MTk0NzcwOTYwMH0.DiNtBP8vUMyrYwv2A_j0TYN8AwbpY3tlIEnVABNrRAw'
  if (isLegacy(values.get('VITE_SUPABASE_URL'))) {
    values.set('VITE_SUPABASE_URL', 'https://flowone.db.flwdesk.com')
    values.set('VITE_SUPABASE_ANON_KEY', vpsAnon)
    values.set('SUPABASE_SERVICE_ROLE_KEY', vpsService)
  }
  if (isLegacy(values.get('CARDPLUS_SUPABASE_URL'))) {
    values.set('CARDPLUS_SUPABASE_URL', 'https://cardplus.db.flwdesk.com')
    values.set('CARDPLUS_SUPABASE_ANON_KEY', vpsAnon)
    values.set('CARDPLUS_SUPABASE_SERVICE_ROLE_KEY', vpsService)
  }

  const missing = required.filter((key) => !values.get(key)?.trim())
  if (missing.length) {
    throw new Error(`Variáveis ausentes para o instalador: ${missing.join(', ')}`)
  }

  mkdirSync(resolve(root, 'build'), { recursive: true })
  const packed = [...values.entries()]
    .filter(([key, value]) => value && !skipPack.has(key))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  writeFileSync(packagedEnv, `${packed}\n`, 'utf8')
  return packagedEnv
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    preparePackagedEnv()
    console.log('Empacotando env de runtime em build/env.local')
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
