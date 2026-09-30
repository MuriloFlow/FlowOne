import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Pause, Play, Plus, Search, Settings2, Trash2 } from 'lucide-react'
import {
  createJob,
  createQuestion,
  deleteJob,
  deleteQuestion,
  fetchJobApplicationsCounts,
  fetchJobs,
  fetchQuestions,
  updateJob,
  updateQuestion
} from '@/lib/rh/api'
import {
  EMPLOYMENT_TYPE_LABEL,
  JOB_STATUS_META,
  QUESTION_TYPE_LABEL,
  type RhEmploymentType,
  type RhJob,
  type RhJobStatus,
  type RhQuestion,
  type RhQuestionType,
  type RhOption
} from '@/lib/rh/types'
import {
  RhCard,
  RhEmptyState,
  RhErrorState,
  RhGhostButton,
  RhJobStatusChip,
  RhPageHeader,
  RhPrimaryButton,
  RhSkeleton
} from './rh-ui'

type JobsListProps = {
  onNewJob: () => void
  onEditJob: (jobId: string) => void
}

export function RhJobsPage({ onNewJob, onEditJob }: JobsListProps) {
  const [jobs, setJobs] = useState<RhJob[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<RhJobStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [jobsData, countsData] = await Promise.all([fetchJobs(), fetchJobApplicationsCounts()])
      setJobs(jobsData)
      setCounts(countsData)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar vagas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return jobs.filter((job) => {
      if (statusFilter !== 'all' && job.status !== statusFilter) return false
      if (!term) return true
      return [job.title, job.department, job.location].join(' ').toLowerCase().includes(term)
    })
  }, [jobs, query, statusFilter])

  async function toggleStatus(job: RhJob): Promise<void> {
    setBusyId(job.id)
    try {
      const next: RhJobStatus = job.status === 'open' ? 'paused' : 'open'
      await updateJob(job.id, { status: next })
      setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, status: next } : item)))
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Erro ao atualizar a vaga.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(job: RhJob): Promise<void> {
    if (!window.confirm(`Excluir a vaga "${job.title}"? Esta ação não pode ser desfeita.`)) return
    setBusyId(job.id)
    try {
      await deleteJob(job.id)
      setJobs((current) => current.filter((item) => item.id !== job.id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Erro ao excluir a vaga.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RhPageHeader
        title="Vagas"
        subtitle="Crie, publique, pause e organize as oportunidades."
        action={
          <RhPrimaryButton onClick={onNewJob}>
            <Plus className="size-3.5" /> Nova Vaga
          </RhPrimaryButton>
        }
      />

      {error ? <RhErrorState message={error} onRetry={() => void load()} /> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#F0EFEC]/30" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por cargo, área ou local"
            className="h-9 w-full rounded-[10px] border border-white/[0.06] bg-white/[0.02] pr-3 pl-9 text-[13px] text-[#F0EFEC]/85 placeholder:text-[#F0EFEC]/30 focus:border-white/15 focus:outline-none"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'open', 'paused', 'closed'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`h-8 rounded-[8px] px-3 text-[12px] font-medium transition ${
                statusFilter === status
                  ? 'bg-[#F0EFEC] text-[#111111]'
                  : 'border border-white/[0.07] text-[#F0EFEC]/50 hover:text-[#F0EFEC]/80'
              }`}
            >
              {status === 'all' ? 'Todas' : JOB_STATUS_META[status].label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <RhSkeleton className="h-[72px]" />
          <RhSkeleton className="h-[72px]" />
          <RhSkeleton className="h-[72px]" />
        </div>
      ) : filtered.length === 0 ? (
        <RhEmptyState
          title={jobs.length === 0 ? 'Nenhuma vaga criada' : 'Nada encontrado'}
          description={
            jobs.length === 0
              ? 'Crie a primeira vaga — ela aparece no portal público assim que publicada.'
              : 'Ajuste a busca ou o filtro de status.'
          }
          action={jobs.length === 0 ? <RhPrimaryButton onClick={onNewJob}>+ Nova Vaga</RhPrimaryButton> : undefined}
        />
      ) : (
        <div className="space-y-2 pb-2">
          {filtered.map((job) => (
            <RhCard key={job.id} className="p-4 transition hover:border-white/[0.09]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[14.5px] font-medium text-[#F0EFEC]/88">{job.title}</h3>
                    <RhJobStatusChip status={job.status} />
                  </div>
                  <p className="mt-1 truncate text-[12px] text-[#F0EFEC]/38">
                    {[
                      job.department,
                      job.location,
                      job.work_model,
                      EMPLOYMENT_TYPE_LABEL[job.employment_type],
                      job.openings > 1 ? `${job.openings} posições` : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="mt-1 text-[11.5px] text-[#F0EFEC]/30">
                    Criada em {new Date(job.created_at).toLocaleDateString('pt-BR')} · {counts[job.id] ?? 0}{' '}
                    {(counts[job.id] ?? 0) === 1 ? 'candidatura' : 'candidaturas'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <RhGhostButton onClick={() => toggleStatus(job)} disabled={busyId === job.id}>
                    {busyId === job.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : job.status === 'open' ? (
                      <Pause className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    {job.status === 'open' ? 'Pausar' : job.status === 'paused' ? 'Reabrir' : 'Publicar'}
                  </RhGhostButton>
                  <RhGhostButton onClick={() => onEditJob(job.id)}>
                    <Pencil className="size-3.5" /> Editar
                  </RhGhostButton>
                  <button
                    type="button"
                    onClick={() => remove(job)}
                    disabled={busyId === job.id}
                    aria-label="Excluir vaga"
                    className="flex size-8 items-center justify-center rounded-[8px] text-[#F0EFEC]/35 transition hover:bg-red-400/10 hover:text-red-300"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </RhCard>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// PÁGINA PRÓPRIA DE EDIÇÃO/PERGUNTAS DA VAGA
// ============================================================

type JobEditorProps = {
  jobId: string
  onBack: () => void
  onSaved?: () => void
}

const EMPTY_FORM = {
  title: '',
  department: '',
  location: '',
  work_model: 'Presencial',
  employment_type: 'CLT' as RhEmploymentType,
  status: 'draft' as RhJobStatus,
  description: '',
  responsibilities: '',
  requirements: '',
  benefits: '',
  salary_min: '',
  salary_max: '',
  salary_visible: false,
  openings: '1'
}

export function RhJobEditorPage({ jobId, onBack, onSaved }: JobEditorProps) {
  const isNew = jobId === 'new'
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : jobId)
  const [questions, setQuestions] = useState<RhQuestion[]>([])

  useEffect(() => {
    if (isNew) {
      setLoading(false)
      return
    }
    let active = true
    void (async () => {
      try {
        const jobs = await fetchJobs()
        const job = jobs.find((item) => item.id === jobId)
        if (!job) throw new Error('Vaga não encontrada.')
        if (!active) return
        setForm({
          title: job.title,
          department: job.department ?? '',
          location: job.location ?? '',
          work_model: job.work_model,
          employment_type: job.employment_type,
          status: job.status,
          description: job.description ?? '',
          responsibilities: (job.responsibilities ?? []).join('\n'),
          requirements: (job.requirements ?? []).join('\n'),
          benefits: (job.benefits ?? []).join('\n'),
          salary_min: job.salary_min != null ? String(job.salary_min) : '',
          salary_max: job.salary_max != null ? String(job.salary_max) : '',
          salary_visible: job.salary_visible,
          openings: String(job.openings ?? 1)
        })
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar a vaga.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [isNew, jobId])

  const loadQuestions = useCallback(async () => {
    if (!savedId) return
    try {
      const all = await fetchQuestions()
      setQuestions(all.filter((question) => question.scope === 'JOB' && question.job_id === savedId))
    } catch {
      /* perguntas falham de forma não-fatal */
    }
  }, [savedId])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(): Promise<void> {
    if (!form.title.trim()) {
      setError('Informe o cargo da vaga.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const toLines = (value: string): string[] =>
        value
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
      const payload = {
        title: form.title.trim(),
        department: form.department.trim() || null,
        location: form.location.trim() || null,
        work_model: form.work_model || 'Presencial',
        employment_type: form.employment_type,
        status: form.status,
        description: form.description.trim() || null,
        responsibilities: toLines(form.responsibilities),
        requirements: toLines(form.requirements),
        benefits: toLines(form.benefits),
        salary_min: form.salary_min ? Number(form.salary_min) : null,
        salary_max: form.salary_max ? Number(form.salary_max) : null,
        salary_visible: form.salary_visible,
        openings: Math.max(1, Number(form.openings) || 1)
      }
      if (savedId) {
        await updateJob(savedId, payload)
      } else {
        const created = await createJob(payload)
        setSavedId(created.id)
      }
      onSaved?.()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar a vaga.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <RhSkeleton className="h-8 w-56" />
        <RhSkeleton className="h-[420px]" />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-[#F0EFEC]/50 transition hover:bg-white/[0.05] hover:text-[#F0EFEC]/85"
            aria-label="Voltar"
          >
            ←
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-[20px] text-[#F0EFEC]/88">
              {isNew ? 'Nova vaga' : form.title || 'Editar vaga'}
            </h1>
            <p className="text-[12px] text-[#F0EFEC]/35">
              {isNew ? 'Preencha as informações e salve para configurar perguntas.' : 'Edição completa da vaga e perguntas específicas.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savedId ? (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-white/[0.08] bg-white/[0.03] px-3.5 text-[13px] font-medium text-[#F0EFEC]/75 transition hover:bg-white/[0.06] disabled:opacity-40"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar
            </button>
          ) : null}
          <RhPrimaryButton onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {savedId ? 'Salvar e fechar' : 'Criar vaga'}
          </RhPrimaryButton>
        </div>
      </header>

      {error ? <RhErrorState message={error} /> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pb-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] p-4">
          <h2 className="mb-4 text-[13px] font-semibold text-[#F0EFEC]/80">Informações da vaga</h2>
          <div className="space-y-3">
            <Field label="Cargo *">
              <input
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                placeholder="Ex.: Vendedor(a) de loja"
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Área / Departamento">
                <input value={form.department} onChange={(event) => set('department', event.target.value)} placeholder="Ex.: Loja" className={inputClass} />
              </Field>
              <Field label="Local">
                <input value={form.location} onChange={(event) => set('location', event.target.value)} placeholder="Ex.: Ribeirão Pires - SP" className={inputClass} />
              </Field>
            </div>
            <Field label="Descrição">
              <textarea
                value={form.description}
                onChange={(event) => set('description', event.target.value)}
                rows={4}
                placeholder="Conte sobre a oportunidade, rotina e diferenciais."
                className={inputClass}
              />
            </Field>
            <Field label="Responsabilidades (uma por linha)">
              <textarea value={form.responsibilities} onChange={(event) => set('responsibilities', event.target.value)} rows={3} className={inputClass} />
            </Field>
            <Field label="Requisitos (uma por linha)">
              <textarea value={form.requirements} onChange={(event) => set('requirements', event.target.value)} rows={3} className={inputClass} />
            </Field>
            <Field label="Benefícios (uma por linha)">
              <textarea value={form.benefits} onChange={(event) => set('benefits', event.target.value)} rows={3} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Faixa salarial mín. (R$)">
                <input value={form.salary_min} onChange={(event) => set('salary_min', event.target.value)} inputMode="decimal" placeholder="0,00" className={inputClass} />
              </Field>
              <Field label="Faixa salarial máx. (R$)">
                <input value={form.salary_max} onChange={(event) => set('salary_max', event.target.value)} inputMode="decimal" placeholder="0,00" className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo de contrato">
                <select
                  value={form.employment_type}
                  onChange={(event) => set('employment_type', event.target.value as RhEmploymentType)}
                  className={inputClass}
                >
                  {(Object.keys(EMPLOYMENT_TYPE_LABEL) as RhEmploymentType[]).map((type) => (
                    <option key={type} value={type} className="bg-[#1A1A1A]">
                      {EMPLOYMENT_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modelo de trabalho">
                <select value={form.work_model} onChange={(event) => set('work_model', event.target.value)} className={inputClass}>
                  {['Presencial', 'Híbrido', 'Remoto'].map((model) => (
                    <option key={model} value={model} className="bg-[#1A1A1A]">
                      {model}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Posições">
                <input value={form.openings} onChange={(event) => set('openings', event.target.value)} inputMode="numeric" className={inputClass} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={(event) => set('status', event.target.value as RhJobStatus)} className={inputClass}>
                  {(Object.keys(JOB_STATUS_META) as RhJobStatus[]).map((status) => (
                    <option key={status} value={status} className="bg-[#1A1A1A]">
                      {JOB_STATUS_META[status].label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#F0EFEC]/60">
              <input
                type="checkbox"
                checked={form.salary_visible}
                onChange={(event) => set('salary_visible', event.target.checked)}
                className="size-3.5 accent-[#F0EFEC]"
              />
              Exibir faixa salarial no portal público
            </label>
          </div>
        </section>

        <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#F0EFEC]/80">Perguntas específicas da vaga</h2>
            {!savedId ? <span className="text-[11px] text-[#F0EFEC]/30">Salve a vaga para configurar</span> : null}
          </div>
          {!savedId ? (
            <p className="py-8 text-center text-[12.5px] text-[#F0EFEC]/35">
              Crie a vaga para adicionar perguntas específicas. As perguntas globais já se aplicam automaticamente.
            </p>
          ) : (
            <JobQuestionsPanel jobId={savedId} questions={questions} onChanged={() => void loadQuestions()} />
          )}
        </section>
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[13px] text-[#F0EFEC]/85 placeholder:text-[#F0EFEC]/28 focus:border-white/15 focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-medium text-[#F0EFEC]/45">{label}</label>
      {children}
    </div>
  )
}

// ---------- Perguntas da vaga (painel embutido na edição) ----------

function JobQuestionsPanel({
  jobId,
  questions,
  onChanged
}: {
  jobId: string
  questions: RhQuestion[]
  onChanged: () => void
}) {
  const [creating, setCreating] = useState(false)

  async function remove(question: RhQuestion): Promise<void> {
    if (!window.confirm('Remover esta pergunta da vaga?')) return
    await deleteQuestion(question.id).catch(() => undefined)
    onChanged()
  }

  async function toggleActive(question: RhQuestion): Promise<void> {
    await updateQuestion(question.id, { active: !question.active }).catch(() => undefined)
    onChanged()
  }

  return (
    <div className="space-y-2">
      {questions.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-[#F0EFEC]/35">
          Nenhuma pergunta específica. As globais continuam valendo para esta vaga.
        </p>
      ) : (
        questions.map((question) => (
          <div key={question.id} className="rounded-[12px] border border-white/[0.05] bg-white/[0.02] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] text-[#F0EFEC]/82">{question.label}</p>
                <p className="mt-0.5 text-[11px] text-[#F0EFEC]/32">
                  {QUESTION_TYPE_LABEL[question.type]} · {question.required ? 'obrigatória' : 'opcional'} ·{' '}
                  {question.active ? 'ativa' : 'desativada'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void toggleActive(question)}
                  className="rounded-[7px] border border-white/[0.07] px-2 py-1 text-[11px] text-[#F0EFEC]/55 hover:bg-white/[0.05]"
                >
                  {question.active ? 'Desativar' : 'Ativar'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(question)}
                  aria-label="Remover pergunta"
                  className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/30 hover:bg-red-400/10 hover:text-red-300"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      {creating ? (
        <QuestionFormInline
          jobId={jobId}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            onChanged()
          }}
        />
      ) : (
        <RhGhostButton onClick={() => setCreating(true)} className="w-full">
          <Plus className="size-3.5" /> Adicionar pergunta à vaga
        </RhGhostButton>
      )}
    </div>
  )
}

function QuestionFormInline({
  jobId,
  onCancel,
  onCreated
}: {
  jobId: string
  onCancel: () => void
  onCreated: () => void
}) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState<RhQuestionType>('TEXT')
  const [required, setRequired] = useState(true)
  const [helpText, setHelpText] = useState('')
  const [options, setOptions] = useState<Array<{ label: string; points: string; disqualify: boolean }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsOptions = type === 'SELECT' || type === 'MULTISELECT'

  async function submit(): Promise<void> {
    if (!label.trim()) {
      setError('Informe o enunciado da pergunta.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const parsedOptions: RhOption[] = needsOptions
        ? options
            .filter((option) => option.label.trim())
            .map((option, index) => ({
              value: option.label
                .trim()
                .toLowerCase()
                .replace(/\s+/g, '_')
                .slice(0, 40),
              label: option.label.trim(),
              points: Number(option.points) || 0,
              effect: option.disqualify ? 'DISQUALIFY' : 'NONE',
              order_index: index
            }))
        : []
      await createQuestion({
        scope: 'JOB',
        job_id: jobId,
        type,
        label: label.trim(),
        placeholder: null,
        help_text: helpText.trim() || null,
        required,
        order_index: 90,
        active: true,
        options: parsedOptions
      })
      onCreated()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Erro ao criar pergunta.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-[12px] border border-white/[0.08] bg-white/[0.02] p-3">
      <Field label="Enunciado *">
        <input value={label} onChange={(event) => setLabel(event.target.value)} className={inputClass} placeholder="Ex.: Tem experiência com vendas?" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tipo">
          <select value={type} onChange={(event) => setType(event.target.value as RhQuestionType)} className={inputClass}>
            {(Object.keys(QUESTION_TYPE_LABEL) as RhQuestionType[])
              .filter((questionType) => questionType !== 'FILE')
              .map((questionType) => (
                <option key={questionType} value={questionType} className="bg-[#1A1A1A]">
                  {QUESTION_TYPE_LABEL[questionType]}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Obrigatoriedade">
          <select value={required ? 'yes' : 'no'} onChange={(event) => setRequired(event.target.value === 'yes')} className={inputClass}>
            <option value="yes" className="bg-[#1A1A1A]">Obrigatória</option>
            <option value="no" className="bg-[#1A1A1A]">Opcional</option>
          </select>
        </Field>
      </div>
      <Field label="Texto de ajuda (opcional)">
        <input value={helpText} onChange={(event) => setHelpText(event.target.value)} className={inputClass} />
      </Field>
      {needsOptions ? (
        <div className="space-y-2">
          <label className="block text-[12px] font-medium text-[#F0EFEC]/45">Opções (pontos e eliminação)</label>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={option.label}
                onChange={(event) =>
                  setOptions((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))
                }
                placeholder={`Opção ${index + 1}`}
                className={`${inputClass} flex-1`}
              />
              <input
                value={option.points}
                onChange={(event) =>
                  setOptions((current) => current.map((item, i) => (i === index ? { ...item, points: event.target.value } : item)))
                }
                placeholder="pts"
                inputMode="numeric"
                className={`${inputClass} w-16`}
              />
              <label className="flex shrink-0 items-center gap-1 text-[11px] text-[#F0EFEC]/45">
                <input
                  type="checkbox"
                  checked={option.disqualify}
                  onChange={(event) =>
                    setOptions((current) => current.map((item, i) => (i === index ? { ...item, disqualify: event.target.checked } : item)))
                  }
                  className="size-3 accent-[#F0EFEC]"
                />
                elimina
              </label>
              <button
                type="button"
                onClick={() => setOptions((current) => current.filter((_, i) => i !== index))}
                className="text-[#F0EFEC]/30 hover:text-red-300"
                aria-label="Remover opção"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <RhGhostButton onClick={() => setOptions((current) => [...current, { label: '', points: '0', disqualify: false }])}>
            <Settings2 className="size-3.5" /> Adicionar opção
          </RhGhostButton>
        </div>
      ) : null}
      {error ? <p className="text-[12px] text-red-400/80">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <RhGhostButton onClick={onCancel}>Cancelar</RhGhostButton>
        <RhPrimaryButton onClick={() => void submit()} disabled={saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Adicionar
        </RhPrimaryButton>
      </div>
    </div>
  )
}
