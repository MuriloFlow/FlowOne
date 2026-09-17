import { canViewAllStores, normalizeRole, type FlowRoleId } from '../shared/roles'
import { normalizeStoreId } from '../shared/store-scope'
import { memo } from './memo'
import { readAuthSession } from './session-store'
import { getFlowAdminClient } from './supabase-clients'

export type ActorScope = {
  userId: string
  role: FlowRoleId
  canViewAll: boolean
  boundStoreId: string | null
}

export async function resolveActor(): Promise<ActorScope> {
  const session = await readAuthSession()
  if (!session) throw new Error('Sessão inválida.')

  return memo(`actor:${session.sessionId}`, 15_000, async () => {
    const flow = getFlowAdminClient()
    const { data: sessionRow, error: sessionError } = await flow
      .from('flow_sessions')
      .select('user_id')
      .eq('session_id', session.sessionId)
      .is('revoked_at', null)
      .maybeSingle()

    if (sessionError || !sessionRow?.user_id) {
      throw new Error('Sessão inválida.')
    }

    const { data: profile, error: profileError } = await flow
      .from('flow_profiles')
      .select('role, cardplus_store_id')
      .eq('user_id', sessionRow.user_id)
      .maybeSingle()

    if (profileError && /cardplus_store_id/i.test(profileError.message)) {
      const fallback = await flow
        .from('flow_profiles')
        .select('role')
        .eq('user_id', sessionRow.user_id)
        .maybeSingle()
      const role = normalizeRole(fallback.data?.role)
      return {
        userId: sessionRow.user_id,
        role,
        canViewAll: canViewAllStores(role),
        boundStoreId: null
      }
    }

    if (profileError) {
      throw new Error(`Erro ao validar permissão: ${profileError.message}`)
    }

    const role = normalizeRole(profile?.role)
    return {
      userId: sessionRow.user_id,
      role,
      canViewAll: canViewAllStores(role),
      boundStoreId: typeof profile?.cardplus_store_id === 'string' ? profile.cardplus_store_id : null
    }
  })
}

export function resolveStoreFilter(actor: ActorScope, requested: unknown): string | null {
  const requestedId = normalizeStoreId(requested)
  if (actor.canViewAll) return requestedId
  if (actor.boundStoreId) return actor.boundStoreId
  throw new Error(
    'Sua conta ainda não tem uma unidade. Peça para um Lider de Operação, Supervisor ou Diretor te vincular em Usuários.'
  )
}
