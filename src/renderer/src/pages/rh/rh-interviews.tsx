import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { deleteInterview, fetchInterviewsWithContext, updateInterview } from '@/lib/rh/api'
import type { RhInterview } from '@/lib/rh/types'
import {
  RhApplicationStatusChip,
  RhCard,
  RhErrorState,
  RhPageHeader,
  RhSkeleton
} from './rh-ui'

type InterviewRow = RhInterview & {
  application: {
    id: string
    status: Parameters<typeof RhApplicationStatusChip>[0]['status']
    job?: { title?: string } | null
    candidate?: { full_name?: string } | null
  } | null
}

export function RhInterviewsPage({ onOpenApplication }: { onOpenApplication: (id: string) => void }) {
  const [rows, setRows] = useState<InterviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows((await fetchInterviewsWithContext()) as InterviewRow[])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar entrevistas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { upcoming, past } = useMemo(() => {
    const now = Date.now()
    const sorted = [...rows].sort(
      (left, right) => new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime()
    )
    return {
      upcoming: sorted.filter((row) => new Date(row.scheduled_at).getTime() >= now - 3600_000),
      past: sorted.filter((row) => new Date(row.scheduled_at).getTime() < now - 3600_000).reverse()
    }
  }, [rows])

  async function setResult(row: InterviewRow, result: string): Promise<void> {
    await updateInterview(row.id, { result: result || null }).catch(() => undefined)
    void load()
  }

  async function remove(row: InterviewRow): Promise<void> {
    if (!window.confirm('Excluir esta entrevista?')) return
    await deleteInterview(row.id).catch(() => undefined)
    void load()
  }

  function renderRow(row: InterviewRow): React.ReactNode {
    return (
      <div key={row.id} className="rounded-[14px] border border-white/[0.045] bg-[#1A1A1A] p-3.5 transition hover:border-white/[0.09]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button type="button" onClick={() => row.application && onOpenApplication(row.application.id)} className="min-w-0 text-left">
            <span className="block truncate text-[14px] font-medium text-[#F0EFEC]/85">
              {row.application?.candidate?.full_name ?? 'Candidato'}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-[#F0EFEC]/38">
              {row.application?.job?.title ?? 'Vaga'} · {row.mode === 'online' ? 'Online' : 'Presencial'} ·{' '}
              {row.duration_minutes} min
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] text-[#F0EFEC]/30">
              {[row.interviewer, row.location, row.meeting_url].filter(Boolean).join(' · ') || 'Sem detalhes'}
            </span>
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-[12.5px] tabular-nums text-[#F0EFEC]/70">
              {new Date(row.scheduled_at).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
            {row.application ? <RhApplicationStatusChip status={row.application.status} /> : null}
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2 border-t border-white/[0.04] pt-2.5">
          <select
            value={row.result ?? ''}
            onChange={(event) => void setResult(row, event.target.value)}
            className="rounded-[8px] border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11.5px] text-[#F0EFEC]/70 focus:outline-none"
          >
            <option value="" className="bg-[#1A1A1A]">Resultado…</option>
            <option value="otimo" className="bg-[#1A1A1A]">Ótimo</option>
            <option value="bom" className="bg-[#1A1A1A]">Bom</option>
            <option value="ruim" className="bg-[#1A1A1A]">Ruim</option>
            <option value="no_show" className="bg-[#1A1A1A]">Não compareceu</option>
          </select>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => void remove(row)}
            aria-label="Excluir entrevista"
            className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/30 hover:bg-red-400/10 hover:text-red-300"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RhPageHeader
        title="Entrevistas"
        subtitle="Agenda do processo seletivo — próximas entrevistas e histórico."
      />

      {error ? <RhErrorState message={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <div className="space-y-2">
          <RhSkeleton className="h-[88px]" />
          <RhSkeleton className="h-[88px]" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
          <section>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[#F0EFEC]/45 uppercase">
              Próximas ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <RhCard className="p-5 text-center text-[12.5px] text-[#F0EFEC]/35">
                Nenhuma entrevista agendada. Agende pela página do candidato.
              </RhCard>
            ) : (
              <div className="space-y-2">{upcoming.map(renderRow)}</div>
            )}
          </section>

          {past.length > 0 ? (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[#F0EFEC]/45 uppercase">
                Histórico ({past.length})
              </h2>
              <div className="space-y-2">{past.map(renderRow)}</div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
