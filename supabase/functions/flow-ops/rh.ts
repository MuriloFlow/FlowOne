// PORTAL DO RH — análise de candidato via LLM (usa OPENAI_API_KEY da edge).
// As regras (rh_ai_rules, incluindo custom_prompt_rules escritas pelo RH)
// entram como prompt; o resultado persiste em rh_ai_assessments no mesmo
// formato do motor SQL (rh_analyze_application), então a UI é igual.
import { resolveActor } from './scope.ts'
import { getFlowAdminClient } from './supabase-clients.ts'
import log from './log.ts'

type AssessPayload = {
  applicationId?: unknown
  resumeText?: unknown
}

type AssessmentRow = {
  application_id: string
  score: number
  band: string
  summary: string
  positives: string[]
  negatives: string[]
  experience_analysis: string
  transport_analysis: string
  conclusion: string
  details: Record<string, unknown>
  resume_chars: number | null
  model: string
}

function envOr(name: string, fallback: string): string {
  const value = Deno.env.get(name)?.trim()
  return value && value.length > 0 ? value : fallback
}

export async function rhAnalyzeApplication(payload: unknown): Promise<AssessmentRow> {
  const actor = await resolveActor()
  const body = (payload && typeof payload === 'object' ? payload : {}) as AssessPayload
  const applicationId = typeof body.applicationId === 'string' ? body.applicationId : ''
  if (!applicationId) throw new Error('Candidatura é obrigatória.')

  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!apiKey) throw new Error('IA indisponível: OPENAI_API_KEY ausente neste servidor.')

  const flow = getFlowAdminClient()

  // ---------- contexto ----------
  const { data: application, error: appError } = await flow
    .from('rh_applications')
    .select('*, job:rh_jobs(*), candidate:rh_candidates(*)')
    .eq('id', applicationId)
    .maybeSingle()
  if (appError) throw new Error(`Erro ao carregar a candidatura: ${appError.message}`)
  if (!application) throw new Error('Candidatura não encontrada.')

  const [answersRes, rulesRes, assessmentRes] = await Promise.all([
    flow
      .from('rh_answers')
      .select('value_text, value_json, rh_questions(label, type)')
      .eq('application_id', applicationId),
    flow.from('rh_ai_rules').select('rule_key, label, config').eq('active', true),
    flow
      .from('rh_ai_assessments')
      .select('id')
      .eq('application_id', applicationId)
      .maybeSingle()
  ])

  const answers = (answersRes.data ?? []) as Array<{
    value_text: string | null
    value_json: unknown
    rh_questions: { label: string } | null
  }>
  const rules = (rulesRes.data ?? []) as Array<{ rule_key: string; label: string; config: Record<string, unknown> }>
  const existingId = (assessmentRes.data as { id: string } | null)?.id ?? null

  const rulesMap: Record<string, unknown> = {}
  let customRules: string[] = []
  for (const rule of rules) {
    if (rule.rule_key === 'custom_prompt_rules') {
      const list = (rule.config as { rules?: unknown })?.rules
      if (Array.isArray(list)) customRules = list.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    } else {
      rulesMap[rule.rule_key] = rule.config
    }
  }

  const candidate = (application as { candidate?: Record<string, unknown> }).candidate ?? {}
  const job = (application as { job?: Record<string, unknown> }).job ?? {}

  const context = {
    vaga: {
      cargo: job.title ?? null,
      area: job.department ?? null,
      local: job.location ?? null,
      modelo: job.work_model ?? null,
      requisitos: job.requirements ?? [],
      responsabilidades: job.responsibilities ?? []
    },
    candidato: {
      nome: candidate.full_name ?? null,
      nascimento: candidate.birth_date ?? null,
      cidade: candidate.city ?? null,
      estado: candidate.state ?? null,
      endereco: [candidate.street, candidate.street_number, candidate.district, candidate.zip_code]
        .filter(Boolean)
        .join(', ') || null,
      linkedin: candidate.linkedin_url ?? null,
      portfolio: candidate.portfolio_url ?? null
    },
    respostas: answers.map((answer) => ({
      pergunta: answer.rh_questions?.label ?? null,
      resposta: answer.value_text ?? (typeof answer.value_json === 'string' ? answer.value_json : JSON.stringify(answer.value_json))
    })),
    regras_do_banco: rulesMap
  }

  const resumeText = typeof body.resumeText === 'string' ? body.resumeText.slice(0, 60_000) : ''
  const resumeBlock = resumeText.length > 40 ? `\n\nCURRÍCULO (texto extraído do PDF/DOCX):\n${resumeText}` : ''

  const system = [
    'Você é o analista de RH do FLOW. Analise o candidato para a vaga e devolve JSON.',
    'Regras:',
    '- score = compatibilidade 0..100 (inteiro).',
    '- band = ALTA (>=60) | MEDIA (35..59) | BAIXA (<35) | ELIMINADO (não atende requisito obrigatório).',
    '- Siga as regras_do_banco (idade, experiência, localização/transporte, palavras-chave) e as INSTRUÇÕES_ADICIONAIS do RH.',
    '- Nunca use deficiência como critério de pontuação ou eliminação.',
    '- positives/negatives: até 5 frases curtas e objetivas cada.',
    '- experience_analysis: histórico profissional identificado (empresas, períodos, estabilidade).',
    '- transport_analysis: deslocamento estimado até a loja conforme regras de localização.',
    '- conclusion: recomendação final em 1-2 frases para o RH.',
    '- details: objeto livre com achados (age, estimated_fares, job_hopping, first_job, sales_or_service...).',
    'Responda SOMENTE JSON válido no formato:',
    '{"score":number,"band":"ALTA|MEDIA|BAIXA|ELIMINADO","summary":"...","positives":["..."],"negatives":["..."],"experience_analysis":"...","transport_analysis":"...","conclusion":"...","details":{}}',
    customRules.length
      ? `\nINSTRUÇÕES_ADICIONAIS_DO_RH:\n${customRules.map((rule, index) => `${index + 1}. ${rule}`).join('\n')}`
      : '',
    `\nDADOS (JSON): ${JSON.stringify(context)}${resumeBlock}`
  ]
    .filter(Boolean)
    .join('\n')

  const model = envOr('OPENAI_MODEL', 'gpt-4o')
  const fallback = envOr('OPENAI_FALLBACK', 'gpt-4o-mini')
  const base = envOr('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, '')

  async function complete(chosen: string): Promise<AssessmentRow> {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: chosen,
        temperature: 0.2,
        messages: [{ role: 'system', content: system }],
        response_format: { type: 'json_object' }
      })
    })
    const json = (await response.json()) as {
      error?: { message?: string }
      choices?: Array<{ message?: { content?: string } }>
    }
    if (!response.ok) throw new Error(json.error?.message || `IA falhou (${response.status}).`)
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) throw new Error('IA não devolveu conteúdo.')
    const parsed = JSON.parse(raw) as Partial<AssessmentRow> & { score?: unknown; band?: unknown }
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)))
    const band = ['ALTA', 'MEDIA', 'BAIXA', 'ELIMINADO'].includes(String(parsed.band))
      ? String(parsed.band)
      : score >= 60
        ? 'ALTA'
        : score >= 35
          ? 'MEDIA'
          : 'BAIXA'
    const asStrings = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    const row: AssessmentRow = {
      application_id: applicationId,
      score,
      band,
      summary: String(parsed.summary ?? `Compatibilidade ${score}/100 (${band}).`).slice(0, 2000),
      positives: asStrings(parsed.positives).slice(0, 8),
      negatives: asStrings(parsed.negatives).slice(0, 8),
      experience_analysis: String(parsed.experience_analysis ?? '').slice(0, 4000),
      transport_analysis: String(parsed.transport_analysis ?? '').slice(0, 4000),
      conclusion: String(parsed.conclusion ?? '').slice(0, 2000),
      details:
        parsed.details && typeof parsed.details === 'object'
          ? (parsed.details as Record<string, unknown>)
          : { custom_rules_applied: customRules.length },
      resume_chars: resumeText.length > 40 ? resumeText.length : null,
      model: chosen
    }
    return row
  }

  let row: AssessmentRow
  try {
    row = await complete(model)
  } catch (error) {
    log.warn('rh IA modelo falhou, tentando fallback', { message: String(error).slice(0, 160) })
    if (fallback && fallback !== model) row = await complete(fallback)
    else throw error
  }

  // persiste (1 por candidatura; reanálise substitui)
  if (existingId) {
    await flow.from('rh_ai_assessments').delete().eq('id', existingId)
  }
  const { error: insertError } = await flow.from('rh_ai_assessments').insert(row)
  if (insertError) throw new Error(`Erro ao salvar a análise: ${insertError.message}`)

  return row
}
