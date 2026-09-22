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
  throw new Error(`Variável ${name} ausente nos secrets da função flow-ops.`)
}

export function getCardplusClient(): SupabaseClient {
  if (cardplusClient) return cardplusClient
  cardplusClient = createClient(
    requiredEnv('CARDPLUS_SUPABASE_URL', ['SUPABASE_PUBLIC_URL', 'SUPABASE_URL']),
    requiredEnv('CARDPLUS_SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_ROLE_KEY']),
    clientOptions
  )
  return cardplusClient
}

export function getFlowAdminClient(): SupabaseClient {
  if (flowAdminClient) return flowAdminClient
  const url = requiredEnv('FLOW_SUPABASE_URL', ['SUPABASE_PUBLIC_URL', 'SUPABASE_URL'])
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
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
