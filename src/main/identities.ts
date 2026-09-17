import log from 'electron-log'
import { isValidCpf, maskCpf, onlyCpfDigits } from '../shared/cpf'
import { isFlowRole, normalizePersonName, type FlowRoleId } from '../shared/roles'
import { compactScheduleKey, scheduleActorMatchScore } from '../shared/schedules'
import { getFlowAdminClient } from './supabase-clients'

type IdentityRow = {
  cardplus_collaborator_id: string
  cpf_digits: string | null
  flow_role: string | null
}

export type IdentityRecord = {
  collaboratorId: string
  cpfDigits: string | null
  flowRole: FlowRoleId | null
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_employee_identities/i.test(error.message ?? '')
  )
}

function toRecord(row: IdentityRow): IdentityRecord {
  return {
    collaboratorId: row.cardplus_collaborator_id,
    cpfDigits: row.cpf_digits,
    flowRole: row.flow_role && isFlowRole(row.flow_role) ? row.flow_role : null
  }
}

export async function listIdentities(): Promise<Map<string, IdentityRecord>> {
  const rows: IdentityRow[] = []
  const pageSize = 1000
  for (let from = 0; from < 80_000; from += pageSize) {
    const { data, error } = await getFlowAdminClient()
      .from('flow_employee_identities')
      .select('cardplus_collaborator_id, cpf_digits, flow_role')
      .range(from, from + pageSize - 1)

    if (error) {
      if (isMissingTable(error)) {
        log.warn('[identities] tabela flow_employee_identities ainda não existe')
        return new Map()
      }
      throw new Error(`Erro ao carregar CPF dos funcionários: ${error.message}`)
    }
    const page = (data ?? []) as IdentityRow[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return new Map(rows.map((row) => [row.cardplus_collaborator_id, toRecord(row)]))
}

export async function getIdentity(collaboratorId: string): Promise<IdentityRecord | null> {
  const { data, error } = await getFlowAdminClient()
    .from('flow_employee_identities')
    .select('cardplus_collaborator_id, cpf_digits, flow_role')
    .eq('cardplus_collaborator_id', collaboratorId)
    .maybeSingle()

  if (error) {
    if (isMissingTable(error)) return null
    throw new Error(`Erro ao carregar identidade: ${error.message}`)
  }

  return data ? toRecord(data as IdentityRow) : null
}

export function parseIdentityInput(cpf: string, flowRole: string): { digits: string | null; flowRole: FlowRoleId } {
  if (!isFlowRole(flowRole)) {
    throw new Error('Cargo FLOW inválido.')
  }

  const digits = onlyCpfDigits(cpf)
  if (digits.length > 0 && !isValidCpf(digits)) {
    throw new Error('CPF inválido.')
  }

  return {
    digits: digits.length === 11 ? digits : null,
    flowRole
  }
}

export async function upsertIdentity(
  collaboratorId: string,
  cpf: string,
  flowRole: string
): Promise<IdentityRecord | null> {
  const parsed = parseIdentityInput(cpf, flowRole)

  const payload = {
    cardplus_collaborator_id: collaboratorId,
    cpf_digits: parsed.digits,
    flow_role: parsed.flowRole,
    updated_at: new Date().toISOString()
  }

  const { data, error } = await getFlowAdminClient()
    .from('flow_employee_identities')
    .upsert(payload, { onConflict: 'cardplus_collaborator_id' })
    .select('cardplus_collaborator_id, cpf_digits, flow_role')
    .single()

  if (error) {
    if (isMissingTable(error)) {
      log.warn('[identities] tabela flow_employee_identities ainda não existe')
      return null
    }
    if (error.code === '23505') {
      throw new Error('Este CPF já está cadastrado para outro funcionário.')
    }
    if (error.code === '23514' && /flow_role|role_check/i.test(error.message)) {
      throw new Error('Rode o SQL 0005_flow_vouchers_and_auxiliar.sql no Supabase do FLOW para liberar o cargo Auxiliar.')
    }
    throw new Error(`Erro ao salvar CPF: ${error.message}`)
  }

  try {
    await getFlowAdminClient().from('flow_audit_logs').insert({
      action: 'employee.identity.upsert',
      entity_type: 'flow_employee_identities',
      entity_id: collaboratorId,
      metadata: {
        has_cpf: Boolean(payload.cpf_digits),
        flow_role: flowRole
      }
    })
  } catch (auditError) {
    log.warn('[identities] auditoria não registrada', auditError)
  }

  return toRecord(data as IdentityRow)
}

export async function deleteIdentity(collaboratorId: string): Promise<void> {
  const { error } = await getFlowAdminClient()
    .from('flow_employee_identities')
    .delete()
    .eq('cardplus_collaborator_id', collaboratorId)
  if (error && !isMissingTable(error)) {
    log.warn('[identities] delete', error.message)
  }
}

export async function syncProfileRoleIfSamePerson(
  userId: string,
  employeeName: string,
  flowRole: string,
  options?: { isGlobalDesk?: boolean; email?: string }
): Promise<boolean> {
  if (!isFlowRole(flowRole)) return false
  const { data, error } = await getFlowAdminClient()
    .from('flow_profiles')
    .select('display_name, email, role')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) {
    if (error) log.warn('[identities] sync profile', error.message)
    return false
  }
  const row = data as { display_name?: string | null; email?: string | null; role?: string | null }
  let email = (options?.email || row.email || '').trim().toLowerCase()
  if (!email) {
    try {
      const authUser = await getFlowAdminClient().auth.admin.getUserById(userId)
      email = authUser.data.user?.email?.trim().toLowerCase() ?? ''
    } catch (authError) {
      log.warn('[identities] email do login', authError)
    }
  }
  const displayName = row.display_name ?? ''
  const score = Math.max(
    scheduleActorMatchScore(displayName, email, employeeName),
    scheduleActorMatchScore(employeeName, email, displayName)
  )
  const exact = normalizePersonName(displayName) === normalizePersonName(employeeName)
  const compact = compactScheduleKey(employeeName)
  const allowed =
    exact ||
    (options?.isGlobalDesk && score >= 20) ||
    (compact.length >= 8 && score >= 40)
  if (!allowed) return false

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (row.role !== flowRole) patch.role = flowRole
  if (employeeName.trim().length > displayName.trim().length) patch.display_name = employeeName.trim()
  if (email && email !== (row.email ?? '').trim().toLowerCase()) patch.email = email
  if (Object.keys(patch).length === 1) return true

  const { error: updateError } = await getFlowAdminClient()
    .from('flow_profiles')
    .update(patch)
    .eq('user_id', userId)
  if (updateError) {
    log.warn('[identities] sync profile role', updateError.message)
    return false
  }
  return true
}

export function identityMask(record: IdentityRecord | null | undefined): string | null {
  return maskCpf(record?.cpfDigits)
}
