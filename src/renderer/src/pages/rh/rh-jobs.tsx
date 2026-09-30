import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Pencil, Pause, Play, Plus, Search, Trash2 } from 'lucide-react'
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
  type RhOption,
  type RhQuestion,
  type RhQuestionType
} from '@/lib/rh/types'
import { Dialog } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  RhCard,
  RhEmptyState,
  RhErrorState,
  RhField,
  RhGhostButton,
  RhInput,
  RhJobStatusChip,
  RhOrderedList,
  RhPageHeader,
  RhPrimaryButton,
  RhSelect,
  RhSkeleton,
  RhTextarea
} from './rh-ui'

type JobsListProps = {
  onNewJob: () => void
  onEditJob: (jobId: string) => void
}

const STATUS_OPTIONS = (Object.keys(JOB_STATUS_META) as RhJobStatus[]).map((status) => ({
  value: status,
  label: JOB_STATUS_META[status].label
}))

const EMPLOYMENT_OPTIONS = (Object.keys(EMPLOYMENT_TYPE_LABEL) as RhEmploymentType[]).map((type) => ({
  value: type,
  label: EMPLOYMENT_TYPE_LABEL[type]
}))

const WORK_MODEL_OPTIONS = ['Presencial', 'Híbrido', 'Remoto'].map((model) => ({ value: model, label: model }))

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
        <RhSelect
          value={statusFilter}
          placeholder="Todas"
          options={[{ value: 'all', label: 'Todas' }, ...STATUS_OPTIONS]}
          onChange={(value) => setStatusFilter(value as RhJobStatus | 'all')}
          className="w-[150px]"
        />
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

type JobForm = {
  title: string
  department: string
  location: string
  work_model: string
  employment_type: RhEmploymentType
  status: RhJobStatus
  description: string
  responsibilities: string
  requirements: string
  benefits: string
  salary_min: string
  salary_max: string
  salary_visible: boolean
  openings: string
}

