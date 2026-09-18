import log from './log.ts'
import {
  VOUCHER_GROUP_LABEL,
  VOUCHER_GROUPS,
  voucherGroupFor,
  type VoucherBoard,
  type VoucherRow,
  type VoucherStatus
} from './_shared/vouchers.ts'
import { voucherPeriodKey } from './_shared/vouchers.ts'
import { getFlowAdminClient } from './supabase-clients.ts'
import { listEmployees } from './cardplus.ts'

type VoucherDbRow = {
  cardplus_collaborator_id: string
  lunch_cents: number
  transport_cents: number
  status: string
  period_key: string
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_employee_vouchers/i.test(error.message ?? '')
  )
}

function asStatus(value: string): VoucherStatus {
  return value === 'PAGO' ? 'PAGO' : 'PENDENTE'
}

export async function resetExpiredVouchers(): Promise<void> {
  const periodKey = voucherPeriodKey()
  const { error } = await getFlowAdminClient()
    .from('flow_employee_vouchers')
    .update({
      status: 'PENDENTE',
      paid_at: null,
      period_key: periodKey,
      updated_at: new Date().toISOString()
    })
    .eq('status', 'PAGO')
    .neq('period_key', periodKey)

  if (error && !isMissingTable(error)) {
    log.warn('[vouchers] reset semanal', error.message)
  }
}

export async function listVoucherBoard(storeId?: string | null): Promise<VoucherBoard> {
  await resetExpiredVouchers()
  const periodKey = voucherPeriodKey()
  const employees = (await listEmployees(storeId)).filter(
    (employee) => employee.isActive && employee.name.trim().toUpperCase() !== 'CAIXA'
  )

  const { data, error } = await getFlowAdminClient()
    .from('flow_employee_vouchers')
    .select('cardplus_collaborator_id, lunch_cents, transport_cents, status, period_key')

  if (error && !isMissingTable(error)) {
    throw new Error(`Erro ao carregar vales: ${error.message}`)
  }

  const byId = new Map(((data ?? []) as VoucherDbRow[]).map((row) => [row.cardplus_collaborator_id, row]))
  const rows: VoucherRow[] = employees.map((employee) => {
    const voucher = byId.get(employee.id)
    const lunchCents = voucher?.lunch_cents ?? 0
    const transportCents = voucher?.transport_cents ?? 0
    return {
      collaboratorId: employee.id,
      name: employee.name,
      storeId: employee.storeId,
      storeName: employee.storeName,
      cpfMasked: employee.cpfMasked,
      group: voucherGroupFor(employee.flowRole, employee.cardplusRole),
      roleLabel: employee.flowRoleLabel,
      lunchCents,
      transportCents,
      dayTotalCents: lunchCents + transportCents,
      status: asStatus(voucher?.status ?? 'PENDENTE')
    }
  })

  const groups = VOUCHER_GROUPS.map((id) => ({
    id,
    label: VOUCHER_GROUP_LABEL[id],
    rows: rows
      .filter((row) => row.group === id)
      .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
  })).filter((group) => group.rows.length > 0)

  return {
    periodKey,
    lunchTotalCents: rows.reduce((total, row) => total + row.lunchCents, 0),
    transportTotalCents: rows.reduce((total, row) => total + row.transportCents, 0),
    grandTotalCents: rows.reduce((total, row) => total + row.dayTotalCents, 0),
    groups
  }
}

export async function upsertVoucher(
  collaboratorId: string,
  patch: { lunchCents?: number; transportCents?: number; status?: VoucherStatus }
): Promise<void> {
  const periodKey = voucherPeriodKey()
  const current = await getFlowAdminClient()
    .from('flow_employee_vouchers')
    .select('lunch_cents, transport_cents, status')
    .eq('cardplus_collaborator_id', collaboratorId)
    .maybeSingle()

  if (current.error && !isMissingTable(current.error)) {
    throw new Error(`Erro ao carregar vale: ${current.error.message}`)
  }
  if (current.error && isMissingTable(current.error)) {
    throw new Error('Rode o SQL 0005_flow_vouchers_and_auxiliar.sql no Supabase do FLOW para usar vales.')
  }

  const lunchCents = patch.lunchCents ?? current.data?.lunch_cents ?? 0
  const transportCents = patch.transportCents ?? current.data?.transport_cents ?? 0
  if (lunchCents < 0 || transportCents < 0 || lunchCents > 99_999_99 || transportCents > 99_999_99) {
    throw new Error('Valor de vale inválido.')
  }

  const status = patch.status ?? asStatus(current.data?.status ?? 'PENDENTE')
  const { error } = await getFlowAdminClient().from('flow_employee_vouchers').upsert(
    {
      cardplus_collaborator_id: collaboratorId,
      lunch_cents: lunchCents,
      transport_cents: transportCents,
      status,
      period_key: periodKey,
      paid_at: status === 'PAGO' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'cardplus_collaborator_id' }
  )

  if (error) {
    if (isMissingTable(error)) {
      throw new Error('Rode o SQL 0005_flow_vouchers_and_auxiliar.sql no Supabase do FLOW para usar vales.')
    }
    throw new Error(`Erro ao salvar vale: ${error.message}`)
  }
}

export async function deleteVoucher(collaboratorId: string): Promise<void> {
  const { error } = await getFlowAdminClient()
    .from('flow_employee_vouchers')
    .delete()
    .eq('cardplus_collaborator_id', collaboratorId)
  if (error && !isMissingTable(error)) {
    log.warn('[vouchers] delete', error.message)
  }
}
