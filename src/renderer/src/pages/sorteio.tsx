import { useCallback, useEffect, useState } from 'react'
import { Download, History, Lock, Sparkles, Ticket, Trash2, UserPlus } from 'lucide-react'
import { PasswordConfirmationDialog } from '@/components/password-confirmation-dialog'
import { pickSorteioWinner, SorteioDrawOverlay } from '@/components/sorteio-draw'
import { SorteioFlow, sorteioDialogTitle, type SorteioStep } from '@/components/sorteio-flow'
import { DangerConfirmButton } from '@/components/ui/danger-confirm-button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatCount } from '@/lib/format'
import { isMobileShell } from '@/lib/is-mobile-shell'
import { operationError, operations } from '@/lib/operations'
import { exportSorteioPhonesExcel } from '@/lib/sorteio-export'
import { cn } from '@/lib/utils'
import type { SorteioBoard, SorteioClient } from '../../../shared/sorteio'

type SorteioPageProps = {
  storeId?: string | null
}

export function SorteioPage({ storeId = null }: SorteioPageProps) {
  const mobile = isMobileShell()
  const [board, setBoard] = useState<SorteioBoard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyUnlocked, setHistoryUnlocked] = useState(false)
  const [passwordFor, setPasswordFor] = useState<'history' | 'draw' | null>(null)
  const [drawWinner, setDrawWinner] = useState<SorteioClient | null>(null)
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [flowKey, setFlowKey] = useState(0)
  const [dialogStep, setDialogStep] = useState<SorteioStep>('cpf')
  const [dialogExisting, setDialogExisting] = useState<SorteioClient | null>(null)
  const [dialogIsNew, setDialogIsNew] = useState(false)
  const [mobileHistory, setMobileHistory] = useState(false)
  const [removing, setRemoving] = useState<SorteioClient | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)

  const reload = useCallback(async () => {
    if (!historyUnlocked) return
    setLoading(true)
    try {
      setBoard(await operations().listSorteioBoard(storeId))
      setError(null)
    } catch (err) {
      setError(operationError(err))
    } finally {
      setLoading(false)
    }
  }, [historyUnlocked, storeId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    setHistoryUnlocked(false)
    setBoard(null)
    setMobileHistory(false)
    setRemoving(null)
  }, [storeId])

  const filtered = (board?.clients ?? []).filter((client) => {
    const term = query.trim().toLowerCase()
    if (!term) return true
    return [client.name, client.cpfFormatted, client.phoneFormatted, String(client.chances)]
      .join(' ')
      .toLowerCase()
      .includes(term)
  })

  async function beginDraw(): Promise<void> {
    try {
      const current = board ?? (await operations().listSorteioBoard(storeId))
      if (!board) setBoard(current)
      const winner = pickSorteioWinner(current.clients)
      if (!winner) {
        setError('Não há clientes com vale para sortear.')
        return
      }
      setError(null)
      setDrawWinner(winner)
    } catch (err) {
      setError(operationError(err))
    }
  }

  function openCreate(): void {
    if (!storeId) {
      setError('Selecione uma unidade no topo para cadastrar no sorteio.')
      return
    }
    setError(null)
    setFlowKey((value) => value + 1)
    setDialogStep('cpf')
    setDialogExisting(null)
    setDialogIsNew(false)
    setDialogOpen(true)
  }

  async function exportPhones(): Promise<void> {
    if (exporting) return
    const list = filtered.length ? filtered : board?.clients ?? []
    if (!list.length) {
      setError('Não há clientes no histórico para exportar.')
      return
    }
    setExporting(true)
    try {
      await exportSorteioPhonesExcel(list)
      setError(null)
    } catch (err) {
      setError(operationError(err))
    } finally {
      setExporting(false)
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!removing || deleting) return
    setDeleting(true)
    try {
      await operations().deleteSorteioClient(removing.id)
      setBoard((current) =>
        current
          ? {
              ...current,
              clients: current.clients.filter((item) => item.id !== removing.id),
              totalClients: Math.max(0, current.totalClients - 1),
              totalVales: Math.max(0, current.totalVales - removing.chances)
            }
          : current
      )
      setRemoving(null)
      setError(null)
      void reload()
    } catch (err) {
      setError(operationError(err))
    } finally {
      setDeleting(false)
    }
  }

  const meta = sorteioDialogTitle(dialogStep, dialogExisting, dialogIsNew)
  const canExport = (board?.clients.length ?? 0) > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {mobile ? (
        mobileHistory && historyUnlocked ? (
          <>
            <header className="mb-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-[20px] text-[#F0EFEC]/88">Histórico</h1>
                  <p className="mt-1 text-[13px] text-[#F0EFEC]/38">Clientes e vales do sorteio.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileHistory(false)}
                  className="h-9 rounded-[8px] px-3 text-[13px] text-[#F0EFEC]/55"
                >
                  Voltar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordFor('draw')}
                  className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#F0EFEC] text-[13px] text-[#111111]"
                >
                  <Sparkles className="size-3.5" strokeWidth={1.8} />
                  Sortear
                </button>
                <button
                  type="button"
                  disabled={!canExport || exporting}
                  onClick={() => void exportPhones()}
                  className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-white/[0.08] text-[13px] text-[#F0EFEC]/75 disabled:opacity-45"
                >
                  <Download className="size-3.5" strokeWidth={1.8} />
                  {exporting ? 'Exportando…' : 'Exportar'}
                </button>
              </div>
            </header>
            {error ? <ErrorBox message={error} /> : null}
            {loading && !board ? (
              <div className="min-h-[200px] flex-1 animate-pulse rounded-[14px] bg-white/4" />
            ) : (
              <HistoryList
                board={board}
                query={query}
                filtered={filtered}
                onQuery={setQuery}
                mobile
                onDelete={setRemoving}
              />
            )}
          </>
        ) : (
          <>
            {!storeId ? (
              <p className="mb-4 rounded-[12px] border border-amber-500/15 bg-amber-500/8 px-3 py-2.5 text-[12.5px] text-amber-100/75">
                Selecione uma unidade para registrar vales.
              </p>
            ) : null}
            {error ? <ErrorBox message={error} /> : null}
            {storeId ? (
              <SorteioFlow
                key={`mobile-${flowKey}-${storeId}`}
                storeId={storeId}
                onFinished={() => {
                  if (historyUnlocked) void reload()
                }}
              />
            ) : (
              <EmptyStore />
            )}
            <button
              type="button"
              onClick={() => setPasswordFor('draw')}
              className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#F0EFEC] text-[14px] text-[#111111]"
            >
              <Sparkles className="size-4" strokeWidth={1.8} />
              Sortear
            </button>
            <button
              type="button"
              onClick={() => {
                if (historyUnlocked) setMobileHistory(true)
                else setPasswordFor('history')
              }}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-[10px] border border-white/[0.06] text-[13px] text-[#F0EFEC]/55"
            >
              <History className="size-3.5" strokeWidth={1.8} />
              Ver histórico
            </button>
          </>
        )
      ) : (
        <>
          <header className="mb-5 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[22px] text-[#F0EFEC]/88">Sorteio</h1>
              <p className="mt-1 text-[13px] text-[#F0EFEC]/38">
                Cadastre clientes e some vales (chances) no sorteio da loja.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setPasswordFor('draw')}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[#F0EFEC] px-3.5 text-[13px] text-[#111111]"
              >
                <Sparkles className="size-3.5" strokeWidth={1.8} />
                Sortear
              </button>
              {historyUnlocked && canExport ? (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => void exportPhones()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-white/[0.08] px-3.5 text-[13px] text-[#F0EFEC]/70 hover:bg-white/[0.04] disabled:opacity-45"
                >
                  <Download className="size-3.5" strokeWidth={1.8} />
                  {exporting ? 'Exportando…' : 'Exportar'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={openCreate}
                className="h-8 rounded-[8px] border border-white/[0.08] px-3.5 text-[13px] text-[#F0EFEC]/75"
              >
                Cadastrar
              </button>
            </div>
          </header>

          {error ? <ErrorBox message={error} /> : null}

          {!historyUnlocked ? (
            <section className="flex min-h-[280px] flex-1 flex-col items-center justify-center rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-6 text-center">
              <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-white/[0.04] text-[#F0EFEC]/40">
                <Lock className="size-4" strokeWidth={1.7} />
              </div>
              <p className="text-[15px] text-[#F0EFEC]/82">Histórico protegido</p>
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-[#F0EFEC]/38">
                Confirme a senha da sua conta FLOW para ver, exportar ou excluir cadastros.
              </p>
              <button
                type="button"
                onClick={() => setPasswordFor('history')}
                className="mt-5 flex h-9 items-center gap-2 rounded-[8px] bg-[#F0EFEC] px-4 text-[13px] text-[#111111]"
              >
                <History className="size-3.5" strokeWidth={1.8} />
                Abrir histórico
              </button>
            </section>
          ) : loading && !board ? (
            <div className="min-h-[240px] flex-1 animate-pulse rounded-[16px] bg-white/4" />
          ) : (board?.clients.length ?? 0) === 0 ? (
            <EmptyHistory onCreate={openCreate} />
          ) : (
            <HistoryList
              board={board}
              query={query}
              filtered={filtered}
              onQuery={setQuery}
              mobile={false}
              onDelete={setRemoving}
            />
          )}

          <Dialog
            open={dialogOpen}
            title={meta.title}
            description={meta.description}
            onClose={() => {
              setDialogOpen(false)
              if (historyUnlocked) void reload()
            }}
          >
            {storeId ? (
              <SorteioFlow
                key={flowKey}
                storeId={storeId}
                embedded
                onStepChange={(step, existing, isNew) => {
                  setDialogStep(step)
                  setDialogExisting(existing)
                  setDialogIsNew(isNew)
                }}
                onFinished={() => {
                  if (historyUnlocked) void reload()
                }}
              />
            ) : null}
          </Dialog>
        </>
      )}

      <Dialog
        open={removing !== null}
        title="Excluir cliente"
        description={
          removing
            ? `Apaga ${removing.name} e todos os ${removing.chances} ${removing.chances === 1 ? 'vale' : 'vales'} deste CPF. Não dá para desfazer.`
            : undefined
        }
        onClose={() => {
          if (!deleting) setRemoving(null)
        }}
      >
        <div className="flex items-center justify-end gap-2 px-5 pb-5">
          <button
            type="button"
            disabled={deleting}
            onClick={() => setRemoving(null)}
            className="h-8 rounded-[8px] px-3.5 text-[13px] text-[#F0EFEC]/45"
          >
            Cancelar
          </button>
          <DangerConfirmButton loading={deleting} onClick={() => void confirmDelete()}>
            Excluir
          </DangerConfirmButton>
        </div>
      </Dialog>

      <PasswordConfirmationDialog
        open={passwordFor !== null}
        title={passwordFor === 'draw' ? 'Sortear' : 'Abrir histórico do sorteio'}
        description={
          passwordFor === 'draw'
            ? 'Digite a senha da conta FLOW para sortear o ganhador.'
            : 'Digite a senha da conta FLOW para visualizar, exportar ou excluir cadastros.'
        }
        confirmLabel={passwordFor === 'draw' ? 'Sortear' : 'Liberar histórico'}
        onClose={() => setPasswordFor(null)}
        onConfirmed={() => {
          const purpose = passwordFor
          setPasswordFor(null)
          if (purpose === 'history') {
            setHistoryUnlocked(true)
            if (mobile) setMobileHistory(true)
            return
          }
          if (purpose === 'draw') void beginDraw()
        }}
      />
      {drawWinner ? <SorteioDrawOverlay winner={drawWinner} onClose={() => setDrawWinner(null)} /> : null}
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-[12px] border border-red-500/15 bg-red-500/8 px-4 py-3 text-[13px] text-red-300/80">
      {message}
    </div>
  )
}

function EmptyStore() {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
      <Ticket className="mb-3 size-5 text-[#F0EFEC]/30" strokeWidth={1.6} />
      <p className="text-[14px] text-[#F0EFEC]/70">Selecione uma unidade</p>
      <p className="mt-1 text-[12.5px] text-[#F0EFEC]/38">O sorteio registra vales por loja.</p>
    </div>
  )
}

function EmptyHistory({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex min-h-[260px] flex-1 flex-col items-center justify-center rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-6 text-center">
      <UserPlus className="mb-3 size-5 text-[#F0EFEC]/30" strokeWidth={1.6} />
      <p className="text-[15px] text-[#F0EFEC]/82">Nenhum cliente ainda</p>
      <p className="mt-1 text-[13px] text-[#F0EFEC]/38">Cadastre o primeiro CPF para começar o sorteio.</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 h-9 rounded-[8px] bg-[#F0EFEC] px-4 text-[13px] text-[#111111]"
      >
        Cadastrar
      </button>
    </section>
  )
}

function HistoryList({
  board,
  query,
  filtered,
  onQuery,
  mobile,
  onDelete
}: {
  board: SorteioBoard | null
  query: string
  filtered: SorteioClient[]
  onQuery: (value: string) => void
  mobile: boolean
  onDelete: (client: SorteioClient) => void
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-white/[0.045] bg-[#1A1A1A]',
        !mobile && 'mb-[4.5rem]'
      )}
    >
      <div className={cn('flex items-center gap-3', mobile ? 'px-3 py-3' : 'justify-between px-4 py-3')}>
        <Input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={mobile ? 'Buscar cliente' : 'Buscar por nome, CPF ou telefone'}
          className="h-8 max-w-sm rounded-[8px] border-white/[0.06] bg-transparent text-[13px]"
        />
        <span className="shrink-0 text-[12px] text-[#F0EFEC]/32">
          {formatCount(filtered.length)} · {formatCount(board?.totalVales ?? 0)} vales
        </span>
      </div>

      {mobile ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {filtered.map((client) => (
            <div
              key={client.id}
              className="mb-1.5 rounded-[12px] border border-white/[0.04] bg-white/[0.02] px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-[#F0EFEC]/88">{client.name}</p>
                  <p className="mt-0.5 text-[12px] text-[#F0EFEC]/38">
                    {client.cpfMasked} · {client.phoneFormatted}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-[#F0EFEC]/08 px-2.5 py-1 text-[12px] text-[#F0EFEC]/75">
                    {client.chances} {client.chances === 1 ? 'vale' : 'vales'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Excluir ${client.name}`}
                    onClick={() => onDelete(client)}
                    className="flex size-8 items-center justify-center rounded-[8px] text-red-300/70 hover:bg-red-500/10"
                  >
                    <Trash2 className="size-3.5" strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="sticky top-0 bg-[#1A1A1A]">
              <tr className="border-y border-white/[0.04] text-[11px] uppercase tracking-[0.06em] text-[#F0EFEC]/28">
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">CPF</th>
                <th className="px-4 py-2.5 font-medium">Telefone</th>
                <th className="px-4 py-2.5 font-medium text-right">Vales</th>
                <th className="px-4 py-2.5 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} className="border-b border-white/[0.035]">
                  <td className="px-4 py-3 text-[13.5px] text-[#F0EFEC]/86">{client.name}</td>
                  <td className="px-4 py-3 text-[13px] text-[#F0EFEC]/48">{client.cpfMasked}</td>
                  <td className="px-4 py-3 text-[13px] text-[#F0EFEC]/48">{client.phoneFormatted}</td>
                  <td className="px-4 py-3 text-right text-[13.5px] text-[#F0EFEC]/86">{client.chances}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Excluir ${client.name}`}
                      onClick={() => onDelete(client)}
                      className="inline-flex size-8 items-center justify-center rounded-[8px] text-red-300/65 hover:bg-red-500/10"
                    >
                      <Trash2 className="size-3.5" strokeWidth={1.8} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