const EMPTY_FORM: JobForm = {
  title: '',
  department: '',
  location: '',
  work_model: 'Presencial',
  employment_type: 'CLT',
  status: 'draft',
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
  const [form, setForm] = useState<JobForm>({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : jobId)
  const [questions, setQuestions] = useState<RhQuestion[]>([])
  const [questionModal, setQuestionModal] = useState(false)

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
      setQuestions(
        all
          .filter((question) => question.scope === 'JOB' && question.job_id === savedId)
          .sort((left, right) => left.order_index - right.order_index)
      )
    } catch {
      /* perguntas falham de forma não-fatal */
    }
  }, [savedId])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  function set<K extends keyof JobForm>(key: K, value: JobForm[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
  }

  async function submit(): Promise<boolean> {
    if (!form.title.trim()) {
      setError('Informe o cargo da vaga.')
      return false
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
        salary_min: form.salary_min ? Number(form.salary_min.replace(',', '.')) : null,
        salary_max: form.salary_max ? Number(form.salary_max.replace(',', '.')) : null,
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
      return true
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Erro ao salvar a vaga.')
      return false
    } finally {
      setSaving(false)
    }
  }

  function moveQuestion(from: number, to: number): void {
    if (to < 0 || to >= questions.length) return
    const next = [...questions]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setQuestions(next)
    void Promise.all(
      next.map((question, index) =>
        updateQuestion(question.id, { order_index: index }).catch(() => undefined)
      )
    ).then(() => undefined)
  }

  async function removeQuestion(question: RhQuestion): Promise<void> {
    if (!window.confirm('Remover esta pergunta da vaga?')) return
    await deleteQuestion(question.id).catch(() => undefined)
    void loadQuestions()
  }

  async function toggleQuestion(question: RhQuestion): Promise<void> {
    await updateQuestion(question.id, { active: !question.active }).catch(() => undefined)
    void loadQuestions()
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
              {isNew
                ? 'Preencha os dados e salve para configurar as perguntas.'
                : 'Edição completa da vaga, perguntas e ordem.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RhGhostButton onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar rascunho
          </RhGhostButton>
          <RhPrimaryButton
            onClick={async () => {
              const ok = await submit()
              if (ok) onBack()
            }}
            disabled={saving}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {savedId ? 'Salvar e voltar' : 'Criar vaga'}
          </RhPrimaryButton>
        </div>
      </header>

      {error ? <RhErrorState message={error} /> : null}

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-4">
        {/* ---------- Identificação ---------- */}
        <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
          <h2 className="mb-4 text-[15px] text-[#F0EFEC]/82">Identificação da vaga</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <RhField label="Cargo *" className="lg:col-span-2">
              <RhInput value={form.title} onChange={(value) => set('title', value)} placeholder="Ex.: Vendedor(a) de loja" />
            </RhField>
            <RhField label="Área / Departamento">
              <RhInput value={form.department} onChange={(value) => set('department', value)} placeholder="Ex.: Loja" />
            </RhField>
            <RhField label="Local">
              <RhInput value={form.location} onChange={(value) => set('location', value)} placeholder="Ex.: Ribeirão Pires - SP" />
            </RhField>
            <RhField label="Modelo de trabalho">
              <RhSelect value={form.work_model} options={WORK_MODEL_OPTIONS} onChange={(value) => set('work_model', value)} />
            </RhField>
            <RhField label="Tipo de contrato">
              <RhSelect
                value={form.employment_type}
                options={EMPLOYMENT_OPTIONS}
                onChange={(value) => set('employment_type', value as RhEmploymentType)}
              />
            </RhField>
          </div>
        </section>

        {/* ---------- Descrição ---------- */}
        <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
          <h2 className="mb-4 text-[15px] text-[#F0EFEC]/82">Descrição e requisitos</h2>
          <div className="space-y-3">
            <RhField label="Descrição da oportunidade" hint="Texto que abre a página da vaga no portal público.">
              <RhTextarea
                value={form.description}
                onChange={(value) => set('description', value)}
                rows={4}
                placeholder="Conte sobre a oportunidade, rotina e diferenciais."
              />
            </RhField>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <RhField label="Responsabilidades" hint="Uma por linha.">
                <RhTextarea value={form.responsibilities} onChange={(value) => set('responsibilities', value)} rows={5} />
              </RhField>
              <RhField label="Requisitos" hint="Uma por linha.">
                <RhTextarea value={form.requirements} onChange={(value) => set('requirements', value)} rows={5} />
              </RhField>
              <RhField label="Benefícios" hint="Uma por linha.">
                <RhTextarea value={form.benefits} onChange={(value) => set('benefits', value)} rows={5} />
              </RhField>
            </div>
          </div>
        </section>

        {/* ---------- Publicação ---------- */}
        <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
          <h2 className="mb-4 text-[15px] text-[#F0EFEC]/82">Publicação</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RhField label="Status">
              <RhSelect value={form.status} options={STATUS_OPTIONS} onChange={(value) => set('status', value as RhJobStatus)} />
            </RhField>
            <RhField label="Posições">
              <RhInput value={form.openings} onChange={(value) => set('openings', value.replace(/\D/g, ''))} inputMode="numeric" />
            </RhField>
            <RhField label="Salário mín. (R$)">
              <RhInput value={form.salary_min} onChange={(value) => set('salary_min', value)} inputMode="decimal" placeholder="0,00" />
            </RhField>
            <RhField label="Salário máx. (R$)">
              <RhInput value={form.salary_max} onChange={(value) => set('salary_max', value)} inputMode="decimal" placeholder="0,00" />
            </RhField>
          </div>
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12.5px] text-[#F0EFEC]/60">
            <input
              type="checkbox"
              checked={form.salary_visible}
              onChange={(event) => set('salary_visible', event.target.checked)}
              className="size-3.5 accent-[#F0EFEC]"
            />
            Exibir faixa salarial no portal público
          </label>
        </section>

        {/* ---------- Perguntas específicas ---------- */}
        <section className="rounded-[16px] border border-white/[0.045] bg-[#1A1A1A] px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] text-[#F0EFEC]/82">Perguntas específicas da vaga</h2>
              <p className="mt-1 text-[12px] text-[#F0EFEC]/35">
                {savedId
                  ? 'A ordem aqui é a ordem do formulário público. As globais entram antes.'
                  : 'Salve a vaga para configurar as perguntas.'}
              </p>
            </div>
            {savedId ? (
              <RhPrimaryButton onClick={() => setQuestionModal(true)}>
                <Plus className="size-3.5" /> Criar pergunta
              </RhPrimaryButton>
            ) : null}
          </div>
          {!savedId ? (
            <p className="py-6 text-center text-[12.5px] text-[#F0EFEC]/35">
              Crie a vaga para adicionar perguntas específicas. As perguntas globais já se aplicam automaticamente.
            </p>
          ) : questions.length === 0 ? (
            <p className="py-6 text-center text-[12.5px] text-[#F0EFEC]/35">
              Nenhuma pergunta específica. Use “Criar pergunta” — as globais continuam valendo para esta vaga.
            </p>
          ) : (
            <RhOrderedList
              items={questions}
              onMove={moveQuestion}
              onRemove={(question) => void removeQuestion(question)}
              render={(question) => (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[#F0EFEC]/82">{question.label}</span>
                  <span className="shrink-0 text-[11px] text-[#F0EFEC]/32">
                    {QUESTION_TYPE_LABEL[question.type]} · {question.required ? 'obrigatória' : 'opcional'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggleQuestion(question)}
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold tracking-wide uppercase transition ${
                      question.active
                        ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200/90'
                        : 'border-white/10 bg-white/[0.05] text-[#F0EFEC]/45'
                    }`}
                  >
                    {question.active ? 'ativa' : 'off'}
                  </button>
                </div>
              )}
            />
          )}
        </section>
      </div>

      {/* ---------- MODAL: criar pergunta da vaga ---------- */}
      <QuestionModal
        open={questionModal}
        title="Nova pergunta da vaga"
        onClose={() => setQuestionModal(false)}
        onSubmit={async (input) => {
          await createQuestion({ ...input, scope: 'JOB', job_id: savedId })
          void loadQuestions()
        }}
      />
    </div>
  )
}

// ============================================================
// MODAL de pergunta (mesmo padrão Dialog do launcher) — reutilizado
// nas Configurações (globais) também.
// ============================================================

export type QuestionFormOutput = {
  type: RhQuestionType
  label: string
  placeholder: string | null
  help_text: string | null
  required: boolean
  order_index: number
  active: boolean
  options: RhOption[]
  true_points?: number
}

export function QuestionModal({
  open,
  title,
  initial,
  onClose,
  onSubmit
}: {
  open: boolean
  title: string
  initial?: { label: string; type: RhQuestionType; required: boolean; help_text: string | null; options: RhOption[]; true_points?: number } | null
  onClose: () => void
  onSubmit: (input: QuestionFormOutput) => Promise<void>
}) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState<RhQuestionType>('TEXT')
  const [required, setRequired] = useState(true)
  const [helpText, setHelpText] = useState('')
  const [truePoints, setTruePoints] = useState('10')
  const [options, setOptions] = useState<Array<{ id: string; label: string; points: string; disqualify: boolean }>>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsOptions = type === 'SELECT' || type === 'MULTISELECT'

  useEffect(() => {
    if (!open) return
    setLabel(initial?.label ?? '')
    setType(initial?.type ?? 'TEXT')
    setRequired(initial?.required ?? true)
    setHelpText(initial?.help_text ?? '')
    setTruePoints(String(initial?.true_points ?? 10))
    setOptions(
      (initial?.options ?? []).map((option, index) => ({
        id: `opt-${index}`,
        label: option.label,
        points: String(option.points),
        disqualify: option.effect === 'DISQUALIFY'
      }))
    )
    setError(null)
    setSaving(false)
  }, [open, initial])

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
      await onSubmit({
        type,
        label: label.trim(),
        placeholder: null,
        help_text: helpText.trim() || null,
        required,
        order_index: 90,
        active: true,
        options: parsedOptions,
        true_points: type === 'BOOLEAN' ? Number(truePoints) || 0 : undefined
      })
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erro ao salvar a pergunta.')
    } finally {
      setSaving(false)
    }
  }

  const TYPE_OPTIONS = (Object.keys(QUESTION_TYPE_LABEL) as RhQuestionType[])
    .filter((questionType) => questionType !== 'FILE')
    .map((questionType) => ({ value: questionType, label: QUESTION_TYPE_LABEL[questionType] }))

  return (
    <Dialog open={open} title={title} description="A pergunta entra no formulário público na ordem configurada." onClose={onClose} wide>
      <div className="space-y-3.5 px-5 pb-5">
        <RhField label="Enunciado *">
          <RhInput value={label} onChange={setLabel} placeholder="Ex.: Tem experiência com vendas?" />
        </RhField>
        <div className="grid grid-cols-2 gap-3">
          <RhField label="Tipo de resposta">
            <RhSelect value={type} options={TYPE_OPTIONS} onChange={(value) => setType(value as RhQuestionType)} />
          </RhField>
          <RhField label="Obrigatoriedade">
            <RhSelect
              value={required ? 'yes' : 'no'}
              options={[
                { value: 'yes', label: 'Obrigatória' },
                { value: 'no', label: 'Opcional' }
              ]}
              onChange={(value) => setRequired(value === 'yes')}
            />
          </RhField>
        </div>
        <RhField label="Texto de ajuda (opcional)">
          <RhInput value={helpText} onChange={setHelpText} placeholder="Dica exibida abaixo do campo" />
        </RhField>
        {type === 'BOOLEAN' ? (
          <RhField label="Pontos ao responder “Sim”" hint="A resposta “Não” não pontua.">
            <RhInput value={truePoints} onChange={(value) => setTruePoints(value.replace(/\D/g, ''))} inputMode="numeric" />
          </RhField>
        ) : null}
        {needsOptions ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[12px] text-[#F0EFEC]/45">Opções (pontos e eliminação)</Label>
              <RhGhostButton
                onClick={() => setOptions((current) => [...current, { id: `opt-${Date.now()}`, label: '', points: '0', disqualify: false }])}
              >
                <Plus className="size-3.5" /> Opção
              </RhGhostButton>
            </div>
            {options.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-white/[0.07] py-4 text-center text-[12px] text-[#F0EFEC]/35">
                Adicione as opções — cada uma pode somar pontos ou eliminar o candidato.
              </p>
            ) : (
              <div className="space-y-1.5">
                {options.map((option, index) => (
                  <div key={option.id} className="flex items-center gap-2">
                    <span className="w-5 text-center text-[11px] text-[#F0EFEC]/30">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <RhInput
                        value={option.label}
                        onChange={(value) =>
                          setOptions((current) => current.map((item) => (item.id === option.id ? { ...item, label: value } : item)))
                        }
                        placeholder={`Opção ${index + 1}`}
                      />
                    </div>
                    <div className="w-16">
                      <RhInput
                        value={option.points}
                        onChange={(value) =>
                          setOptions((current) => current.map((item) => (item.id === option.id ? { ...item, points: value } : item)))
                        }
                        inputMode="numeric"
                        placeholder="pts"
                      />
                    </div>
                    <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#F0EFEC]/45">
                      <input
                        type="checkbox"
                        checked={option.disqualify}
                        onChange={(event) =>
                          setOptions((current) =>
                            current.map((item) => (item.id === option.id ? { ...item, disqualify: event.target.checked } : item))
                          )
                        }
                        className="size-3.5 accent-[#F0EFEC]"
                      />
                      elimina
                    </label>
                    <button
                      type="button"
                      aria-label="Remover opção"
                      onClick={() => setOptions((current) => current.filter((item) => item.id !== option.id))}
                      className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-[#F0EFEC]/30 transition hover:bg-red-400/10 hover:text-red-300"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {error ? <p className="text-[12px] text-red-400/80">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <RhGhostButton onClick={onClose}>Cancelar</RhGhostButton>
          <RhPrimaryButton onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar pergunta
          </RhPrimaryButton>
        </div>
      </div>
    </Dialog>
  )
}
