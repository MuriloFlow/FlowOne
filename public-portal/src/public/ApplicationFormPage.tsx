import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CloudUpload,
  FileText,
  Loader2,
  MapPin,
  User,
  X
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, ReactNode } from 'react'
import { fetchFormQuestions, submitApplication, uploadResume, fetchJobBySlug } from '../lib/api'
import { supabase } from '../lib/supabase'
import { stepAccountSchema, stepLocationSchema, validateResumeFile, RESUME_ACCEPTED } from '../lib/validation'
import type { AnswerValue, SubmitPayload } from '../lib/validation'
import type { RhJob, RhQuestion, RhOption } from '../lib/types'
import { maskCPF, maskPhone, isValidCPF } from '../lib/format'
import Field from '../components/ui/Field'

// Formulário de candidatura em 4 etapas — clone da referência.

const EASE = [0.16, 1, 0.3, 1] as const

type Step = { id: 'account' | 'location' | 'resume' | 'questions'; label: string; icon: ReactNode }

const STEPS: Step[] = [
  { id: 'account', label: 'Dados pessoais', icon: <User size={15} /> },
  { id: 'location', label: 'Contato & links', icon: <MapPin size={15} /> },
  { id: 'resume', label: 'Currículo', icon: <FileText size={15} /> },
  { id: 'questions', label: 'Questionário', icon: <Building2 size={15} /> }
]

type FormState = {
  full_name: string
  email: string
  phone: string
  cpf: string
  birth_date: string
  city: string
  state: string
  zip_code: string
  street: string
  street_number: string
  complement: string
  district: string
  linkedin_url: string
  portfolio_url: string
  answers: Record<string, AnswerValue>
}

const INITIAL: FormState = {
  full_name: '',
  email: '',
  phone: '',
  cpf: '',
  birth_date: '',
  city: '',
  state: 'SP',
  zip_code: '',
  street: '',
  street_number: '',
  complement: '',
  district: '',
  linkedin_url: '',
  portfolio_url: '',
  answers: {}
}

