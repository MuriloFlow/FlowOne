import log from 'electron-log'
import { isValidCpf, maskCpf, onlyCpfDigits } from '../shared/cpf'
import { isFlowRole, type FlowRoleId } from '../shared/roles'
import { addDaysToDate, nextSundayOf } from '../shared/schedules'
import { dateKeyInSaoPaulo } from './dates'
import { getFlowAdminClient } from './supabase-clients'

type IdentityRow = {
  cardplus_collaborator_id: string
  cpf_digits: string | null
  flow_role: string | null
  sunday_cycle?: string | null
  sunday_cycle_start?: string | null
}

export type IdentityRecord = {
  collaboratorId: string
  cpfDigits: string | null
  flowRole: FlowRoleId | null
  sundayCycle: 'A' | 'B' | 'C' | null
  sundayCycleStart: string | null
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_employee_identities/i.test(error.message ?? '')
  )
}

const SUNDAY_CYCLES: ReadonlySet<string> = new Set(['A', 'B', 'C'])

function toRecord(row: IdentityRow): IdentityRecord {
  const cycle =
    typeof row.sunday_cycle === 'string' && SUNDAY_CYCLES.has(row.sunday_cycle.toUpperCase())
      ? (row.sunday_cycle.toUpperCase() as 'A' | 'B' | 'C')
      : null
  const start = typeof row.sunday_cycle_start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.sunday_cycle_start)
    ? row.sunday_cycle_start
    : null
  return {
    collaboratorId: row.cardplus_collaborator_id,
    cpfDigits: row.cpf_digits,
    flowRole: row.flow_role && isFlowRole(row.flow_role) ? row.flow_role : null,
    sundayCycle: cycle,
    sundayCycleStart: cycle ? start : null
  }
}

export async function listIdentities(): Promise<Map<string, IdentityRecord>> {
  const rows: IdentityRow[] = []
  const pageSize = 1000
  for (let from = 0; from < 80_000; from += pageSize) {
    const { data, error } = await getFlowAdminClient()
      .from('flow_employee_identities')
      .select('cardplus_collaborator_id, cpf_digits, flow_role, sunday_cycle, sunday_cycle_start')
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
    .select('cardplus_collaborator_id, cpf_digits, flow_role, sunday_cycle, sunday_cycle_start')
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
    .select('cardplus_collaborator_id, cpf_digits, flow_role, sunday_cycle, sunday_cycle_start')
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

export function identityMask(record: IdentityRecord | null | undefined): string | null {
  return maskCpf(record?.cpfDigits)
}

// Posição no ciclo 2x1 dos domingos. O gerente escolhe "1° Domingo"
// (trabalha este domingo, folga no próximo) ou "2° Domingo" (trabalha este e
// o próximo, folga depois); o sistema deduz o grupo A/B/C e a data de início
// do ciclo a partir daí e a rotação roda sozinha nas escalas de domingo.
export async function setSundayCycle(input: {
  collaboratorId: string
  cycle: 'A' | 'B' | 'C' | null
  cycleStart?: string | null
}): Promise<void> {
  const today = dateKeyInSaoPaulo()
  const requested = typeof input.cycleStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.cycleStart)
    ? input.cycleStart
    : null
  const cycleStart =
    input.cycle === null
      ? null
      : requested ?? nextSundayOf(addDaysToDate(today, 7))

  const existing = await getIdentity(input.collaboratorId)
  const payload = {
    cardplus_collaborator_id: input.collaboratorId,
    cpf_digits: existing?.cpfDigits ?? null,
    flow_role: existing?.flowRole ?? 'OPERADOR',
    sunday_cycle: input.cycle,
    sunday_cycle_start: cycleStart,
    updated_at: new Date().toISOString()
  }

  const { error } = await getFlowAdminClient()
    .from('flow_employee_identities')
    .upsert(payload, { onConflict: 'cardplus_collaborator_id' })
  if (error) {
    if (isMissingTable(error)) {
      throw new Error('Rode o SQL 0020_flow_sunday_rotation.sql no Supabase do FLOW para ligar a rotação de domingos.')
    }
    throw new Error(`Erro ao salvar o ciclo de domingo: ${error.message}`)
  }

  try {
    await getFlowAdminClient().from('flow_audit_logs').insert({
      action: 'employee.sunday-cycle.set',
      entity_type: 'flow_employee_identities',
      entity_id: input.collaboratorId,
      metadata: { sunday_cycle: input.cycle, sunday_cycle_start: cycleStart }
    })
  } catch (auditError) {
    log.warn('[identities] auditoria não registrada', auditError)
  }
}
