import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import {
  createCriterion,
  createQuestion,
  deleteCriterion,
  deleteQuestion,
  fetchAiRules,
  fetchCriteria,
  fetchQuestions,
  updateAiRule,
  updateCriterion,
  updateQuestion
} from '@/lib/rh/api'
import {
  QUESTION_TYPE_LABEL,
  type RhAiRule,
  type RhCriterion,
  type RhOption,
  type RhQuestion,
  type RhQuestionType
} from '@/lib/rh/types'
import { RhCard, RhErrorState, RhGhostButton, RhPageHeader, RhPrimaryButton, RhSkeleton } from './rh-ui'

type Tab = 'questions' | 'criteria' | 'ai'

export function RhSettingsPage() {
  const [tab, setTab] = useState<Tab>('questions')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RhPageHeader title="Configurações" subtitle="Perguntas globais, critérios avaliativos e regras da IA." />

      <div className="mb-4 flex gap-1">
        {(
          [
            ['questions', 'Perguntas Globais'],
            ['criteria', 'Critérios Avaliativos'],
            ['ai', 'Regras da IA']
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`h-8 rounded-[8px] px-3 text-[12.5px] font-medium transition ${
              tab === value ? 'bg-[#F0EFEC] text-[#111111]' : 'border border-white/[0.07] text-[#F0EFEC]/50 hover:text-[#F0EFEC]/80'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {tab === 'questions' ? <GlobalQuestions /> : null}
        {tab === 'criteria' ? <CriteriaManager /> : null}
        {tab === 'ai' ? <AiRulesManager /> : null}
      </div>
    </div>
  )
}

const inputClass =
  'w-full rounded-[10px] border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[13px] text-[#F0EFEC]/85 placeholder:text-[#F0EFEC]/28 focus:border-white/15 focus:outline-none'

// ---------------- Perguntas globais ----------------

function GlobalQuestions() {
  const [questions, setQuestions] = useState<RhQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await fetchQuestions()
      setQuestions(all.filter((question) => question.scope === 'GLOBAL'))
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar perguntas.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(question: RhQuestion): Promise<void> {
    await updateQuestion(question.id, { active: !question.active }).catch(() => undefined)
    void load()
  }

  async function remove(question: RhQuestion): Promise<void> {
    if (!window.confirm('Excluir esta pergunta global? Ela sai de todas as vagas.')) return
    await deleteQuestion(question.id).catch(() => undefined)
    void load()
  }

  if (loading) return <RhSkeleton className="h-[320px]" />
  if (error) return <RhErrorState message={error} onRetry={() => void load()} />

  return (
    <div className="space-y-2">
      {questions.map((question) => (
        <RhCard key={question.id} className="p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13.5px] text-[#F0EFEC]/85">{question.label}</p>
              <p className="mt-0.5 text-[11.5px] text-[#F0EFEC]/32">
                {QUESTION_TYPE_LABEL[question.type]} · {question.required ? 'obrigatória' : 'opcional'} ·{' '}
                {question.active ? 'ativa' : 'desativada'}
                {question.options?.length ? ` · ${question.options.length} opções` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <RhGhostButton onClick={() => void toggle(question)}>{question.active ? 'Desativar' : 'Ativar'}</RhGhostButton>
              <button
                type="button"
                onClick={() => void remove(question)}
                aria-label="Excluir pergunta"
                className="flex size-8 items-center justify-center rounded-[8px] text-[#F0EFEC]/30 hover:bg-red-400/10 hover:text-red-300"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
          {question.options?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/[0.04] pt-2">
              {question.options.map((option) => (
                <span
                  key={option.id ?? option.value}
                  className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[11px] text-[#F0EFEC]/55"
                >
                  {option.label}
                  <span className={option.points > 0 ? 'ml-1 text-emerald-300/70' : 'ml-1 text-[#F0EFEC]/30'}>
                    {option.points > 0 ? `+${option.points}` : option.points}
                  </span>
                  {option.effect === 'DISQUALIFY' ? <span className="ml-1 text-red-300/70">· elimina</span> : null}
                </span>
              ))}
            </div>
          ) : null}
        </RhCard>
      ))}

      {creating ? (
        <SettingsQuestionForm
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false)
            void load()
          }}
        />
      ) : (
        <RhPrimaryButton onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> Nova pergunta global
        </RhPrimaryButton>
      )}
    </div>
  )
}

function SettingsQuestionForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
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
      setError('Informe o enunciado.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const parsedOptions: RhOption[] = needsOptions
        ? options
            .filter((option) => option.label.trim())
            .map((option, index) => ({
              value: option.label.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 40),
              label: option.label.trim(),
              points: Number(option.points) || 0,
              effect: option.disqualify ? 'DISQUALIFY' : 'NONE',
              order_index: index
            }))
        : []
      await createQuestion({
        scope: 'GLOBAL',
        job_id: null,
        type,
        label: label.trim(),
        placeholder: null,
        help_text: helpText.trim() || null,
        required,
        order_index: questionsNextOrder(),
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

  function questionsNextOrder(): number {
    return 50
  }

  return (
    <RhCard className="space-y-3 p-4">
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[#F0EFEC]/45">Enunciado *</label>
        <input value={label} onChange={(event) => setLabel(event.target.value)} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#F0EFEC]/45">Tipo</label>
          <select value={type} onChange={(event) => setType(event.target.value as RhQuestionType)} className={inputClass}>
            {(Object.keys(QUESTION_TYPE_LABEL) as RhQuestionType[])
              .filter((questionType) => questionType !== 'FILE')
              .map((questionType) => (
                <option key={questionType} value={questionType} className="bg-[#1A1A1A]">
                  {QUESTION_TYPE_LABEL[questionType]}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[12px] font-medium text-[#F0EFEC]/45">Obrigatoriedade</label>
          <select value={required ? 'yes' : 'no'} onChange={(event) => setRequired(event.target.value === 'yes')} className={inputClass}>
            <option value="yes" className="bg-[#1A1A1A]">Obrigatória</option>
            <option value="no" className="bg-[#1A1A1A]">Opcional</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[12px] font-medium text-[#F0EFEC]/45">Texto de ajuda (opcional)</label>
        <input value={helpText} onChange={(event) => setHelpText(event.target.value)} className={inputClass} />
      </div>
      {needsOptions ? (
        <div className="space-y-2">
          <label className="text-[12px] font-medium text-[#F0EFEC]/45">Opções com pontuação</label>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={option.label}
                onChange={(event) => setOptions((current) => current.map((item, i) => (i === index ? { ...item, label: event.target.value } : item)))}
                placeholder={`Opção ${index + 1}`}
                className={`${inputClass} flex-1`}
              />
              <input
                value={option.points}
                onChange={(event) => setOptions((current) => current.map((item, i) => (i === index ? { ...item, points: event.target.value } : item)))}
                placeholder="pts"
                inputMode="numeric"
                className={`${inputClass} w-16`}
              />
              <label className="flex shrink-0 items-center gap-1 text-[11px] text-[#F0EFEC]/45">
                <input
                  type="checkbox"
                  checked={option.disqualify}
                  onChange={(event) => setOptions((current) => current.map((item, i) => (i === index ? { ...item, disqualify: event.target.checked } : item)))}
                  className="size-3 accent-[#F0EFEC]"
                />
                elimina
              </label>
              <button type="button" onClick={() => setOptions((current) => current.filter((_, i) => i !== index))} className="text-[#F0EFEC]/30 hover:text-red-300">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <RhGhostButton onClick={() => setOptions((current) => [...current, { label: '', points: '0', disqualify: false }])}>
            <Plus className="size-3.5" /> Adicionar opção
          </RhGhostButton>
        </div>
      ) : null}
      {error ? <p className="text-[12px] text-red-400/80">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <RhGhostButton onClick={onCancel}>Cancelar</RhGhostButton>
        <RhPrimaryButton onClick={() => void submit()} disabled={saving}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null} Criar pergunta
        </RhPrimaryButton>
      </div>
    </RhCard>
  )
}

// ---------------- Critérios avaliativos ----------------

function CriteriaManager() {
  const [criteria, setCriteria] = useState<RhCriterion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [points, setPoints] = useState('5')
  const [kind, setKind] = useState<'SCORE' | 'DISQUALIFIER'>('SCORE')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCriteria(await fetchCriteria())
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar critérios.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add(): Promise<void> {
    if (!label.trim()) return
    setSaving(true)
    try {
      await createCriterion({ kind, label: label.trim(), points: Number(points) || 0 })
      setLabel('')
      await load()
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Erro ao criar critério.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(criterion: RhCriterion): Promise<void> {
    if (!window.confirm('Excluir este critério?')) return
    await deleteCriterion(criterion.id).catch(() => undefined)
    void load()
  }

  async function toggle(criterion: RhCriterion): Promise<void> {
    await updateCriterion(criterion.id, { active: !criterion.active }).catch(() => undefined)
    void load()
  }

  if (loading) return <RhSkeleton className="h-[240px]" />

  return (
    <div className="space-y-3">
      {error ? <RhErrorState message={error} onRetry={() => void load()} /> : null}
      <RhCard className="p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-[#F0EFEC]/80">
          Critérios de avaliação
          <span className="ml-2 font-normal text-[#F0EFEC]/35">usados pela IA e pelo RH na triagem</span>
        </h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[11.5px] text-[#F0EFEC]/45">Critério</label>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ex.: Experiência com vendas" className={inputClass} />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-[11.5px] text-[#F0EFEC]/45">Pontos</label>
            <input value={points} onChange={(event) => setPoints(event.target.value)} inputMode="numeric" className={inputClass} />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-[11.5px] text-[#F0EFEC]/45">Tipo</label>
            <select value={kind} onChange={(event) => setKind(event.target.value as 'SCORE' | 'DISQUALIFIER')} className={inputClass}>
              <option value="SCORE" className="bg-[#1A1A1A]">Soma pontos</option>
              <option value="DISQUALIFIER" className="bg-[#1A1A1A]">Eliminatório</option>
            </select>
          </div>
          <RhPrimaryButton onClick={() => void add()} disabled={saving || !label.trim()}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Adicionar
          </RhPrimaryButton>
        </div>

        <div className="mt-4 space-y-1.5">
          {criteria.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-[#F0EFEC]/35">Nenhum critério cadastrado ainda.</p>
          ) : (
            criteria.map((criterion) => (
              <div key={criterion.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-[#F0EFEC]/82">{criterion.label}</p>
                  <p className="text-[11px] text-[#F0EFEC]/32">
                    {criterion.kind === 'DISQUALIFIER' ? 'Eliminatório' : `+${criterion.points} pontos`} ·{' '}
                    {criterion.job_id ? 'específico de vaga' : 'global'} · {criterion.active ? 'ativo' : 'inativo'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <RhGhostButton onClick={() => void toggle(criterion)}>{criterion.active ? 'Desativar' : 'Ativar'}</RhGhostButton>
                  <button
                    type="button"
                    onClick={() => void remove(criterion)}
                    aria-label="Excluir critério"
                    className="flex size-7 items-center justify-center rounded-[7px] text-[#F0EFEC]/30 hover:bg-red-400/10 hover:text-red-300"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </RhCard>
    </div>
  )
}

// ---------------- Regras da IA ----------------

function AiRulesManager() {
  const [rules, setRules] = useState<RhAiRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAiRules()
      setRules(data)
      const nextDrafts: Record<string, string> = {}
      for (const rule of data) nextDrafts[rule.id] = JSON.stringify(rule.config, null, 2)
      setDrafts(nextDrafts)
      setError(null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Erro ao carregar regras da IA.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(rule: RhAiRule): Promise<void> {
    const draft = drafts[rule.id] ?? ''
    try {
      const config = JSON.parse(draft) as Record<string, unknown>
      setSavingKey(rule.id)
      await updateAiRule(rule.id, config)
      setError(null)
    } catch (saveError) {
      setError(
        saveError instanceof SyntaxError
          ? 'JSON inválido — corrija antes de salvar.'
          : saveError instanceof Error
            ? saveError.message
            : 'Erro ao salvar regra.'
      )
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return <RhSkeleton className="h-[280px]" />

  const DESCRIPTIONS: Record<string, string> = {
    age: 'Faixas de idade e pontuação (18+ obrigatório; bloqueio automático abaixo disso).',
    experience: 'Bônus de experiência: primeiro emprego, vendas/atendimento, permanência longa e penalidade de vínculos curtos.',
    location: 'Cidades prioritárias, CPTM e política de conduções até a loja.',
    resume: 'Palavras-chave buscadas no currículo (vendas, cursos) e limite de caracteres analisados.',
    deficiency: 'Deficiência NÃO pontua e NÃO elimina — apenas registrada (conforme política).'
  }

  return (
    <div className="space-y-3">
      {error ? <RhErrorState message={error} /> : null}
      <p className="text-[12.5px] text-[#F0EFEC]/40">
        Estas regras alimentam a pontuação automática (0–100) de cada candidato. Elas ficam no banco e nunca aparecem no
        portal público.
      </p>
      {rules.map((rule) => (
        <RhCard key={rule.id} className="p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-[#F0EFEC]/82">{rule.label}</h3>
              <p className="text-[11px] text-[#F0EFEC]/32">{DESCRIPTIONS[rule.rule_key] ?? rule.rule_key}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                rule.active ? 'border border-emerald-300/20 bg-emerald-300/10 text-emerald-200/90' : 'border border-white/10 bg-white/[0.05] text-[#F0EFEC]/50'
              }`}
            >
              {rule.active ? 'ativa' : 'inativa'}
            </span>
          </div>
          <textarea
            value={drafts[rule.id] ?? ''}
            onChange={(event) => setDrafts((current) => ({ ...current, [rule.id]: event.target.value }))}
            rows={Math.min(14, (drafts[rule.id] ?? '').split('\n').length + 1)}
            spellCheck={false}
            className="w-full rounded-[10px] border border-white/[0.07] bg-[#111111] px-3 py-2 font-mono text-[11.5px] text-[#F0EFEC]/80 focus:border-white/15 focus:outline-none"
          />
          <div className="mt-2 flex justify-end">
            <RhPrimaryButton onClick={() => void save(rule)} disabled={savingKey === rule.id}>
              {savingKey === rule.id ? <Loader2 className="size-3.5 animate-spin" /> : null} Salvar regra
            </RhPrimaryButton>
          </div>
        </RhCard>
      ))}
    </div>
  )
}
