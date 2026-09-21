import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Banknote, Bus, CheckCircle2, FileDown, History, Utensils } from 'lucide-react'
import { AnimatedMoney } from '@/components/animated-number'
import { MoneyCell } from '@/components/money-cell'
import { MonthSwitcher } from '@/components/month-switcher'
import { initials } from '@/lib/identity'
import { currentDateKey, currentMonthKey, formatBRLFromCents, formatDateTime, weekdayLong } from '@/lib/format'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { operationError, operations } from '@/lib/operations'
import { cn } from '@/lib/utils'
import { PaymentSignatureDialog } from '@/components/payment-signature-dialog'
import { PasswordConfirmationDialog } from '@/components/password-confirmation-dialog'
import { exportVoucherReceipts } from '@/lib/voucher-receipt-export'
import {
  formatVoucherWeekLabel,
  msUntilNextVoucherReset,
  type VoucherBoard,
  type VoucherHistoryBoard,
  type VoucherRow,
  type VoucherStatus
} from '../../../shared/vouchers'

type VouchersPageProps = {
  storeId?: string | null
}

export function VouchersPage({ storeId = null }: VouchersPageProps) {
  const [board, setBoard] = useState<VoucherBoard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [signingRow, setSigningRow] = useState<VoucherRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const [confirmingExport, setConfirmingExport] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [monthKey, setMonthKey] = useState(currentMonthKey)
  const [history, setHistory] = useState<VoucherHistoryBoard | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const [signatureCache, setSignatureCache] = useState<Record<string, string>>({})
  const mobile = isMobileShell()

  function rememberSignature(collaboratorId: string, signature: string): void {
    setSignatureCache((current) => ({ ...current, [collaboratorId]: signature }))
  }

  function forgetSignature(collaboratorId: string): void {
    setSignatureCache((current) => {
      if (!current[collaboratorId]) return current
      const next = { ...current }
      delete next[collaboratorId]
      return next
    })
  }

  function rowsWithSignatures(rows: VoucherRow[]): VoucherRow[] {
    return rows.map((row) => ({
      ...row,
      paymentSignature: signatureCache[row.collaboratorId] ?? null
    }))
  }

  async function load(): Promise<VoucherBoard> {
    const next = await operations().listVouchers(storeId)
    setBoard(next)
    setError(null)
    return next
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    void load()
      .catch((loadError: unknown) => {
        if (active) setError(operationError(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [storeId])

  useEffect(() => {
    if (!historyOpen) return
    let active = true
    setHistoryLoading(true)
    void operations()
      .listVoucherHistory(monthKey, storeId)
      .then((next) => {
        if (!active) return
        setHistory(next)
        setError(null)
        const today = currentDateKey()
        const current = next.sundays.filter((sunday) => sunday.periodKey <= today)
        const preferred = [...current].reverse().find((sunday) => sunday.payments.length > 0) ?? current.at(-1) ?? next.sundays[0]
        setSelectedPeriod((currentPeriod) =>
          currentPeriod && next.sundays.some((sunday) => sunday.periodKey === currentPeriod)
            ? currentPeriod
            : preferred?.periodKey ?? null
        )
      })
      .catch((loadError: unknown) => {
        if (active) setError(operationError(loadError))
      })
      .finally(() => {
        if (active) setHistoryLoading(false)
      })
    return () => {
      active = false
    }
  }, [historyOpen, monthKey, storeId])

  useEffect(() => {
    setSignatureCache({})
  }, [board?.periodKey])

  useEffect(() => {
    let timer = 0
    const arm = () => {
      timer = window.setTimeout(() => {
        setSignatureCache({})
        void load().catch((loadError: unknown) => setError(operationError(loadError)))
        arm()
      }, msUntilNextVoucherReset())
    }
    arm()
    return () => window.clearTimeout(timer)
  }, [storeId])

  function applyLocal(
    row: VoucherRow,
    next: { lunchCents?: number; transportCents?: number; status?: VoucherStatus; signature?: string }
  ): void {
    setBoard((current) => {
      if (!current) return current
      const groups = current.groups.map((group) => ({
        ...group,
        rows: group.rows.map((item) => {
          if (item.collaboratorId !== row.collaboratorId) return item
          const lunchCents = next.lunchCents ?? item.lunchCents
          const transportCents = next.transportCents ?? item.transportCents
          return {
            ...item,
            lunchCents,
            transportCents,
            dayTotalCents: lunchCents + transportCents,
            status: next.status ?? item.status,
            paymentSignature: null,
            paidAt: next.status === 'PAGO' ? new Date().toISOString() : next.status === 'PENDENTE' ? null : item.paidAt
          }
        })
      }))
      const rows = groups.flatMap((group) => group.rows)
      return {
        ...current,
        groups,
        lunchTotalCents: rows.reduce((total, item) => total + item.lunchCents, 0),
        transportTotalCents: rows.reduce((total, item) => total + item.transportCents, 0),
        grandTotalCents: rows.reduce((total, item) => total + item.dayTotalCents, 0)
      }
    })
  }

  async function patch(
    row: VoucherRow,
    next: { lunchCents?: number; transportCents?: number; status?: VoucherStatus; signature?: string }
  ): Promise<void> {
    const previousBoard = board
    const previousCache = signatureCache
    if (next.status === 'PENDENTE') forgetSignature(row.collaboratorId)
    else if (next.signature) rememberSignature(row.collaboratorId, next.signature)
    applyLocal(row, next)
    setBusyId(row.collaboratorId)
    try {
      await operations().updateVoucher({
        collaboratorId: row.collaboratorId,
        ...next
      })
      setError(null)
    } catch (patchError) {
      setBoard(previousBoard)
      setSignatureCache(previousCache)
      setError(operationError(patchError))
      throw patchError
    } finally {
      setBusyId(null)
    }
  }

  function beginPayment(row: VoucherRow): void {
    if (!row.cpf || !row.rgImage) {
      setError(`${row.name} precisa ter CPF e a foto do RG anexada antes de registrar o pagamento.`)
      return
    }
    setSigningRow(row)
  }

  async function confirmPayment(signature: string): Promise<void> {
    if (!signingRow) return
    const row = signingRow
    try {
      await patch(row, { status: 'PAGO', signature })
      setSigningRow(null)
    } catch {
      // O erro já aparece no quadro e a assinatura continua aberta para nova tentativa.
    }
  }

  async function finalizePayments(): Promise<void> {
    if (!board) return
    setExporting(true)
    try {
      await exportVoucherReceipts(rowsWithSignatures(board.groups.flatMap((group) => group.rows)))
      setError(null)
    } catch (exportError) {
      const message = operationError(exportError)
      // Fechar a folha de compartilhar no celular não é falha — o PDF já foi gerado.
      if (/share canceled|sharing canceled|cancelad/i.test(message)) {
        setError(null)
        return
      }
      setError(message)
      throw exportError
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col">
        <div className="mb-6 h-8 w-56 animate-pulse rounded-full bg-white/5" />
        <div
          data-mobile-stack={mobile ? '' : undefined}
          className={mobile ? 'flex flex-col gap-3' : 'grid grid-cols-3 gap-3'}
        >
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-[132px] animate-pulse rounded-[16px] bg-white/4" />
        </div>
        <div className="mt-4 min-h-[280px] animate-pulse rounded-[16px] bg-white/4" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
        <h1 className="text-[22px] text-[#F0EFEC]/88">Vales e pagamentos</h1>
        <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
          {storeId
            ? mobile
              ? 'Vales da unidade selecionada.'
              : 'Vales somente da unidade selecionada.'
            : 'Vale-almoço e vale-transporte por funcionário.'}{' '}
          {mobile
            ? 'Pago volta a pendente no sábado, 00:00.'
            : 'Status pago volta para pendente todo sábado à 00:00.'}
          {board ? (
            <span className="text-[#F0EFEC]/28"> Semana {formatVoucherWeekLabel(board.periodKey)}.</span>
          ) : null}
        </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((open) => !open)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-[9px] border px-3 text-[12px] font-medium transition-colors',
              historyOpen
                ? 'border-[#F0EFEC]/20 bg-[#F0EFEC]/10 text-[#F0EFEC]'
                : 'border-white/[0.08] bg-white/[0.03] text-[#F0EFEC]/70 hover:text-[#F0EFEC]'
            )}
          >
            <History className="size-3.5" /> Histórico
          </button>
          <button
            type="button"
            disabled={
              exporting ||
              !board?.groups.some(
                (group) =>
                  group.rows.some((row) => row.status === 'PAGO' && Boolean(signatureCache[row.collaboratorId]))
              )
            }
            onClick={() => setConfirmingExport(true)}
            className="inline-flex h-9 items-center gap-2 rounded-[9px] bg-[#F0EFEC] px-3 text-[12px] font-medium text-[#111] transition-opacity disabled:opacity-35"
          >
            <FileDown className="size-3.5" /> {exporting ? 'Gerando...' : mobile ? 'Finalizar' : 'Finalizar pagamento'}
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
          {error}
        </div>
      ) : null}

      {historyOpen ? (
        <VoucherHistory
          mobile={mobile}
          monthKey={monthKey}
          loading={historyLoading}
          history={history}
          selectedPeriod={selectedPeriod}
          showStore={!storeId}
          onMonthKey={(next) => {
            setSelectedPeriod(null)
            setMonthKey(next)
          }}
          onSelect={setSelectedPeriod}
        />
      ) : null}

      {!historyOpen ? (
      <>
      <div
        data-mobile-stack={mobile ? '' : undefined}
        className={mobile ? 'flex flex-col gap-3' : 'grid grid-cols-3 gap-3'}
      >
        <MoneyCard
          compact={mobile}
          label={mobile ? 'Vale-almoço' : 'Total vale-almoço'}
          cents={board?.lunchTotalCents ?? 0}
          hint={mobile ? 'Soma da equipe visível' : 'Soma de todos os funcionários visíveis'}
          icon={<Utensils className="size-4" strokeWidth={1.7} />}
        />
        <MoneyCard
          compact={mobile}
          label={mobile ? 'Vale-transporte' : 'Total vale-transporte'}
          cents={board?.transportTotalCents ?? 0}
          hint={mobile ? 'Soma da equipe visível' : 'Soma de todos os funcionários visíveis'}
          icon={<Bus className="size-4" strokeWidth={1.7} />}
        />
        <MoneyCard
          compact={mobile}
          label="Total geral"
          cents={board?.grandTotalCents ?? 0}
          hint="Almoço + transporte"
          icon={<Banknote className="size-4" strokeWidth={1.7} />}
        />
      </div>

      {!board || board.groups.length === 0 ? (
        <div className="mt-16 flex flex-1 flex-col items-center justify-center text-center">
          <h2 className="text-[16px] text-[#F0EFEC]/78">Nenhum funcionário nesta unidade</h2>
          <p className="mt-2 max-w-sm text-[13px] text-[#F0EFEC]/38">
            Os vales acompanham o cadastro do Card+. Cadastre o funcionário para lançar os valores.
          </p>
        </div>
      ) : (
        <div className={cn('mt-4 space-y-3', mobile ? 'mb-16' : 'mb-[4.5rem]')}>
          {board.groups.map((group) => (
            <section key={group.id} className="overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
              <div className={cn('flex items-center justify-between', mobile ? 'px-4 py-3' : 'px-5 py-3')}>
                <h2 className="text-[13px] tracking-wide text-[#F0EFEC]/45 uppercase">{group.label}</h2>
                <span className="text-[12px] text-[#F0EFEC]/28">
                  {group.rows.length} {group.rows.length === 1 ? 'funcionário' : 'funcionários'}
                </span>
              </div>
              {mobile ? (
                <div>
                  {group.rows.map((row) => (
                    <div key={row.collaboratorId} className="border-t border-white/[0.03] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[12px] text-[#F0EFEC]/55">
                          {initials(row.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] text-[#F0EFEC]/85">{row.name}</p>
                          <p className="mt-0.5 truncate text-[12px] text-[#F0EFEC]/38">
                            {storeId ? row.roleLabel : `${row.roleLabel} · ${row.storeName}`}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busyId === row.collaboratorId}
                          onClick={() => row.status === 'PAGO' ? void patch(row, { status: 'PENDENTE' }) : beginPayment(row)}
                          className={cn(
                            'inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[12px] transition-colors disabled:opacity-50',
                            row.status === 'PAGO'
                              ? 'bg-[#34D399]/12 text-[#34D399]'
                              : 'bg-[#F0EFEC]/6 text-[#F0EFEC]/50'
                          )}
                        >
                          {row.status === 'PAGO' ? <><CheckCircle2 className="mr-1 size-3" />Pago</> : 'Pendente'}
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="min-w-0 rounded-[10px] border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                          <p className="text-[11px] text-[#F0EFEC]/38">Almoço</p>
                          <div className="mt-1">
                            <MoneyCell
                              cents={row.lunchCents}
                              onSave={(lunchCents) => patch(row, { lunchCents })}
                            />
                          </div>
                        </div>
                        <div className="min-w-0 rounded-[10px] border border-white/[0.04] bg-white/[0.02] px-3 py-2">
                          <p className="text-[11px] text-[#F0EFEC]/38">Transporte</p>
                          <div className="mt-1">
                            <MoneyCell
                              cents={row.transportCents}
                              onSave={(transportCents) => patch(row, { transportCents })}
                            />
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 text-[12px] text-[#F0EFEC]/40">
                        Total {formatBRLFromCents(row.dayTotalCents)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                    <tr className="border-y border-white/[0.04]">
                      <th className="px-5 py-2.5 font-medium">Funcionário</th>
                      <th className="px-3 py-2.5 font-medium">CPF</th>
                      <th className="px-3 py-2.5 font-medium">Vale-almoço</th>
                      <th className="px-3 py-2.5 font-medium">Vale-transporte</th>
                      <th className="px-3 py-2.5 font-medium">Total do dia</th>
                      <th className="px-5 py-2.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr
                        key={row.collaboratorId}
                        className="border-t border-white/[0.03] text-[13px] transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[11px] text-[#F0EFEC]/55">
                              {initials(row.name)}
                            </span>
                            <span>
                              <span className="block text-[#F0EFEC]/82">{row.name}</span>
                              <span className="mt-0.5 block text-[11px] text-[#F0EFEC]/32">
                                {storeId ? row.roleLabel : `${row.roleLabel} · ${row.storeName}`}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-[#F0EFEC]/55">
                          {row.cpfMasked ?? <span className="text-[#F0EFEC]/28">Não cadastrado</span>}
                        </td>
                        <td className="px-3 py-3">
                          <MoneyCell
                            cents={row.lunchCents}
                            onSave={(lunchCents) => patch(row, { lunchCents })}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <MoneyCell
                            cents={row.transportCents}
                            onSave={(transportCents) => patch(row, { transportCents })}
                          />
                        </td>
                        <td className="px-3 py-3 text-[#F0EFEC]/78">{formatBRLFromCents(row.dayTotalCents)}</td>
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            disabled={busyId === row.collaboratorId}
                            onClick={() => row.status === 'PAGO' ? void patch(row, { status: 'PENDENTE' }) : beginPayment(row)}
                            className={cn(
                              'inline-flex h-7 items-center rounded-full px-2.5 text-[12px] transition-colors disabled:opacity-50',
                              row.status === 'PAGO'
                                ? 'bg-[#34D399]/12 text-[#34D399]'
                                : 'bg-[#F0EFEC]/6 text-[#F0EFEC]/50 hover:bg-[#F0EFEC]/10'
                            )}
                          >
                            {row.status === 'PAGO' ? 'Pago assinado' : 'Assinar e pagar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      </>
      ) : null}
      <PaymentSignatureDialog
        open={Boolean(signingRow)}
        employeeName={signingRow?.name ?? ''}
        amountLabel={formatBRLFromCents(signingRow?.dayTotalCents ?? 0)}
        saving={busyId === signingRow?.collaboratorId}
        onClose={() => { if (busyId !== signingRow?.collaboratorId) setSigningRow(null) }}
        onConfirm={confirmPayment}
      />
      <PasswordConfirmationDialog
        open={confirmingExport}
        title="Finalizar pagamento"
        description="Confirme sua senha para gerar o PDF com os recibos assinados e os documentos dos funcionários."
        confirmLabel="Gerar PDF seguro"
        onClose={() => { if (!exporting) setConfirmingExport(false) }}
        onConfirmed={async () => {
          await finalizePayments()
          setConfirmingExport(false)
        }}
      />
    </div>
  )
}

function VoucherHistory({
  mobile,
  monthKey,
  loading,
  history,
  selectedPeriod,
  showStore,
  onMonthKey,
  onSelect
}: {
  mobile: boolean
  monthKey: string
  loading: boolean
  history: VoucherHistoryBoard | null
  selectedPeriod: string | null
  showStore: boolean
  onMonthKey: (monthKey: string) => void
  onSelect: (periodKey: string) => void
}) {
  const today = currentDateKey()
  const selected = history?.sundays.find((sunday) => sunday.periodKey === selectedPeriod) ?? null

  return (
    <div className={cn(mobile ? 'mb-16' : 'mb-[4.5rem]')}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-[#F0EFEC]/40">Domingos do mês. Cada coluna é um lote pago.</p>
        <MonthSwitcher value={monthKey} onChange={onMonthKey} />
      </div>
      {loading && !history ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="h-24 animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-24 animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-24 animate-pulse rounded-[16px] bg-white/4" />
          <div className="h-24 animate-pulse rounded-[16px] bg-white/4" />
        </div>
      ) : (
        <div className={cn('grid gap-3', (history?.sundays.length ?? 4) > 4 ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4')}>
          {(history?.sundays ?? []).map((sunday) => {
            const future = sunday.periodKey > today
            const active = sunday.periodKey === selectedPeriod
            return (
              <button
                key={sunday.periodKey}
                type="button"
                disabled={future}
                onClick={() => onSelect(sunday.periodKey)}
                className={cn(
                  'rounded-[16px] border px-4 py-3 text-left transition-colors disabled:opacity-40',
                  active
                    ? 'border-[#F0EFEC]/25 bg-[#F0EFEC]/8'
                    : 'border-white/[0.045] bg-[#1A1A1A] hover:border-white/10'
                )}
              >
                <p className="text-[11px] tracking-wide text-[#F0EFEC]/35 uppercase">Domingo</p>
                <p className="mt-1 text-[16px] text-[#F0EFEC]/88">{sunday.label}</p>
                <p className="mt-2 text-[12px] text-[#F0EFEC]/42">
                  {future
                    ? 'Ainda não chegou'
                    : sunday.payments.length
                      ? `${sunday.payments.length} pago${sunday.payments.length === 1 ? '' : 's'} · ${formatBRLFromCents(sunday.totalCents)}`
                      : 'Nenhum pagamento'}
                </p>
              </button>
            )
          })}
        </div>
      )}

      {selected && selected.periodKey <= today ? (
        <section className="mt-4 overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]">
          <div className={cn('flex items-center justify-between', mobile ? 'px-4 py-3' : 'px-5 py-3')}>
            <h2 className="text-[13px] capitalize tracking-wide text-[#F0EFEC]/55">{weekdayLong(selected.periodKey)}</h2>
            <span className="text-[12px] text-[#F0EFEC]/35">{formatBRLFromCents(selected.totalCents)}</span>
          </div>
          {selected.payments.length === 0 ? (
            <p className="border-t border-white/[0.04] px-5 py-8 text-center text-[13px] text-[#F0EFEC]/38">
              Nenhum vale foi pago neste domingo.
            </p>
          ) : mobile ? (
            <div>
              {selected.payments.map((payment) => (
                <div key={payment.collaboratorId} className="border-t border-white/[0.04] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[11px] text-[#F0EFEC]/55">
                      {initials(payment.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-[#F0EFEC]/85">{payment.name}</p>
                      <p className="truncate text-[12px] text-[#F0EFEC]/38">
                        {showStore ? `${payment.roleLabel} · ${payment.storeName}` : payment.roleLabel}
                      </p>
                    </div>
                    <p className="text-[13px] text-[#34D399]">{formatBRLFromCents(payment.totalCents)}</p>
                  </div>
                  <p className="mt-2 text-[12px] text-[#F0EFEC]/40">
                    Almoço {formatBRLFromCents(payment.lunchCents)} · Transporte {formatBRLFromCents(payment.transportCents)}
                    {payment.paidAt ? ` · ${formatDateTime(payment.paidAt)}` : ''}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">
                  <tr className="border-y border-white/[0.04]">
                    <th className="px-5 py-2.5 font-medium">Funcionário</th>
                    <th className="px-3 py-2.5 font-medium">Vale-almoço</th>
                    <th className="px-3 py-2.5 font-medium">Vale-transporte</th>
                    <th className="px-3 py-2.5 font-medium">Total</th>
                    <th className="px-5 py-2.5 font-medium">Pago em</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.payments.map((payment) => (
                    <tr key={payment.collaboratorId} className="border-t border-white/[0.03]">
                      <td className="px-5 py-3">
                        <p className="text-[13px] text-[#F0EFEC]/85">{payment.name}</p>
                        <p className="text-[12px] text-[#F0EFEC]/35">
                          {showStore ? `${payment.roleLabel} · ${payment.storeName}` : payment.roleLabel}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-[13px] text-[#F0EFEC]/70">{formatBRLFromCents(payment.lunchCents)}</td>
                      <td className="px-3 py-3 text-[13px] text-[#F0EFEC]/70">{formatBRLFromCents(payment.transportCents)}</td>
                      <td className="px-3 py-3 text-[13px] text-[#34D399]">{formatBRLFromCents(payment.totalCents)}</td>
                      <td className="px-5 py-3 text-[12px] text-[#F0EFEC]/45">
                        {payment.paidAt ? formatDateTime(payment.paidAt) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  )
}

function MoneyCard({
  label,
  cents,
  hint,
  icon,
  compact = false
}: {
  label: string
  cents: number
  hint: string
  icon: ReactNode
  compact?: boolean
}) {
  return (
    <article
      className={cn(
        'min-w-0 rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]',
        compact ? 'px-4 py-3.5' : 'px-5 py-4'
      )}
    >
      <div className={cn('flex items-start justify-between', compact ? 'mb-3 gap-2' : 'mb-5 gap-3')}>
        <p className={cn('min-w-0 text-[#F0EFEC]/42', compact ? 'text-[12px] leading-snug' : 'text-[13px]')}>
          {label}
        </p>
        <span
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-[#F0EFEC]/35',
            compact ? 'size-7' : 'size-8'
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          'leading-none tracking-tight text-[#F0EFEC]/92',
          compact ? 'text-[22px]' : 'text-[28px]'
        )}
      >
        <AnimatedMoney cents={cents} />
      </p>
      <p className={cn('text-[#F0EFEC]/32', compact ? 'mt-2 text-[11px] leading-snug' : 'mt-3 text-[12px]')}>
        {hint}
      </p>
    </article>
  )
}
