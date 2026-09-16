import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requiredEnv } from './env'

let cardplusClient: SupabaseClient | null = null
let flowAdminClient: SupabaseClient | null = null

export function getCardplusClient(): SupabaseClient {
  if (cardplusClient) return cardplusClient
  cardplusClient = createClient(
    requiredEnv('CARDPLUS_SUPABASE_URL'),
    requiredEnv('CARDPLUS_SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false }
    }
  )
  return cardplusClient
}

export function getFlowAdminClient(): SupabaseClient {
  if (flowAdminClient) return flowAdminClient
  const url = process.env.VITE_SUPABASE_URL?.trim() || process.env.FLOW_SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) {
    throw new Error('Banco FLOW ausente no .env.local')
  }
  flowAdminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  return flowAdminClient
}
