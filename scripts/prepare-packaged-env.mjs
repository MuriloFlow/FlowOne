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
  'CARDPLUS_SUPABASE_SERVICE_ROLE_KEY',
  'OPENAI_API_KEY'
]

const optional = ['CARDPLUS_SUPABASE_ANON_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'OPENAI_FALLBACK', 'GITHUB_OWNER', 'GITHUB_REPO']
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
