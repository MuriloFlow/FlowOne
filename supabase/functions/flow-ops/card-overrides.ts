import log from './log.ts'
import { dateKeyInSaoPaulo, monthKeyFromDateKey } from './dates.ts'
import { getFlowAdminClient } from './supabase-clients.ts'
import type { OverviewMetrics } from './_shared/operations.ts'

export type CardTotalOverride = {
  storeId: string
  monthKey: string
  total: number
  note: string | null
  updatedBy: string | null
}

type OverrideRow = {
  cardplus_store_id: string
  month_key: string
  total: number | string
  note: string | null
  updated_by: string | null
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /flow_card_total_overrides/i.test(error.message ?? '')
  )
}

export function missingCardOverrideSql(): Error {
  return new Error('Rode o SQL 0014_flow_card_total_override.sql no Supabase do FLOW para ajustar o total do mês.')
}

function asMonthKey(value: string | null | undefined): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value
  return monthKeyFromDateKey(dateKeyInSaoPaulo())
}

function asTotal(value: unknown): number {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Informe o total correto (número inteiro, zero ou mais).')
  return Math.min(999999, Math.round(amount))
}

function asNote(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const note = String(value).trim()
  if (!note) return null
  if (note.length > 280) throw new Error('A observação pode ter no máximo 280 caracteres.')
  return note
}

function toOverride(row: OverrideRow): CardTotalOverride {
  return {
    storeId: row.cardplus_store_id,
    monthKey: row.month_key,
    total: asTotal(row.total),
    note: row.note,
    updatedBy: row.updated_by
  }
}

export async function getCardTotalOverride(
  storeId: string | null | undefined,
  monthKeyInput?: string | null
): Promise<CardTotalOverride | null> {
  if (!storeId) return null
  const monthKey = asMonthKey(monthKeyInput)
  const { data, error } = await getFlowAdminClient()
    .from('flow_card_total_overrides')
    .select('cardplus_store_id, month_key, total, note, updated_by')
    .eq('cardplus_store_id', storeId)
    .eq('month_key', monthKey)
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) return null
    throw new Error(`Erro ao carregar o total ajustado: ${error.message}`)
  }
  return data ? toOverride(data as OverrideRow) : null
}

export async function listCardTotalOverrides(
  monthKeyInput?: string | null
): Promise<Map<string, number>> {
  const monthKey = asMonthKey(monthKeyInput)
  const map = new Map<string, number>()
  const { data, error } = await getFlowAdminClient()
    .from('flow_card_total_overrides')
    .select('cardplus_store_id, total')
    .eq('month_key', monthKey)
  if (error) {
    if (isMissingTable(error)) return map
    throw new Error(`Erro ao carregar totais ajustados: ${error.message}`)
  }
  for (const row of (data ?? []) as Array<{ cardplus_store_id: string; total: number | string }>) {
    map.set(row.cardplus_store_id, asTotal(row.total))
  }
  return map
}

export async function upsertCardTotalOverride(input: {
  storeId: string
  monthKey: string
  total: number
  note?: string | null
  actorUserId: string
}): Promise<CardTotalOverride> {
  if (!input.storeId) throw new Error('Escolha uma unidade para ajustar o total.')
  const monthKey = asMonthKey(input.monthKey)
  const total = asTotal(input.total)
  const note = asNote(input.note)
  const now = new Date().toISOString()
  const { data, error } = await getFlowAdminClient()
    .from('flow_card_total_overrides')
    .upsert(
      {
        cardplus_store_id: input.storeId,
        month_key: monthKey,
        total,
        note,
        updated_by: input.actorUserId,
        updated_at: now
      },
      { onConflict: 'cardplus_store_id,month_key' }
    )
    .select('cardplus_store_id, month_key, total, note, updated_by')
    .maybeSingle()
  if (error) {
    if (isMissingTable(error)) throw missingCardOverrideSql()
    throw new Error(`Erro ao salvar o total ajustado: ${error.message}`)
  }
  if (!data) throw new Error('Não foi possível salvar o total ajustado.')
  try {
    await getFlowAdminClient().from('flow_audit_logs').insert({
      action: 'cards.month_total.upsert',
      entity_type: 'flow_card_total_overrides',
      entity_id: input.storeId,
      metadata: { month_key: monthKey, total, note }
    })
  } catch (auditError) {
    log.warn('[cards] auditoria do total ajustado não registrada', auditError)
  }
  return toOverride(data as OverrideRow)
}

export async function deleteCardTotalOverride(storeId: string, monthKeyInput: string): Promise<void> {
  if (!storeId) throw new Error('Escolha uma unidade para remover o ajuste.')
  const monthKey = asMonthKey(monthKeyInput)
  const { error } = await getFlowAdminClient()
    .from('flow_card_total_overrides')
    .delete()
    .eq('cardplus_store_id', storeId)
    .eq('month_key', monthKey)
  if (error) {
    if (isMissingTable(error)) throw missingCardOverrideSql()
    throw new Error(`Erro ao remover o ajuste: ${error.message}`)
  }
  try {
    await getFlowAdminClient().from('flow_audit_logs').insert({
      action: 'cards.month_total.delete',
      entity_type: 'flow_card_total_overrides',
      entity_id: storeId,
      metadata: { month_key: monthKey }
    })
  } catch (auditError) {
    log.warn('[cards] auditoria da remoção do ajuste não registrada', auditError)
  }
}

export function overlayMonthTotal(registered: number, override: number | null | undefined): number {
  if (override === null || override === undefined) return registered
  return override
}

export function overlayMonthGoalGap(
  displayed: number,
  monthGoal: number | null,
  remainingDays: number
): { remainingToMonthGoal: number | null; pacePerDay: number | null } {
  const remainingToMonthGoal = monthGoal === null ? null : Math.max(monthGoal - displayed, 0)
  const pacePerDay =
    remainingToMonthGoal === null || remainingDays === 0
      ? null
      : Math.round(remainingToMonthGoal / remainingDays)
  return { remainingToMonthGoal, pacePerDay }
}

export async function applyOverviewCardOverlay(
  overview: OverviewMetrics,
  storeId: string | null | undefined
): Promise<OverviewMetrics> {
  if (!storeId) {
    return {
      ...overview,
      cardsThisMonthRegistered: overview.cardsThisMonthRegistered ?? overview.cardsThisMonth,
      cardTotalOverride: overview.cardTotalOverride ?? null
    }
  }
  const override = await getCardTotalOverride(storeId)
  const registered = overview.cardsThisMonthRegistered ?? overview.cardsThisMonth
  const displayed = overlayMonthTotal(registered, override?.total)
  const gap = overlayMonthGoalGap(displayed, overview.monthGoal, overview.workingDaysRemaining)
  return {
    ...overview,
    cardsThisMonth: displayed,
    cardsThisMonthRegistered: registered,
    cardTotalOverride: override?.total ?? null,
    remainingToMonthGoal: gap.remainingToMonthGoal,
    pacePerDay: gap.pacePerDay
  }
}
