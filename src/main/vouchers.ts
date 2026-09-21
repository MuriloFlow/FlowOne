import log from 'electron-log'
import {
  VOUCHER_GROUP_LABEL,
  VOUCHER_GROUPS,
  voucherGroupFor,
  isVoucherSignatureDataUrl,
  type VoucherBoard,
  type VoucherRow,
  type VoucherStatus
} from '../shared/vouchers'
import { voucherPeriodKey, sundaysInMonth, formatSundayLabel, type VoucherHistoryBoard } from '../shared/vouchers'
import { getFlowAdminClient } from './supabase-clients'
import { listEmployees } from './cardplus'
import { listIdentities } from './identities'
import { listEmployeeDocuments } from './employee-documents'

type VoucherDbRow = {
  cardplus_collaborator_id: string
  lunch_cents: number
  transport_cents: number
  status: string
  period_key: string
  payment_signature: string | null
  paid_at: string | null
  receipt_number: string | null
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

function isMissingHistory(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_voucher_payment_history/i.test(error.message ?? '')
  )
}

type PaidSnapshot = {
  cardplus_collaborator_id: string
  lunch_cents: number
  transport_cents: number
  period_key: string
  paid_at: string | null
  receipt_number: string | null
}

async function archivePayments(rows: PaidSnapshot[]): Promise<void> {
  if (!rows.length) return
  const employees = await listEmployees(null)
  const byId = new Map(employees.map((employee) => [employee.id, employee]))
  const { error } = await getFlowAdminClient().from('flow_voucher_payment_history').upsert(
    rows.map((row) => {
      const employee = byId.get(row.cardplus_collaborator_id)
      return {
        cardplus_collaborator_id: row.cardplus_collaborator_id,
        period_key: row.period_key,
        cardplus_store_id: employee?.storeId ?? null,
        name: employee?.name ?? 'Funcionário',
        store_name: employee?.storeName ?? '',
        role_label: employee?.flowRoleLabel ?? '',
        lunch_cents: row.lunch_cents,
        transport_cents: row.transport_cents,
        paid_at: row.paid_at,
        receipt_number: row.receipt_number
      }
    }),
    { onConflict: 'cardplus_collaborator_id,period_key' }
  )
  if (error && !isMissingHistory(error)) {
    throw new Error(`Erro ao guardar histórico do vale: ${error.message}`)
  }
  if (error && isMissingHistory(error)) {
    log.warn('[vouchers] histórico ausente — rode 0018_flow_voucher_payment_history.sql')
  }
}

async function rememberPayment(input: {
  collaboratorId: string
  periodKey: string
  lunchCents: number
  transportCents: number
  paidAt: string | null
  receiptNumber: string | null
}): Promise<void> {
  await archivePayments([
    {
      cardplus_collaborator_id: input.collaboratorId,
      period_key: input.periodKey,
      lunch_cents: input.lunchCents,
      transport_cents: input.transportCents,
      paid_at: input.paidAt,
      receipt_number: input.receiptNumber
    }
  ])
}

async function forgetPayment(collaboratorId: string, periodKey: string): Promise<void> {
  const { error } = await getFlowAdminClient()
    .from('flow_voucher_payment_history')
    .delete()
    .eq('cardplus_collaborator_id', collaboratorId)
    .eq('period_key', periodKey)
  if (error && !isMissingHistory(error)) {
    log.warn('[vouchers] histórico delete', error.message)
  }
}

