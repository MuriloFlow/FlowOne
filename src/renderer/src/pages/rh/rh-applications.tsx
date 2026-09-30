import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Brain,
  CalendarPlus,
  FileText,
  Loader2,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import {
  addInternalNote,
  analyzeApplication,
  createInterview,
  createResumeSignedUrl,
  extractResumeTextFromUrl,
  fetchApplicationDetail,
  fetchApplications,
  fetchJobs,
  moveApplication,
  updateInterview,
  deleteInterview,
  type RhApplicationDetail
} from '@/lib/rh/api'
import {
  APPLICATION_PIPELINE_ORDER,
  APPLICATION_STATUS_META,
  type RhApplication,
  type RhApplicationStatus,
  type RhInterview,
  type RhJob
} from '@/lib/rh/types'
import {
  RhApplicationStatusChip,
  RhCard,
  RhEmptyState,
  RhErrorState,
  RhGhostButton,
  RhPageHeader,
  RhPrimaryButton,
  RhSkeleton
} from './rh-ui'

// ============================================================
// CENTRAL DE CANDIDATOS (lista)
// ============================================================

type ListProps = {
  initialStatus?: RhApplicationStatus | null
  onOpenApplication: (id: string) => void
}

export function RhApplicationsPage({ initialStatus, onOpenApplication }: ListProps) {
  const [applications, setApplications] = useState<RhApplication[]>([])
  const [jobs, setJobs] = useState<RhJob[]>([])
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<RhApplicationStatus | 'all'>(initialStatus ?? 'all')
  const [jobId, setJobId] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialStatus) setStatus(initialStatus)
  }, [initialStatus])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [appsData, jobsData] = await Promise.all([fetchApplications(), fetchJobs()])
      setApplications(appsData)
      setJobs(jobsData)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar candidaturas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return applications.filter((application) => {
      if (status !== 'all' && application.status !== status) return false
      if (jobId !== 'all' && application.job_id !== jobId) return false
      if (!term) return true
      return [application.candidate?.full_name, application.candidate?.email, application.job?.title]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [applications, query, status, jobId])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RhPageHeader
        title="Central de Candidatos"
        subtitle={`${applications.length} candidaturas no pipeline — toque para ver o candidato completo.`}
      />

      {error ? <RhErrorState message={error} onRetry={() => void load()} /> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#F0EFEC]/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome, e-mail ou vaga"
            className="h-9 w-full rounded-[10px] border border-white/[0.06] bg-white/[0.02] pr-3 pl-9 text-[13px] text-[#F0EFEC]/85 placeholder:text-[#F0EFEC]/30 focus:border-white/15 focus:outline-none"
          />
        </div>
        <select
          value={jobId}
          onChange={(event) => setJobId(event.target.value)}
          className="h-9 rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-2.5 text-[12.5px] text-[#F0EFEC]/75 focus:outline-none"
        >
          <option value="all" className="bg-[#1A1A1A]">Todas as vagas</option>
          {jobs.map((job) => (
            <option key={job.id} value={job.id} className="bg-[#1A1A1A]">
              {job.title}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {(['all', ...APPLICATION_PIPELINE_ORDER] as const).map((statusOption) => {
          const active = status === statusOption
          const count =
            statusOption === 'all'
              ? applications.length
              : applications.filter((application) => application.status === statusOption).length
          if (statusOption !== 'all' && count === 0) return null
          return (
            <button
              key={statusOption}
              type="button"
              onClick={() => setStatus(statusOption)}
              className={`h-7 rounded-full px-3 text-[11.5px] font-medium transition ${
                active ? 'bg-[#F0EFEC] text-[#111111]' : 'border border-white/[0.07] text-[#F0EFEC]/50 hover:text-[#F0EFEC]/80'
              }`}
            >
              {statusOption === 'all' ? 'Todos' : APPLICATION_STATUS_META[statusOption].label}
              <span className="ml-1.5 opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="space-y-2">
          <RhSkeleton className="h-[76px]" />
          <RhSkeleton className="h-[76px]" />
          <RhSkeleton className="h-[76px]" />
        </div>
      ) : filtered.length === 0 ? (
        <RhEmptyState
          title="Nenhuma candidatura aqui"
          description="As candidaturas do portal público chegam automaticamente nesta central."
        />
      ) : (
        <div className="space-y-2 pb-2">
          {filtered.map((application) => (
            <button
              key={application.id}
              type="button"
              onClick={() => onOpenApplication(application.id)}
              className="block w-full rounded-[14px] border border-white/[0.045] bg-[#1A1A1A] p-3.5 text-left transition hover:border-white/[0.09] hover:bg-[#1E1E1E]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F0EFEC]/8 text-[13px] font-semibold text-[#F0EFEC]/60">
                    {initials(application.candidate?.full_name ?? '?')}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-[#F0EFEC]/85">
                      {application.candidate?.full_name ?? 'Candidato'}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-[#F0EFEC]/38">
                      {application.job?.title ?? 'Vaga removida'} ·{' '}
                      {new Date(application.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <RhApplicationStatusChip status={application.status} />
                  <span className="text-[11px] tabular-nums text-[#F0EFEC]/35">
                    {(application as { rh_files?: unknown[] }).rh_files?.length ? '📎 currículo' : null} ·{' '}
                    {application.score} pts
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// PÁGINA DO CANDIDATO
// ============================================================

export function RhApplicationDetailPage({
  applicationId,
  authorName,
  onBack,
  onChanged
}: {
  applicationId: string
  authorName: string
  onBack: () => void
  onChanged?: () => void
}) {
  const [detail, setDetail] = useState<RhApplicationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resumeUrl, setResumeUrl] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiMessage, setAiMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchApplicationDetail(applicationId)
      if (!data) throw new Error('Candidatura não encontrada.')
      setDetail(data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar o candidato.')
    } finally {
      setLoading(false)
    }
  }, [applicationId])

  useEffect(() => {
    void load()
  }, [load])

  async function openResume(): Promise<void> {
    if (!detail) return
    const file = detail.application.rh_files?.[0]
    if (!file) return
    try {
      const url = await createResumeSignedUrl(file.storage_path)
      setResumeUrl(url)
    } catch (openError) {
      setAiMessage(openError instanceof Error ? openError.message : 'Erro ao abrir o currículo.')
    }
  }

  async function runAi(): Promise<void> {
    if (!detail || aiLoading) return
    setAiLoading(true)
    setAiMessage(null)
    try {
      const file = detail.application.rh_files?.[0]
      let resumeText: string | undefined
      if (file) {
        try {
          const url = await createResumeSignedUrl(file.storage_path)
          resumeText = await extractResumeTextFromUrl(url, file.mime_type || 'application/pdf')
        } catch {
          resumeText = undefined
        }
      }
      await analyzeApplication(applicationId, resumeText)
      await load()
    } catch (aiError) {
      setAiMessage(aiError instanceof Error ? aiError.message : 'A análise da IA falhou.')
    } finally {
      setAiLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <RhSkeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_0.9fr]">
          <RhSkeleton className="h-[420px]" />
          <RhSkeleton className="h-[420px]" />
        </div>
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="space-y-3">
        <BackButton onBack={onBack} title="Candidato" />
        <RhErrorState message={error ?? 'Candidatura não encontrada.'} onRetry={() => void load()} />
      </div>
    )
  }

  const { application, answers, history, notes, interviews, assessment } = detail
  const candidate = application.candidate ?? null
  const resumeFile = application.rh_files?.[0] ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <BackButtonInline onBack={onBack} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[20px] text-[#F0EFEC]/88">{candidate?.full_name ?? 'Candidato'}</h1>
              <RhApplicationStatusChip status={application.status} />
            </div>
            <p className="mt-0.5 truncate text-[12px] text-[#F0EFEC]/35">
              {application.job?.title ?? 'Vaga removida'} · candidato desde{' '}
              {new Date(application.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto pb-4 xl:grid-cols-[1.45fr_0.95fr]">
        {/* ---------- Coluna principal ---------- */}
        <div className="min-w-0 space-y-3">
          <RhCard className="p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-[#F0EFEC]/80">Dados do candidato</h2>
            <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              <InfoRow label="E-mail" value={candidate?.email} />
              <InfoRow
                label="Telefone"
                value={candidate?.phone}
                icon={candidate?.phone ? <Phone className="size-3 shrink-0 text-[#F0EFEC]/30" /> : null}
              />
              <InfoRow label="CPF" value={candidate?.cpf} />
              <InfoRow
                label="Nascimento"
                value={candidate?.birth_date ? new Date(`${candidate.birth_date}T12:00:00`).toLocaleDateString('pt-BR') : null}
              />
              <InfoRow
                label="Cidade"
                value={[candidate?.city, candidate?.state].filter(Boolean).join(' / ') || null}
              />
              <InfoRow
                label="Endereço"
                value={
                  [candidate?.street, candidate?.street_number, candidate?.district, candidate?.zip_code]
                    .filter(Boolean)
                    .join(', ') || null
                }
              />
              <InfoRow label="LinkedIn" value={candidate?.linkedin_url} link />
              <InfoRow label="Portfólio" value={candidate?.portfolio_url} link />
            </div>
            {resumeFile ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/[0.05] pt-3">
                <FileText className="size-4 text-[#F0EFEC]/40" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#F0EFEC]/65">{resumeFile.file_name}</span>
                <RhGhostButton onClick={() => void openResume()}>Visualizar dentro do FLOW</RhGhostButton>
              </div>
            ) : (
              <p className="mt-4 border-t border-white/[0.05] pt-3 text-[12px] text-[#F0EFEC]/30">
                Nenhum currículo anexado nesta candidatura.
              </p>
            )}
          </RhCard>

          {/* IA */}
          <RhCard className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-[#F0EFEC]/80">
                <Brain className="size-3.5 text-[#F0EFEC]/40" /> Análise da IA
              </h2>
              <RhGhostButton onClick={() => void runAi()} disabled={aiLoading}>
                {aiLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {assessment ? 'Reanalisar' : 'Analisar com IA'}
              </RhGhostButton>
            </div>
            {aiMessage ? <p className="mb-2 text-[12px] text-red-300/80">{aiMessage}</p> : null}
            {assessment ? (
              <AiAssessmentBody assessment={assessment} />
            ) : (
              <p className="text-[12.5px] text-[#F0EFEC]/35">
                A IA avalia o currículo e as respostas conforme as regras configuradas em Configurações → Regras da IA,
                gerando uma pontuação de compatibilidade (0–100) com pontos positivos e de atenção.
              </p>
            )}
          </RhCard>

          {/* Respostas */}
          <RhCard className="p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-[#F0EFEC]/80">Respostas do formulário</h2>
            {answers.length === 0 ? (
              <p className="text-[12.5px] text-[#F0EFEC]/35">Sem respostas registradas.</p>
            ) : (
              <div className="space-y-2.5">
                {answers.map((answer) => (
                  <div key={answer.id} className="rounded-[10px] border border-white/[0.05] bg-white/[0.02] p-3">
                    <p className="text-[12px] font-medium text-[#F0EFEC]/55">{answer.rh_questions?.label ?? 'Pergunta'}</p>
                    <p className="mt-1 text-[13px] whitespace-pre-wrap text-[#F0EFEC]/85">
                      {formatAnswer(answer.value_text, answer.value_json)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </RhCard>

          {/* Entrevistas */}
          <InterviewsSection
            interviews={interviews}
            applicationId={application.id}
            onChanged={() => {
              void load()
              onChanged?.()
            }}
          />

          {/* Observações internas */}
          <NotesSection
            notes={notes}
            authorName={authorName}
            applicationId={application.id}
            onChanged={() => {
              void load()
            }}
          />
        </div>

        {/* ---------- Coluna lateral (cards premium) ---------- */}
        <div className="min-w-0 space-y-3">
          <StatusCard
            current={application.status}
            onChange={async (next, note) => {
              await moveApplication(application.id, next, note)
              await load()
              onChanged?.()
            }}
          />

          <RhCard className="p-4">
            <h2 className="mb-2 text-[13px] font-semibold text-[#F0EFEC]/80">Pontuação</h2>
            <div className="flex items-end gap-3">
              <div>
                <p className="text-[30px] leading-none font-semibold text-[#F0EFEC]/90">
                  {application.score}
                  <span className="text-[13px] text-[#F0EFEC]/30"> pts</span>
                </p>
                <p className="mt-1 text-[11px] text-[#F0EFEC]/35">Formulário + IA</p>
              </div>
              {assessment ? (
                <span
                  className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                    bandClass(assessment.band)
                  }`}
                >
                  IA {assessment.score} · {assessment.band}
                </span>
              ) : null}
            </div>
          </RhCard>

          <RhCard className="p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-[#F0EFEC]/80">Histórico</h2>
            {history.length === 0 ? (
              <p className="text-[12.5px] text-[#F0EFEC]/35">Sem movimentações ainda.</p>
            ) : (
              <ol className="relative space-y-3 border-l border-white/[0.07] pl-4">
                {[...history].reverse().map((event) => {
                  const meta = APPLICATION_STATUS_META[event.to_status]
                  return (
                    <li key={event.id} className="relative">
                      <span className={`absolute top-1.5 -left-[21px] size-2 rounded-full ${meta.dot}`} />
                      <p className="text-[12.5px] text-[#F0EFEC]/75">
                        → {meta.label}
                        <span className="ml-1.5 text-[10.5px] text-[#F0EFEC]/30">
                          {new Date(event.created_at).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </p>
                      {event.note ? <p className="mt-0.5 text-[11.5px] text-[#F0EFEC]/40">{event.note}</p> : null}
                    </li>
                  )
                })}
              </ol>
            )}
          </RhCard>
        </div>
      </div>

      {resumeUrl ? <ResumePreviewOverlay url={resumeUrl} fileName={resumeFile?.file_name ?? 'Currículo'} onClose={() => setResumeUrl(null)} /> : null}
    </div>
  )
}

// ---------- subcomponentes ----------

function BackButton({ onBack, title }: { onBack: () => void; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <BackButtonInline onBack={onBack} />
      <span className="text-[13px] text-[#F0EFEC]/45">{title}</span>
    </div>
  )
}

function BackButtonInline({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Voltar"
      className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[#F0EFEC]/50 transition hover:bg-white/[0.05] hover:text-[#F0EFEC]/85"
    >
      ←
    </button>
  )
}

function InfoRow({ label, value, link, icon }: { label: string; value?: string | null; link?: boolean; icon?: React.ReactNode }) {
  if (!value) return null
  return (
    <div className="min-w-0">
      <p className="text-[11px] tracking-wide text-[#F0EFEC]/32 uppercase">{label}</p>
      {link && /^https?:\/\//.test(value) ? (
        <a href={value} target="_blank" rel="noreferrer" className="block truncate text-[13px] text-sky-300/80 underline-offset-2 hover:underline">
          {value}
        </a>
      ) : (
        <p className="flex items-center gap-1.5 truncate text-[13px] text-[#F0EFEC]/80">
          {icon}
          {value}
        </p>
      )}
    </div>
  )
}

function formatAnswer(valueText: unknown, valueJson: unknown): string {
  if (typeof valueText === 'string' && valueText.trim()) return valueText
  if (Array.isArray(valueJson)) return valueJson.map((item) => String(item)).join(', ')
  if (valueJson == null) return '—'
  if (typeof valueJson === 'object') return JSON.stringify(valueJson)
  return String(valueJson)
}

function bandClass(band: string): string {
  if (band === 'ALTA') return 'border border-emerald-300/25 bg-emerald-300/10 text-emerald-200'
  if (band === 'MEDIA') return 'border border-amber-300/25 bg-amber-300/10 text-amber-200'
  if (band === 'ELIMINADO') return 'border border-red-300/25 bg-red-300/10 text-red-200'
  return 'border border-white/10 bg-white/[0.05] text-[#F0EFEC]/60'
}

function AiAssessmentBody({ assessment }: { assessment: NonNullable<RhApplicationDetail['assessment']> }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${bandClass(assessment.band)}`}>
          {assessment.band} · {assessment.score}/100
        </span>
        <span className="text-[11px] text-[#F0EFEC]/30">
          {assessment.model}
          {assessment.resume_chars ? ` · ${assessment.resume_chars} caracteres lidos` : ''}
        </span>
      </div>
      <p className="text-[13px] text-[#F0EFEC]/80">{assessment.summary}</p>
      {assessment.positives?.length ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-emerald-300/70 uppercase">Positivos</p>
          <ul className="space-y-1">
            {assessment.positives.map((item, index) => (
              <li key={index} className="flex gap-2 text-[12.5px] text-[#F0EFEC]/70">
                <span className="text-emerald-300/70">+</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {assessment.negatives?.length ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold tracking-wide text-amber-300/70 uppercase">Pontos de atenção</p>
          <ul className="space-y-1">
            {assessment.negatives.map((item, index) => (
              <li key={index} className="flex gap-2 text-[12.5px] text-[#F0EFEC]/70">
                <span className="text-amber-300/70">!</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {assessment.experience_analysis ? (
        <p className="rounded-[10px] bg-white/[0.03] p-2.5 text-[12px] text-[#F0EFEC]/60">
          <span className="font-semibold text-[#F0EFEC]/70">Experiência: </span>
          {assessment.experience_analysis}
        </p>
      ) : null}
      {assessment.transport_analysis ? (
        <p className="rounded-[10px] bg-white/[0.03] p-2.5 text-[12px] text-[#F0EFEC]/60">
          <span className="font-semibold text-[#F0EFEC]/70">Deslocamento: </span>
          {assessment.transport_analysis}
        </p>
      ) : null}
      {assessment.conclusion ? (
        <p className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] p-2.5 text-[12.5px] text-[#F0EFEC]/75">
          {assessment.conclusion}
        </p>
      ) : null}
    </div>
  )
}

function StatusCard({
  current,
  onChange
}: {
  current: RhApplicationStatus
  onChange: (next: RhApplicationStatus, note?: string) => Promise<void>
}) {
  const [next, setNext] = useState<RhApplicationStatus>(current)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setNext(current), [current])

  async function apply(): Promise<void> {
    if (next === current) return
    setSaving(true)
    setError(null)
    try {
      await onChange(next, note.trim() || undefined)
      setNote('')
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : 'Erro ao alterar status.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <RhCard className="p-4">
      <h2 className="mb-3 text-[13px] font-semibold text-[#F0EFEC]/80">Status do candidato</h2>
      <select
        value={next}
        onChange={(event) => setNext(event.target.value as RhApplicationStatus)}
        className="w-full rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[13px] text-[#F0EFEC]/85 focus:outline-none"
      >
        {APPLICATION_PIPELINE_ORDER.map((status) => (
          <option key={status} value={status} className="bg-[#1A1A1A]">
            {APPLICATION_STATUS_META[status].label}
          </option>
        ))}
      </select>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Observação da movimentação (opcional)"
        className="mt-2 w-full rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[12.5px] text-[#F0EFEC]/80 placeholder:text-[#F0EFEC]/28 focus:outline-none"
      />
      {error ? <p className="mt-1.5 text-[11.5px] text-red-300/80">{error}</p> : null}
      <RhPrimaryButton onClick={() => void apply()} disabled={saving || next === current} className="mt-2.5 w-full">
        {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar status
      </RhPrimaryButton>
    </RhCard>
  )
}

function InterviewsSection({
  interviews,
  applicationId,
  onChanged
}: {
  interviews: RhInterview[]
  applicationId: string
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'online' | 'presencial'>('presencial')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState('60')
  const [interviewer, setInterviewer] = useState('')
  const [place, setPlace] = useState('')

  async function schedule(): Promise<void> {
    if (!date) {
      setError('Escolha a data da entrevista.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createInterview({
        application_id: applicationId,
        mode,
        scheduled_at: new Date(`${date}T${time}:00`).toISOString(),
        duration_minutes: Number(duration) || 60,
        interviewer: interviewer.trim() || null,
        location: mode === 'presencial' ? place.trim() || null : null,
        meeting_url: mode === 'online' ? place.trim() || null : null
      })
      setOpen(false)
      onChanged()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Erro ao agendar.')
    } finally {
      setSaving(false)
    }
  }

  async function setResult(interview: RhInterview, result: string): Promise<void> {
    await updateInterview(interview.id, { result: result || null }).catch(() => undefined)
    onChanged()
  }

  async function remove(interview: RhInterview): Promise<void> {
    if (!window.confirm('Excluir esta entrevista?')) return
    await deleteInterview(interview.id).catch(() => undefined)
    onChanged()
  }

  const upcoming = [...interviews].sort(
    (left, right) => new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime()
  )

  return (
    <RhCard className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-[#F0EFEC]/80">Entrevistas</h2>
        <RhGhostButton onClick={() => setOpen((value) => !value)}>
          {open ? 'Fechar' : (
            <>
              <CalendarPlus className="size-3.5" /> Agendar
            </>
          )}
        </RhGhostButton>
      </div>

      {open ? (
        <div className="mb-3 space-y-2 rounded-[12px] border border-white/[0.07] bg-white/[0.02] p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] text-[#F0EFEC]/45">Modalidade</label>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as 'online' | 'presencial')}
                className="w-full rounded-[8px] border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-[12.5px] text-[#F0EFEC]/85 focus:outline-none"
              >
                <option value="presencial" className="bg-[#1A1A1A]">Presencial</option>
                <option value="online" className="bg-[#1A1A1A]">Online</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#F0EFEC]/45">Duração (min)</label>
              <input
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                inputMode="numeric"
                className="w-full rounded-[8px] border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-[12.5px] text-[#F0EFEC]/85 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#F0EFEC]/45">Data</label>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-[8px] border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-[12.5px] text-[#F0EFEC]/85 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#F0EFEC]/45">Hora</label>
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="w-full rounded-[8px] border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-[12.5px] text-[#F0EFEC]/85 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#F0EFEC]/45">Entrevistador</label>
              <input
                value={interviewer}
                onChange={(event) => setInterviewer(event.target.value)}
                placeholder="Quem conduz"
                className="w-full rounded-[8px] border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-[12.5px] text-[#F0EFEC]/85 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#F0EFEC]/45">{mode === 'online' ? 'Link da reunião' : 'Local'}</label>
              <input
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                className="w-full rounded-[8px] border border-white/[0.07] bg-white/[0.02] px-2 py-1.5 text-[12.5px] text-[#F0EFEC]/85 focus:outline-none"
              />
            </div>
          </div>
          {error ? <p className="text-[11.5px] text-red-300/80">{error}</p> : null}
          <div className="flex justify-end">
            <RhPrimaryButton onClick={() => void schedule()} disabled={saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Agendar entrevista
            </RhPrimaryButton>
          </div>
        </div>
      ) : null}

      {upcoming.length === 0 ? (
        <p className="text-[12.5px] text-[#F0EFEC]/35">Nenhuma entrevista marcada.</p>
      ) : (
        <div className="space-y-2">
          {upcoming.map((interview) => (
            <div key={interview.id} className="rounded-[10px] border border-white/[0.05] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] text-[#F0EFEC]/80">
                    {new Date(interview.scheduled_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}{' '}
                    · {interview.mode === 'online' ? 'Online' : 'Presencial'}
                    <span className="ml-1.5 text-[11px] text-[#F0EFEC]/35">{interview.duration_minutes} min</span>
                  </p>
                  <p className="mt-0.5 truncate text-[11.5px] text-[#F0EFEC]/40">
                    {[interview.interviewer, interview.location, interview.meeting_url].filter(Boolean).join(' · ') ||
                      'Sem detalhes'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <select
                    value={interview.result ?? ''}
                    onChange={(event) => void setResult(interview, event.target.value)}
                    className="rounded-[8px] border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-[11.5px] text-[#F0EFEC]/70 focus:outline-none"
                  >
                    <option value="" className="bg-[#1A1A1A]">Resultado…</option>
                    <option value="bom" className="bg-[#1A1A1A]">Bom</option>
                    <option value="grande" className="bg-[#1A1A1A]">Ótimo</option>
                    <option value="ruim" className="bg-[#1A1A1A]">Ruim</option>
                    <option value="no_show" className="bg-[#1A1A1A]">Não compareceu</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void remove(interview)}
                    aria-label="Excluir entrevista"
                    className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/30 hover:bg-red-400/10 hover:text-red-300"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              {interview.result ? (
                <span className="mt-2 inline-block rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10.5px] text-[#F0EFEC]/60 uppercase">
                  {interview.result}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </RhCard>
  )
}

function NotesSection({
  notes,
  applicationId,
  authorName,
  onChanged
}: {
  notes: RhApplicationDetail['notes']
  applicationId: string
  authorName: string
  onChanged: () => void
}) {
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add(): Promise<void> {
    if (!content.trim()) return
    setSaving(true)
    setError(null)
    try {
      await addInternalNote(applicationId, content.trim(), authorName)
      setContent('')
      onChanged()
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : 'Erro ao salvar a observação.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <RhCard className="p-4">
      <h2 className="mb-1 text-[13px] font-semibold text-[#F0EFEC]/80">
        Observações internas
        <span className="ml-2 rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] font-medium tracking-wide text-[#F0EFEC]/45 uppercase">
          privado · só o RH vê
        </span>
      </h2>
      <div className="mt-2 flex gap-2">
        <input
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void add()
          }}
          placeholder="Registrar observação sobre o candidato…"
          className="min-w-0 flex-1 rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[12.5px] text-[#F0EFEC]/85 placeholder:text-[#F0EFEC]/28 focus:outline-none"
        />
        <RhGhostButton onClick={() => void add()} disabled={saving || !content.trim()}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Salvar
        </RhGhostButton>
      </div>
      {error ? <p className="mt-1.5 text-[11.5px] text-red-300/80">{error}</p> : null}
      {notes.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-[#F0EFEC]/35">Nenhuma observação interna ainda.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {[...notes].reverse().map((note) => (
            <div key={note.id} className="rounded-[10px] border border-white/[0.05] bg-white/[0.02] p-2.5">
              <p className="text-[12.5px] whitespace-pre-wrap text-[#F0EFEC]/80">{note.content}</p>
              <p className="mt-1 text-[10.5px] text-[#F0EFEC]/30">
                {note.author_name ?? 'RH'} · {new Date(note.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </RhCard>
  )
}

/** Preview do currículo DENTRO do FLOW (overlay sobre a página do candidato). */
function ResumePreviewOverlay({
  url,
  fileName,
  onClose
}: {
  url: string
  fileName: string
  onClose: () => void
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col rounded-[18px] bg-[#111111]/97 backdrop-blur-sm">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <FileText className="size-4 text-[#F0EFEC]/45" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-[#F0EFEC]/75">{fileName}</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-[8px] border border-white/[0.08] px-2.5 py-1 text-[11.5px] text-[#F0EFEC]/60 transition hover:bg-white/[0.05]"
        >
          Abrir externo
        </a>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[8px] bg-[#F0EFEC] px-2.5 py-1 text-[11.5px] font-medium text-[#111111]"
        >
          Fechar
        </button>
      </div>
      <iframe src={url} title={fileName} className="min-h-0 flex-1 bg-white" />
    </div>
  )
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}
