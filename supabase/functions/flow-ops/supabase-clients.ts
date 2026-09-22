import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false }
} as const

let cardplusClient: SupabaseClient | null = null
let flowAdminClient: SupabaseClient | null = null

function requiredEnv(name: string, aliases: string[] = []): string {
  const keys = [name, ...aliases]
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim()
    if (value) return value
  }
  return ''
}

export function getCardplusClient(): SupabaseClient {
  if (cardplusClient) return cardplusClient
  // For the multi-tenant VPS setup, CardPlus is on a different database instance accessed via cardplus.db.flwdesk.com
  const url = requiredEnv('CARDPLUS_SUPABASE_URL') || 'https://cardplus.db.flwdesk.com'
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
  return Deno.env.get('SUPABASE_ANON_KEY')?.trim() || Deno.env.get('FLOW_SUPABASE_ANON_KEY')?.trim() || null
}