export async function resetExpiredVouchers(): Promise<void> {
  const periodKey = voucherPeriodKey()
  const admin = getFlowAdminClient()
  const expired = await admin
    .from('flow_employee_vouchers')
    .select('cardplus_collaborator_id, lunch_cents, transport_cents, period_key, paid_at, receipt_number')
    .eq('status', 'PAGO')
    .neq('period_key', periodKey)

  if (expired.error && !isMissingTable(expired.error)) {
    log.warn('[vouchers] reset semanal', expired.error.message)
    return
  }
  if (expired.error) return

  try {
    await archivePayments((expired.data ?? []) as PaidSnapshot[])
  } catch (error) {
    log.warn('[vouchers] arquivar antes do reset', error instanceof Error ? error.message : error)
  }

  const { error } = await admin
    .from('flow_employee_vouchers')
    .update({
      status: 'PENDENTE',
      paid_at: null,
      payment_signature: null,
      payment_signed_at: null,
      receipt_number: null,
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

  const [{ data, error }, identities, documents] = await Promise.all([
    getFlowAdminClient()
    .from('flow_employee_vouchers')
    .select('cardplus_collaborator_id, lunch_cents, transport_cents, status, period_key, paid_at, receipt_number'),
    listIdentities(),
    listEmployeeDocuments()
  ])

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
      cpf: identities.get(employee.id)?.cpfDigits ?? null,
      rgImage: documents.get(employee.id)?.rgImage ?? null,
      group: voucherGroupFor(employee.flowRole, employee.cardplusRole),
      roleLabel: employee.flowRoleLabel,
      lunchCents,
      transportCents,
      dayTotalCents: lunchCents + transportCents,
      status: asStatus(voucher?.status ?? 'PENDENTE'),
      paymentSignature: null,
      paidAt: voucher?.paid_at ?? null,
      receiptNumber: voucher?.receipt_number ?? null
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
  patch: { lunchCents?: number; transportCents?: number; status?: VoucherStatus; signature?: string }
): Promise<void> {
  const periodKey = voucherPeriodKey()
  const current = await getFlowAdminClient()
    .from('flow_employee_vouchers')
    .select('lunch_cents, transport_cents, status, receipt_number, paid_at')
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
  const signature = patch.signature?.trim() || null
  const receiptNumber = status === 'PAGO'
    ? current.data?.receipt_number ?? `${periodKey.replaceAll('-', '')}-${collaboratorId.slice(0, 8).toUpperCase()}`
    : null
  if (patch.status === 'PAGO' && !isVoucherSignatureDataUrl(signature ?? '')) {
    throw new Error('A assinatura do recebimento é obrigatória para finalizar o pagamento.')
  }
  const paidAt =
    status !== 'PAGO'
      ? null
      : patch.status === 'PAGO'
        ? new Date().toISOString()
        : current.data?.paid_at ?? new Date().toISOString()
  const { error } = await getFlowAdminClient().from('flow_employee_vouchers').upsert(
    {
      cardplus_collaborator_id: collaboratorId,
      lunch_cents: lunchCents,
      transport_cents: transportCents,
      status,
      period_key: periodKey,
      paid_at: paidAt,
      payment_signature: null,
      payment_signed_at: null,
      receipt_number: receiptNumber,
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

  if (status === 'PAGO') {
    await rememberPayment({
      collaboratorId,
      periodKey,
      lunchCents,
      transportCents,
      paidAt,
      receiptNumber
    })
  } else if (patch.status === 'PENDENTE') {
    await forgetPayment(collaboratorId, periodKey)
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

type HistoryDbRow = {
  cardplus_collaborator_id: string
  period_key: string
  cardplus_store_id: string | null
  name: string
  store_name: string
  role_label: string
  lunch_cents: number
  transport_cents: number
  paid_at: string | null
  receipt_number: string | null
}

export async function listVoucherHistory(
  monthKey: string,
  storeId?: string | null
): Promise<VoucherHistoryBoard> {
  await resetExpiredVouchers()
  const periodKey = voucherPeriodKey()
  const currentPaid = await getFlowAdminClient()
    .from('flow_employee_vouchers')
    .select('cardplus_collaborator_id, lunch_cents, transport_cents, period_key, paid_at, receipt_number')
    .eq('status', 'PAGO')
    .eq('period_key', periodKey)
  if (!currentPaid.error) {
    try {
      await archivePayments((currentPaid.data ?? []) as PaidSnapshot[])
    } catch (error) {
      log.warn('[vouchers] arquivar semana atual', error instanceof Error ? error.message : error)
    }
  }

  const sundays = sundaysInMonth(monthKey)
  if (!sundays.length) throw new Error('Mês inválido.')

  let query = getFlowAdminClient()
    .from('flow_voucher_payment_history')
    .select(
      'cardplus_collaborator_id, period_key, cardplus_store_id, name, store_name, role_label, lunch_cents, transport_cents, paid_at, receipt_number'
    )
    .in('period_key', sundays)
    .order('name', { ascending: true })
  if (storeId) query = query.eq('cardplus_store_id', storeId)

  const { data, error } = await query
  if (error) {
    if (isMissingHistory(error)) {
      throw new Error('Rode o SQL 0018_flow_voucher_payment_history.sql no Supabase do FLOW para ver o histórico.')
    }
    throw new Error(`Erro ao carregar histórico de vales: ${error.message}`)
  }

  const rows = (data ?? []) as HistoryDbRow[]
  return {
    monthKey,
    sundays: sundays.map((periodKey) => {
      const payments = rows
        .filter((row) => row.period_key === periodKey)
        .map((row) => ({
          collaboratorId: row.cardplus_collaborator_id,
          name: row.name,
          storeName: row.store_name,
          roleLabel: row.role_label,
          lunchCents: row.lunch_cents,
          transportCents: row.transport_cents,
          totalCents: row.lunch_cents + row.transport_cents,
          paidAt: row.paid_at,
          receiptNumber: row.receipt_number
        }))
      return {
        periodKey,
        label: formatSundayLabel(periodKey),
        totalCents: payments.reduce((total, payment) => total + payment.totalCents, 0),
        payments
      }
    })
  }
}
