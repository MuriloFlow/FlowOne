// Cliente Supabase do portal — só a chave anônima (pública por design).
// A RLS limita: anon lê vagas abertas, perguntas ativas e cria candidatura via RPC.
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})
