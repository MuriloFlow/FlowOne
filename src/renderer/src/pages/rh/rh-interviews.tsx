import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import { deleteInterview, fetchInterviewsWithContext, updateInterview } from '@/lib/rh/api'
import type { RhInterview } from '@/lib/rh/types'
import { RhApplicationStatusChip, RhCard, RhErrorState, RhPageHeader, RhSkeleton } from './rh-ui'

type InterviewRow = RhInterview & {
  application: {
    id: string
    status: Parameters<typeof RhApplicationStatusChip>[0]['status']
    job?: { title?: string } | null
    candidate?: { full_name?: string; phone?: string } | null
  } | null
}

export function RhInterviewsPage({ onOpenApplication }: { onOpenApplication: (id: string) => void }) {
  const [rows, setRows] = useState<InterviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

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

  const groups = useMemo(() => {
    const now = Date.now()
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)
    const endOfDayTime = endOfDay.getTime()
    const term = query.trim().toLowerCase()
    const filtered = rows.filter((row) => {
      if (!term) return true
      return [row.application?.candidate?.full_name, row.application?.job?.title, row.interviewer]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
    const sorted = [...filtered].sort(
      (left, right) => new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime()
    )
    const todayRows: InterviewRow[] = []
    const pastRows: InterviewRow[] = []
    const upcomingRows: InterviewRow[] = []
    for (const row of sorted) {
      const time = new Date(row.scheduled_at).getTime()
      if (time > endOfDayTime) upcomingRows.push(row)
      else if (time >= now - 3600_000) todayRows.push(row)
      else pastRows.push(row)
    }
    return { upcoming: upcomingRows, today: todayRows, past: pastRows.reverse() }
  }, [rows, query])
  const { upcoming, today, past } = groups

  async function setResult(row: InterviewRow, result: string): Promise<void> {
    await updateInterview(row.id, { result: result || null }).catch(() => undefined)
    void load()
  }

  async function remove(row: InterviewRow): Promise<void> {
    if (!window.confirm('Excluir esta entrevista?')) return
    await deleteInterview(row.id).catch(() => undefined)
    void load()
  }

  function renderRow(row: InterviewRow, compact = false): React.ReactNode {
    const when = new Date(row.scheduled_at)
    const isToday = new Date().toDateString() === when.toDateString()
    return (
      <div
        key={row.id}
        className="rounded-[14px] border border-white/[0.045] bg-[#1A1A1A] p-3.5 transition hover:border-white/[0.09]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => row.application && onOpenApplication(row.application.id)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="flex items-center gap-2">
              <span className="truncate text-[14px] font-medium text-[#F0EFEC]/85">
                {row.application?.candidate?.full_name ?? 'Candidato'}
              </span>
              {isToday ? (
                <span className="shrink-0 rounded-full border border-amber-300/25 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-amber-200/90 uppercase">
                  hoje
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-[#F0EFEC]/38">
              {row.application?.job?.title ?? 'Vaga'} · {row.mode === 'online' ? 'Online' : 'Presencial'} ·{' '}
              {row.duration_minutes} min
            </span>
            {!compact ? (
              <span className="mt-0.5 block truncate text-[11.5px] text-[#F0EFEC]/30">
                {[row.interviewer, row.location, row.meeting_url].filter(Boolean).join(' · ') || 'Sem detalhes'}
              </span>
            ) : null}
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-[12.5px] tabular-nums text-[#F0EFEC]/70">
              {when.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            {row.application?.candidate?.phone ? (
              <span className="text-[11px] text-[#F0EFEC]/35">{row.application.candidate.phone}</span>
            ) : null}
            {row.application ? <RhApplicationStatusChip status={row.application.status} /> : null}
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2 border-t border-white/[0.04] pt-2.5">
          <select
            value={row.result ?? ''}
            onChange={(event) => void setResult(row, event.target.value)}
            className="h-7 rounded-[7px] border border-white/[0.08] bg-white/[0.03] px-2 text-[11.5px] text-[#F0EFEC]/70 focus:outline-none"
          >
            <option value="" className="bg-[#1A1A1A]">
              Registrar resultado…
            </option>
            <option value="otimo" className="bg-[#1A1A1A]">Ótimo</option>
            <option value="bom" className="bg-[#1A1A1A]">Bom</option>
            <option value="ruim" className="bg-[#1A1A1A]">Ruim</option>
            <option value="no_show" className="bg-[#1A1A1A]">Não compareceu</option>
          </select>
          <span className="flex-1" />
          {row.result ? (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-[#F0EFEC]/55 uppercase">
              {row.result}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void remove(row)}
            aria-label="Excluir entrevista"
            className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/30 transition hover:bg-red-400/10 hover:text-red-300"
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
        subtitle="Agenda do processo seletivo — agende pela página do candidato."
      />

      {error ? <RhErrorState message={error} onRetry={() => void load()} /> : null}

      <div className="relative mb-3">
        <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#F0EFEC]/30" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por candidato, vaga ou entrevistador"
          className="h-9 w-full rounded-[10px] border border-white/[0.06] bg-white/[0.02] pr-3 pl-9 text-[13px] text-[#F0EFEC]/85 placeholder:text-[#F0EFEC]/30 focus:border-white/15 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          <RhSkeleton className="h-[96px]" />
          <RhSkeleton className="h-[96px]" />
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2">
          {today.length > 0 ? (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-amber-200/70 uppercase">
                Hoje ({today.length})
              </h2>
              <div className="space-y-2">{today.map((row) => renderRow(row))}</div>
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[#F0EFEC]/45 uppercase">
              Próximas ({upcoming.length})
            </h2>
            {upcoming.length === 0 ? (
              <RhCard className="p-5 text-center text-[12.5px] text-[#F0EFEC]/35">
                Nenhuma entrevista agendada. Agende pela página do candidato.
              </RhCard>
            ) : (
              <div className="space-y-2">{upcoming.map((row) => renderRow(row))}</div>
            )}
          </section>

          {past.length > 0 ? (
            <section>
              <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-[#F0EFEC]/45 uppercase">
                Histórico ({past.length})
              </h2>
              <div className="space-y-2">{past.map((row) => renderRow(row, true))}</div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  )
}
