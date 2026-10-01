// Área do Candidato — sessão persistente do candidato no portal.
// O signup usa a RPC rh_candidate_signup (security definer): cria o usuário de
// auth e VINCULA todas as candidaturas do e-mail ao login.
import { supabase } from './supabase'

export type CandidateSession = {
  userId: string
  email: string
  fullName: string | null
}

export async function getSession(): Promise<CandidateSession | null> {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session?.user) return null
  return {
    userId: session.user.id,
    email: session.user.email ?? '',
    fullName:
      (session.user.user_metadata as { full_name?: string } | null)?.full_name ?? null
  }
}

export async function signupCandidate(input: {
  email: string
  password: string
  fullName: string
  phone?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc('rh_candidate_signup', {
    p_email: input.email.trim().toLowerCase(),
    p_password: input.password,
    p_full_name: input.fullName.trim(),
    p_phone: input.phone ?? null
  })
  if (error) return { ok: false, error: friendly(error.message) }
  // Após criar o usuário no banco, faz login normal para abrir a sessão.
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: input.email.trim().toLowerCase(),
    password: input.password
  })
  if (loginError) return { ok: false, error: friendly(loginError.message) }
  return { ok: true }
}

export async function loginCandidate(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password
  })
  if (error) return { ok: false, error: friendly(error.message) }
  return { ok: true }
}

export async function logoutCandidate(): Promise<void> {
  await supabase.auth.signOut()
}

function friendly(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials'))
    return 'E-mail ou senha incorretos. Confira e tente de novo.'
  if (m.includes('at least 6 characters') || m.includes('senha precisa'))
    return 'A senha precisa ter pelo menos 6 caracteres.'
  if (m.includes('e-mail inválido')) return 'Digite um e-mail válido.'
  if (m.includes('failed to fetch'))
    return 'Não foi possível conectar. Verifique sua internet.'
  return message
}
