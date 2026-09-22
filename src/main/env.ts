import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { app } from 'electron'

function applyEnvFile(file: string): void {
  const text = readFileSync(file, 'utf8')
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
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function packagedEnvFiles(): string[] {
  const files: string[] = []
  try {
    files.push(resolve(app.getPath('userData'), 'env.local'))
    files.push(resolve(app.getPath('userData'), '.env.local'))
  } catch {
    // app path is only available after ready
  }

  if (process.resourcesPath) {
    files.push(resolve(process.resourcesPath, 'env.local'))
    files.push(resolve(process.resourcesPath, '.env.local'))
  }

  files.push(resolve(process.cwd(), '.env.local'), resolve(process.cwd(), '.env'))

  if (app.isReady()) {
    files.push(resolve(app.getAppPath(), 'env.local'))
    files.push(resolve(app.getAppPath(), '.env.local'))
  }

  return files
}

const VPS_FLOW_URL = 'https://flowone.db.flwdesk.com'
const VPS_CARDPLUS_URL = 'https://cardplus.db.flwdesk.com'
const VPS_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwMDI5NjAwLCJleHAiOjE5NDc3MDk2MDB9.yPgutsfUlQPS6mjSegQU8MRTaPNK9cKqJiSopVh0GDA'
const VPS_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3OTAwMjk2MDAsImV4cCI6MTk0NzcwOTYwMH0.DiNtBP8vUMyrYwv2A_j0TYN8AwbpY3tlIEnVABNrRAw'

function isLegacySupabaseHost(url?: string) {
  if (!url) return true
  return url.includes('supabase.co') || url.includes('2.25.237.179')
}

function migrateVpsEnv(): void {
  if (isLegacySupabaseHost(process.env.VITE_SUPABASE_URL) || isLegacySupabaseHost(process.env.FLOW_SUPABASE_URL)) {
    process.env.VITE_SUPABASE_URL = VPS_FLOW_URL
    process.env.FLOW_SUPABASE_URL = VPS_FLOW_URL
    process.env.VITE_SUPABASE_ANON_KEY = VPS_ANON_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = VPS_SERVICE_ROLE_KEY
    process.env.VITE_FLOW_OPS_URL = `${VPS_FLOW_URL}/functions/v1/flow-ops`
  }
  if (isLegacySupabaseHost(process.env.CARDPLUS_SUPABASE_URL)) {
    process.env.CARDPLUS_SUPABASE_URL = VPS_CARDPLUS_URL
    process.env.CARDPLUS_SUPABASE_ANON_KEY = VPS_ANON_KEY
    process.env.CARDPLUS_SUPABASE_SERVICE_ROLE_KEY = VPS_SERVICE_ROLE_KEY
  }
}

export function loadLocalEnv(): void {
  for (const file of packagedEnvFiles()) {
    if (existsSync(file)) applyEnvFile(file)
  }
  migrateVpsEnv()
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Variável ${name} ausente no .env.local`)
  }
  return value
}
