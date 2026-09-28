import log from './log.ts'
import { getFlowAdminClient } from './supabase-clients.ts'
import { resolveActor } from './scope.ts'

// Política de versão mínima + telemetria da frota. O cliente (desktop ou
// mobile) consulta `getReleasePolicy` no boot e depois de atualizar: se a
// versão dele for menor que min_version, recebe block=true e se atualiza
// antes de continuar. Ninguém precisa instalar nada manualmente.

export type ReleasePolicyView = {
  platform: string
  minVersion: string
  message: string | null
  block: boolean
}

function compareVersions(left: string, right: string): number {
  const a = left.replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
  const b = right.replace(/^v/i, '').split('.').map((part) => Number(part) || 0)
  const size = Math.max(a.length, b.length)
  for (let index = 0; index < size; index += 1) {
    if ((a[index] ?? 0) > (b[index] ?? 0)) return 1
    if ((a[index] ?? 0) < (b[index] ?? 0)) return -1
  }
  return 0
}

async function loadPolicy(platform: string): Promise<{ min_version: string; message: string | null } | null> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_release_policy')
    .select('min_version, message')
    .eq('platform', platform)
    .maybeSingle()
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null
    log.warn('[release-policy] load', error.message)
    return null
  }
  return (data as { min_version: string; message: string | null } | null) ?? null
}

/** Público para autenticados: versão mínima vigente da plataforma do cliente. */
export async function getReleasePolicy(payload: unknown): Promise<ReleasePolicyView> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const platform = String(body.platform ?? 'DESKTOP').toUpperCase() === 'MOBILE' ? 'MOBILE' : 'DESKTOP'
  const appVersion = String(body.appVersion ?? '').trim()
  const policy = await loadPolicy(platform)
  const minVersion = policy?.min_version ?? '0.0.0'
  const outdated = Boolean(appVersion) && compareVersions(minVersion, appVersion) > 0
  return {
    platform,
    minVersion,
    message: outdated ? policy?.message ?? null : null,
    block: outdated
  }
}

/** Ping de telemetria: dispositivo reporta a versão que está rodando. */
export async function reportAppVersion(payload: unknown): Promise<{ recorded: boolean }> {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const platform = String(body.platform ?? 'DESKTOP').toUpperCase() === 'MOBILE' ? 'MOBILE' : 'DESKTOP'
  const appVersion = String(body.appVersion ?? '').trim().slice(0, 32)
  if (!appVersion) return { recorded: false }
  const actor = await resolveActor()
  const { error } = await getFlowAdminClient().from('flow_device_pings').insert({
    platform,
    app_version: appVersion,
    device_label: typeof body.deviceLabel === 'string' ? body.deviceLabel.slice(0, 80) : null,
    user_email: actor.email,
    session_id: typeof body.sessionId === 'string' ? body.sessionId.slice(0, 80) : null
  })
  if (error) {
    log.warn('[release-policy] ping', error.message)
    return { recorded: false }
  }
  return { recorded: true }
}

/** Painel: últimas versões reportadas por dispositivo (para conferir a frota). */
export async function listDeviceVersions(): Promise<
  Array<{ platform: string; appVersion: string; deviceLabel: string | null; userEmail: string | null; lastSeen: string }>
> {
  const actor = await resolveActor()
  if (!['LIDER_OPERACAO', 'SUPERVISOR', 'DIRETOR', 'GERENTE_GERAL'].includes(actor.role)) {
    throw new Error('Sem permissão para ver a frota.')
  }
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await getFlowAdminClient()
    .from('flow_device_pings')
    .select('platform, app_version, device_label, user_email, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return []
    throw new Error(`Erro ao carregar versões da frota: ${error.message}`)
  }
  const latest = new Map<string, { platform: string; appVersion: string; deviceLabel: string | null; userEmail: string | null; lastSeen: string }>()
  for (const row of (data ?? []) as Array<{
    platform: string
    app_version: string
    device_label: string | null
    user_email: string | null
    created_at: string
  }>) {
    const key = `${row.platform}:${row.user_email ?? ''}:${row.device_label ?? ''}`
    if (!latest.has(key)) {
      latest.set(key, {
        platform: row.platform,
        appVersion: row.app_version,
        deviceLabel: row.device_label,
        userEmail: row.user_email,
        lastSeen: row.created_at
      })
    }
  }
  return [...latest.values()]
}
