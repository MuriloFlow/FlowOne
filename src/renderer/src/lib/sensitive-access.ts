import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Confirma a senha sem tocar na sessão que mantém o FLOW aberto. A sessão
 * temporária existe somente durante esta conferência e é descartada em seguida.
 */
export async function verifyCurrentPassword(password: string): Promise<void> {
  if (!password.trim()) throw new Error('Informe sua senha para continuar.')

  const { data: current, error: currentError } = await supabase.auth.getUser()
  const email = current.user?.email?.trim()
  if (currentError || !current.user?.id || !email) {
    throw new Error('Sua sessão expirou. Entre novamente no FLOW.')
  }

  const verifier = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  })
  try {
    const { data, error } = await verifier.auth.signInWithPassword({ email, password })
    if (error || data.user?.id !== current.user.id) {
      throw new Error('Senha incorreta. Não foi possível liberar este conteúdo.')
    }
  } finally {
    // Não encerra a sessão principal: esta é uma instância isolada, sem persistência.
    await verifier.auth.signOut({ scope: 'local' })
  }
}
