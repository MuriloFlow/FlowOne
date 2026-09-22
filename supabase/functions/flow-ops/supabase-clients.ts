import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false }
} as const

let cardplusClient: SupabaseClient | null = null
let flowAdminClient: SupabaseClient | null = null

type EdgeRuntime = {
  Deno?: { env?: { get?: (name: string) => string | undefined } }
}

function envValue(name: string): string | undefined {
  return (globalThis as typeof globalThis & EdgeRuntime).Deno?.env?.get?.(name)?.trim() || undefined
}

function optionalEnv(name: string, aliases: string[] = []): string | undefined {
  for (const key of [name, ...aliases]) {
    const value = envValue(key)
    if (value) return value
  }
  return undefined
}

function requiredEnv(name: string, aliases: string[] = []): string {
  const value = optionalEnv(name, aliases)
  if (value) return value
  throw new Error(`Missing required flow-ops secret: ${name}`)
}

export function getCardplusClient(): SupabaseClient {
  if (cardplusClient) return cardplusClient
  // For the multi-tenant VPS setup, CardPlus is on a different database instance accessed via cardplus.db.flwdesk.com
  const url = optionalEnv('CARDPLUS_SUPABASE_URL', ['CARDPLUS_SUPABASE_PUBLIC_URL']) || 'https://cardplus.db.flwdesk.com'
  const key = requiredEnv('CARDPLUS_SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_ROLE_KEY'])
  
  if (!key) throw new Error(`Variável CARDPLUS_SUPABASE_SERVICE_ROLE_KEY ausente nos secrets.`)
  
  cardplusClient = createClient(url, key, {
    ...clientOptions,
    global: {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key
      }
    }
  })
  return cardplusClient
}

export function getFlowAdminClient(): SupabaseClient {
  if (flowAdminClient) return flowAdminClient
  // Bypass internal api-gw (which points to empty postgres DB) and use public URL (which Caddy routes to flowone DB)
  const url = requiredEnv('FLOW_SUPABASE_URL', ['SUPABASE_PUBLIC_URL', 'SUPABASE_URL'])
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!url || !key) throw new Error(`Variáveis de conexão do Flow ausentes.`)

  flowAdminClient = createClient(url, key, {
    ...clientOptions,
    global: {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key
      }
    }
  })
  return flowAdminClient
}

export function flowPublicUrl(): string {
  return requiredEnv('FLOW_SUPABASE_URL', ['SUPABASE_PUBLIC_URL', 'SUPABASE_URL'])
}

export function flowAnonKey(): string | null {
  return envValue('SUPABASE_ANON_KEY') || envValue('FLOW_SUPABASE_ANON_KEY') || null
}