export default function ApplicationFormPage({
  slug,
  navigate
}: {
  slug: string
  navigate: (to: string) => void
}) {
  const [job, setJob] = useState<RhJob | null>(null)
  const [questions, setQuestions] = useState<RhQuestion[]>([])
  const [optionsByQuestion, setOptionsByQuestion] = useState<Record<string, RhOption[]>>({})
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)

  const [stepIndex, setStepIndex] = useState(0)
  const [form, setForm] = useState<FormState>(INITIAL)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [cepLoading, setCepLoading] = useState(false)
  const [cepNotFound, setCepNotFound] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([fetchJobBySlug(slug), fetchFormQuestions()])
      .then(([jobData, formData]) => {
        if (!alive) return
        if (!jobData) {
          setNotFound(true)
        } else {
          setJob(jobData)
          // Perguntas da vaga (JOB) + globais; o endpoint retorna globais quando
          // não há jobId — buscar de novo com o id da vaga.
          void fetchFormQuestions(jobData.id).then((withJob) => {
            if (!alive) return
            setQuestions(withJob.questions)
            setOptionsByQuestion(withJob.optionsByQuestion)
          })
          setQuestions(formData.questions)
          setOptionsByQuestion(formData.optionsByQuestion)
        }
        setLoading(false)
      })
      .catch((e) => {
        if (alive) {
          setFatal(e.message)
          setLoading(false)
        }
      })
    return () => {
      alive = false
    }
  }, [slug])

  const step = STEPS[stepIndex]

  const stepQuestions = useMemo(
    () => questions.filter((q) => q.scope === 'GLOBAL' || q.job_id === job?.id),
    [questions, job]
  )

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => {
      if (!e[key as string]) return e
      const next = { ...e }
      delete next[key as string]
      return next
    })
  }

  function setAnswer(questionId: string, value: AnswerValue) {
    setForm((f) => ({ ...f, answers: { ...f.answers, [questionId]: value } }))
    setErrors((e) => {
      if (!e[questionId]) return e
      const next = { ...e }
      delete next[questionId]
      return next
    })
  }

  function validateCurrentStep(): boolean {
    const errs: Record<string, string> = {}

    if (step.id === 'account') {
      const parsed = stepAccountSchema.safeParse(form)
      if (!parsed.success) {
        for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message
      }
      if (form.cpf && !isValidCPF(form.cpf)) errs.cpf = 'CPF inválido. Confira os dígitos.'
    }

    if (step.id === 'location') {
      const parsed = stepLocationSchema.safeParse(form)
      if (!parsed.success) {
        for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message
      }
    }

    if (step.id === 'questions') {
      for (const q of stepQuestions) {
        if (!q.required) continue
        const v = form.answers[q.id]
        const empty =
          v === undefined ||
          v === null ||
          v === '' ||
          (Array.isArray(v) && v.length === 0) ||
          (typeof v === 'string' && v.trim() === '')
        if (empty) errs[q.id] = 'Esta pergunta é obrigatória.'
      }
    }

    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return false
    }
    return true
  }

  function goNext() {
    if (!validateCurrentStep()) return
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0))
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // CEP: máscara + autopreenchimento via ViaCEP (consulta pública).
  function maskCEP(v: string): string {
    const d = v.replace(/\D/g, '').slice(0, 8)
    return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
  }

  async function handleCepChange(v: string) {
    const masked = maskCEP(v)
    set('zip_code', masked)
    setCepNotFound(null)
    const digits = masked.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading(true)
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      const j = await r.json()
      if (j.erro) throw new Error('erro')
      setForm((f) => ({
        ...f,
        street: j.logradouro || f.street,
        district: j.bairro || f.district,
        city: j.localidade || f.city,
        state: (j.uf || f.state).toUpperCase().slice(0, 2)
      }))
      setErrors((e) => {
        const n = { ...e }
        delete n.city
        delete n.state
        return n
      })
    } catch {
      setCepNotFound('CEP não encontrado — preencha o endereço manualmente.')
    } finally {
      setCepLoading(false)
    }
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFileError(null)
    if (!f) {
      setFile(null)
      return
    }
    const problem = validateResumeFile(f)
    if (problem) {
      setFileError(problem)
      setFile(null)
      e.target.value = ''
      return
    }
    setFile(f)
  }

  async function handleSubmit() {
    if (!job) return
    if (!validateCurrentStep()) return
    setSubmitting(true)
    setSubmitError(null)
    let uploadedPath: string | null = null

    try {
      let fileData: SubmitPayload['file'] | undefined
      if (file) {
        const { storage_path } = await uploadResume(job.slug, file)
        fileData = {
          storage_path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size
        }
        uploadedPath = storage_path
      }

      const payload: SubmitPayload = {
        job_id: job.id,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        cpf: form.cpf || undefined,
        birth_date: form.birth_date || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        zip_code: form.zip_code || undefined,
        street: form.street || undefined,
        street_number: form.street_number || undefined,
        complement: form.complement || undefined,
        district: form.district || undefined,
        linkedin_url: form.linkedin_url || undefined,
        portfolio_url: form.portfolio_url || undefined,
        answers: form.answers,
        file: fileData
      }

      const result = await submitApplication(payload)
      if (result.error) throw new Error(result.error)

      navigate(`/obrigado/${job.slug}`)
    } catch (err) {
      // Se o upload deu certo mas o registro falhou, remove o órfão do bucket.
      if (uploadedPath) {
        try {
          await supabase.storage.from('rh-files').remove([uploadedPath])
        } catch {
          /* melhor esforço; não mascara o erro real */
        }
      }
      setSubmitError(err instanceof Error ? err.message : 'Erro ao enviar candidatura.')
      setSubmitting(false)
      topRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // ---------- Estados de carregamento / erro ----------

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16">
        <div className="skeleton h-6 w-40" />
        <div className="skeleton mt-3 h-10 w-3/4" />
        <div className="skeleton mt-10 h-64 w-full rounded-2xl" />
      </div>
    )
  }

  if (fatal || notFound || !job) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-24 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-50 text-ink-400">
          <FileText size={26} />
        </div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">
          {fatal ? 'Não foi possível carregar o formulário' : 'Candidatura indisponível'}
        </h1>
        <p className="mt-2 text-[14.5px] text-ink-500">
          {fatal ?? 'Esta vaga não está mais aceitando candidaturas. Confira as outras oportunidades abertas.'}
        </p>
        <button className="btn-brand mt-6" onClick={() => navigate('/')}>
          Ver vagas abertas
        </button>
      </div>
    )
  }

  return (
    <div ref={topRef} className="mx-auto w-full max-w-2xl px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
      {/* Cabeçalho */}
      <button
        onClick={() => navigate(`/vaga/${job.slug}`)}
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        <ArrowLeft size={16} /> {job.title}
      </button>

      <h1 className="text-balance mt-3 font-display text-[26px] font-bold leading-tight tracking-[-0.025em] text-ink-950 sm:text-3xl">
        Candidate-se
      </h1>
      <p className="mt-1.5 text-[14.5px] text-ink-500">Preencha com atenção — leva cerca de 5 minutos.</p>

      {/* Progresso */}
      <div className="sticky top-16 z-30 -mx-4 mt-6 bg-surface/90 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {STEPS.map((s, i) => {
            const done = i < stepIndex
            const active = i === stepIndex
            return (
              <div key={s.id} className="flex flex-1 flex-col gap-1.5">
                <div
                  className={`flex items-center gap-1.5 text-[11px] font-medium sm:text-[12px] ${
                    done ? 'text-brand-600' : active ? 'text-ink-900' : 'text-ink-400'
                  }`}
                >
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border text-[10.5px] transition-all duration-300 ${
                      done
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : active
                          ? 'border-ink-900 bg-ink-900 text-white shadow-soft'
                          : 'border-ink-200 bg-surface text-ink-400'
                    }`}
                  >
                    {done ? <Check size={12} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="hidden truncate sm:inline">{s.label}</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-ink-100">
                  <motion.div
                    className={`h-full rounded-full ${done ? 'bg-brand-500' : active ? 'bg-ink-900' : 'bg-ink-100'}`}
                    initial={false}
                    animate={{ width: done || active ? '100%' : '0%' }}
                    transition={{ duration: 0.45, ease: EASE }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Card do passo */}
      <div className="card mt-5 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="p-6 sm:p-8"
          >
            <h2 className="mb-1 font-display text-[17px] font-semibold text-ink-900">{step.label}</h2>
            <p className="mb-6 text-[13.5px] text-ink-500">
              {step.id === 'account' && 'Vamos conhecer você. Use o nome como está nos seus documentos.'}
              {step.id === 'location' && 'Como podemos encontrar e onde podemos ver mais do seu trabalho.'}
              {step.id === 'resume' && 'Anexe seu currículo atualizado em PDF, DOC ou DOCX (até 10 MB).'}
              {step.id === 'questions' && 'Responda com sinceridade — isso agiliza a sua triagem.'}
            </p>

            {/* ---------- Etapa 1: dados ---------- */}
            {step.id === 'account' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nome completo" required error={errors.full_name} className="sm:col-span-2">
                  <input
                    className={`field-input ${errors.full_name ? 'field-input-error' : ''}`}
                    value={form.full_name}
                    onChange={(e) => set('full_name', e.target.value)}
                    placeholder="Ex.: Maria Silva Santos"
                    autoComplete="name"
                  />
                </Field>
                <Field label="E-mail" required error={errors.email}>
                  <input
                    type="email"
                    inputMode="email"
                    className={`field-input ${errors.email ? 'field-input-error' : ''}`}
                    value={form.email}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="voce@email.com"
                    autoComplete="email"
                  />
                </Field>
                <Field label="Celular / WhatsApp" required error={errors.phone}>
                  <input
                    type="tel"
                    inputMode="tel"
                    className={`field-input ${errors.phone ? 'field-input-error' : ''}`}
                    value={form.phone}
                    onChange={(e) => set('phone', maskPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    autoComplete="tel"
                  />
                </Field>
                <Field label="CPF" error={errors.cpf} hint="Usado apenas para admissão.">
                  <input
                    inputMode="numeric"
                    className={`field-input ${errors.cpf ? 'field-input-error' : ''}`}
                    value={form.cpf}
                    onChange={(e) => set('cpf', maskCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Data de nascimento" error={errors.birth_date}>
                  <input
                    type="date"
                    className={`field-input ${errors.birth_date ? 'field-input-error' : ''}`}
                    value={form.birth_date}
                    onChange={(e) => set('birth_date', e.target.value)}
                    max={new Date(Date.now() - 14 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)}
                  />
                </Field>
              </div>
            )}

            {/* ---------- Etapa 2: contato ---------- */}
            {step.id === 'location' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="CEP"
                  error={cepNotFound ?? errors.zip_code}
                  hint={cepLoading ? 'Buscando endereço…' : 'Preenche o endereço automaticamente'}
                >
                  <input
                    inputMode="numeric"
                    className={`field-input ${cepNotFound || errors.zip_code ? 'field-input-error' : ''}`}
                    value={form.zip_code}
                    onChange={(e) => void handleCepChange(e.target.value)}
                    placeholder="09400-190"
                    autoComplete="postal-code"
                  />
                </Field>
                <Field label="Rua / Avenida" error={errors.street}>
                  <input
                    className={`field-input ${errors.street ? 'field-input-error' : ''}`}
                    value={form.street}
                    onChange={(e) => set('street', e.target.value)}
                    placeholder="Rua Doutor João Batista Rocha"
                    autoComplete="address-line1"
                  />
                </Field>
                <Field label="Número">
                  <input
                    inputMode="numeric"
                    className="field-input"
                    value={form.street_number}
                    onChange={(e) => set('street_number', e.target.value)}
                    placeholder="50"
                    autoComplete="address-number"
                  />
                </Field>
                <Field label="Complemento" hint="Opcional">
                  <input
                    className="field-input"
                    value={form.complement}
                    onChange={(e) => set('complement', e.target.value)}
                    placeholder="Apto 12 / Bloco B"
                  />
                </Field>
                <Field label="Bairro">
                  <input
                    className="field-input"
                    value={form.district}
                    onChange={(e) => set('district', e.target.value)}
                    placeholder="Centro"
                    autoComplete="address-level3"
                  />
                </Field>
                <Field label="Cidade" required error={errors.city}>
                  <input
                    className={`field-input ${errors.city ? 'field-input-error' : ''}`}
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                    placeholder="Ribeirão Pires"
                    autoComplete="address-level2"
                  />
                </Field>
                <Field label="Estado (UF)" required error={errors.state}>
                  <input
                    className={`field-input ${errors.state ? 'field-input-error' : ''}`}
                    value={form.state}
                    onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))}
                    placeholder="SP"
                    autoComplete="address-level1"
                  />
                </Field>
                <Field label="LinkedIn" error={errors.linkedin_url} hint="Opcional">
                  <input
                    type="url"
                    className={`field-input ${errors.linkedin_url ? 'field-input-error' : ''}`}
                    value={form.linkedin_url}
                    onChange={(e) => set('linkedin_url', e.target.value)}
                    placeholder="https://linkedin.com/in/…"
                    autoComplete="url"
                  />
                </Field>
                <Field label="Portfólio / Behance" error={errors.portfolio_url} hint="Opcional">
                  <input
                    type="url"
                    className={`field-input ${errors.portfolio_url ? 'field-input-error' : ''}`}
                    value={form.portfolio_url}
                    onChange={(e) => set('portfolio_url', e.target.value)}
                    placeholder="https://…"
                    autoComplete="url"
                  />
                </Field>
              </div>
            )}

            {/* ---------- Etapa 3: currículo ---------- */}
            {step.id === 'resume' && (
              <div>
                <label
                  className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 ${
                    fileError
                      ? 'border-red-300 bg-red-50/40'
                      : file
                        ? 'border-brand-300 bg-brand-50/40'
                        : 'border-ink-200 bg-ink-50/50 hover:border-brand-300 hover:bg-brand-50/40'
                  }`}
                >
                  <input
                    type="file"
                    className="sr-only"
                    accept={[...RESUME_ACCEPTED].join(',')}
                    onChange={onFileChange}
                  />
                  <motion.div
                    whileHover={{ y: -3 }}
                    className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl shadow-soft transition-colors ${
                      file
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface text-brand-500 group-hover:bg-brand-100'
                    }`}
                  >
                    {file ? <CheckCircle2 size={26} /> : <CloudUpload size={26} />}
                  </motion.div>
                  {file ? (
                    <>
                      <p className="text-[14.5px] font-semibold text-ink-900">{file.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink-500">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB · toque para trocar
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-[14.5px] font-semibold text-ink-900">
                        Arraste ou toque para enviar seu currículo
                      </p>
                      <p className="mt-1 text-[12.5px] text-ink-500">PDF, DOC ou DOCX · até 10 MB</p>
                    </>
                  )}
                </label>
                <AnimatePresence>
                  {fileError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-2 flex items-center gap-1 text-[12.5px] font-medium text-red-600"
                    >
                      <X size={13} /> {fileError}
                    </motion.p>
                  )}
                </AnimatePresence>
                <p className="mt-4 text-[12.5px] leading-relaxed text-ink-400">
                  Seu currículo fica acessível somente à equipe de RH da Digaspi Ribeirão Pires, com acesso restrito e
                  registrado.
                </p>
              </div>
            )}

            {/* ---------- Etapa 4: perguntas ---------- */}
            {step.id === 'questions' && (
              <div className="space-y-6">
                {stepQuestions.length === 0 && (
                  <p className="text-[14px] text-ink-500">Nenhuma pergunta adicional para esta vaga.</p>
                )}
                {stepQuestions.map((q) => (
                  <QuestionRenderer
                    key={q.id}
                    question={q}
                    options={optionsByQuestion[q.id] ?? []}
                    value={form.answers[q.id]}
                    error={errors[q.id]}
                    onChange={(v) => setAnswer(q.id, v)}
                  />
                ))}
              </div>
            )}

            {/* Erro de submissão */}
            <AnimatePresence>
              {submitError && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-700"
                >
                  {submitError}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        {/* Rodapé de navegação */}
        <div className="flex items-center justify-between gap-3 border-t border-ink-100 bg-ink-50/50 px-6 py-4 sm:px-8">
          <button className="btn-ghost" onClick={goBack} disabled={stepIndex === 0 || submitting}>
            <ArrowLeft size={16} /> Voltar
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden text-[12px] font-medium text-ink-400 sm:inline">
              Etapa {stepIndex + 1} de {STEPS.length}
            </span>
            {step.id === 'questions' ? (
              <motion.button
                whileTap={{ scale: 0.98 }}
                className="btn-brand min-w-[148px]"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 size={17} className="animate-spin" /> Enviando…
                  </>
                ) : (
                  <>
                    Enviar candidatura <Check size={16} />
                  </>
                )}
              </motion.button>
            ) : (
              <motion.button whileTap={{ scale: 0.98 }} className="btn-primary" onClick={goNext}>
                Continuar <ArrowRight size={16} />
              </motion.button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-[12px] leading-relaxed text-ink-400">
        Ao enviar, você concorda com o tratamento dos seus dados para fins de recrutamento pela Digaspi Ribeirão Pires
        (LGPD).
      </p>
    </div>
  )
}

// ---------------- Renderizador de perguntas ----------------

function QuestionRenderer({
  question,
  options,
  value,
  error,
  onChange
}: {
  question: RhQuestion
  options: RhOption[]
  value: AnswerValue | undefined
  error?: string
  onChange: (v: AnswerValue) => void
}) {
  const label = question.label

  if (question.type === 'TEXT' || question.type === 'NUMBER' || question.type === 'DATE') {
    return (
      <Field label={label} required={question.required} error={error} hint={question.help_text ?? undefined}>
        <input
          type={question.type === 'NUMBER' ? 'number' : question.type === 'DATE' ? 'date' : 'text'}
          inputMode={question.type === 'NUMBER' ? 'decimal' : undefined}
          className={`field-input ${error ? 'field-input-error' : ''}`}
          value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
          onChange={(e) =>
            onChange(
              question.type === 'NUMBER' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value
            )
          }
          placeholder={question.placeholder ?? undefined}
        />
      </Field>
    )
  }

  if (question.type === 'TEXTAREA') {
    return (
      <Field label={label} required={question.required} error={error} hint={question.help_text ?? undefined}>
        <textarea
          rows={4}
          className={`field-input resize-y ${error ? 'field-input-error' : ''}`}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder ?? undefined}
        />
      </Field>
    )
  }

  if (question.type === 'BOOLEAN') {
    const checked = value === true || (typeof value === 'string' && ['true', 'sim'].includes(value.toLowerCase()))
    return (
      <Field label={label} required={question.required} error={error} hint={question.help_text ?? undefined}>
        <div className="flex gap-2">
          <ChoiceChip active={checked === true} onClick={() => onChange(true)} icon={<Check size={14} />}>
            Sim
          </ChoiceChip>
          <ChoiceChip active={value === false} onClick={() => onChange(false)} icon={<X size={14} />}>
            Não
          </ChoiceChip>
        </div>
      </Field>
    )
  }

  if (question.type === 'SELECT') {
    return (
      <Field label={label} required={question.required} error={error} hint={question.help_text ?? undefined}>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <ChoiceChip
              key={opt.id}
              active={value === opt.value}
              onClick={() => onChange(value === opt.value ? null : opt.value)}
            >
              {opt.label}
            </ChoiceChip>
          ))}
          {options.length === 0 && (
            <select
              className="field-input"
              value={typeof value === 'string' ? value : ''}
              onChange={(e) => onChange(e.target.value || null)}
            >
              <option value="">Selecione…</option>
            </select>
          )}
        </div>
      </Field>
    )
  }

  if (question.type === 'MULTISELECT') {
    const arr = Array.isArray(value) ? value : []
    return (
      <Field label={label} required={question.required} error={error} hint={question.help_text ?? undefined}>
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const active = arr.includes(opt.value)
            return (
              <ChoiceChip
                key={opt.id}
                active={active}
                onClick={() => onChange(active ? arr.filter((v) => v !== opt.value) : [...arr, opt.value])}
                icon={active ? <Check size={13} /> : undefined}
              >
                {opt.label}
              </ChoiceChip>
            )
          })}
        </div>
      </Field>
    )
  }

  return null
}

function ChoiceChip({
  active,
  onClick,
  children,
  icon
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  icon?: ReactNode
}) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] font-medium transition-all duration-200 ${
        active
          ? 'border-brand-600 bg-brand-600 text-white shadow-soft shadow-brand-600/30'
          : 'border-ink-200 bg-surface text-ink-700 hover:border-brand-300 hover:bg-brand-50/60 hover:text-brand-700'
      }`}
      aria-pressed={active}
    >
      {icon}
      {children}
    </motion.button>
  )
}
