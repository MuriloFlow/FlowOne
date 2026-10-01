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

/** Idade exata (anos completos) a partir da data de nascimento ISO. */
function computeAge(birthDateIso: string | null | undefined): number | null {
  if (!birthDateIso) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthDateIso)
  if (!match) return null
  const birth = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1
  return age
}

// ============================================================
// KNOWLEDGE BASE — especialista em seleção para o VAREJO
// Referencial profissional de avaliação curricular por área.
// ============================================================
const RETAIL_KNOWLEDGE_BASE = `
BASE DE CONHECIMENTO — SELEÇÃO PARA VAREJO BRASILEIRO (referencial sênior de RH)

=== ATENDIMENTO / OPERAÇÃO DE LOJA ===
Sinais FORTES: experiência direta em atendimento ao cliente (loja, SAC, food service, hospitalidade); menção a "cliente", "reclamação", "troca", "pós-venda"; trabalho com metas de serviço; elogios/premiações de atendimento; disponibilidade de horário (inclusive fins de semana — crítico no varejo); boa comunicação descrita na prática (ex.: "organizava eventos", "treinava novos atendentes").
Sinais FRACOS: só experiência administrativa sem contato com público; nunca trabalhou sob metas; CURSOS de atendimento sem prática; atitudes passivas.
Red flags: demissões recorrentes sem justificativa; relatos de conflito com clientes; “não gosto de lidar com público”.

=== VENDAS ===
Sinais FORTES: números concretos ("batia meta de R$ X", "120% da meta", "ticket médio", "conversão", "UPP/UPT", "peclagem", "adicionais", "garantias estendidas", "cartão da loja"); experiência em varejo de alto giro (magazine, eletro, moda, calçados, mercado); técnica de abordagem descrita (sondagem, oferta complementar); prêmios/campanhas internas; loja parceira de marcas.
Sinais FRACOS: "ajudava nas vendas" sem número nenhum; só caixa (atende, mas não vende ativamente); experiência B2B que não traduza para loja física.
Red flags: nenhuma meta em NENHUM emprego de vendas; troca frequente de setor sem evolução.

=== VISUAL MERCHANDISING (VM) ===
Sinais FORTES: termos técnicos — "vitrinismo", "layout", "planograma", "reunião de coleção", "mapa de loja", "comunicação visual", "precificação", "reposição por curva ABC"; formação em Design, Moda, Publicidade ou afins é PLUS forte; portfólio; experiência em loja de marca com padrão VM corporativo; menção a campanhas sazonais (Natal, Dia das Crianças, Black Friday).
Sinais FRACOS: só "arrumava as prateleiras" (reposição ≠ VM); sem vocabulário técnico algum; não menciona parâmetro/planograma nenhum.
Red flags: confunde VM com limpeza/organização geral.

=== ESTOQUE / LOGÍSTICA DE LOJA ===
Sinais FORTES: "recebimento", "conferência de nota", "inventário", "curva ABC", "SDM/SAP/OMIE", "controle de validade", "reposição", "breakage/perda", "organização de camara", "ciclos de inventário com acuracidade X%"; experiência em distribuição/centro de distribuição é válida; conhecimento de planilha (Excel intermediário+).
Sinais FRACOS: só "ajudava a guardar mercadoria"; sem menção a sistema nenhum; não sabe o que é inventário.
Red flags: perdas altas sem explicação; desorganização crônica relatada.

=== GERÊNCIA / LIDERANÇA DE LOJA ===
Sinais FORTES: gestão de EQUIPE (tamanho, escala, treinamento, feedback, demissão); resultado em números (faturamento, metas batidas consecutivas, redução de perdas, NPS); apertura/faturamento de loja; gestão de escala de folgas; contratação e integração de time; parceria com gerência regional; conhecimento de P&L simplificado (DRE da loja); experiência PREVIA como líder/adjunto antes de gerente (progressão saudável).
Sinais FRACOS: "gerente" mas sem equipe, sem número, sem processo nenhum; promoção instantânea sem base; só gestão administrativa sem chão de loja.
Red flags: alta rotatividade do time em todas as experiências; nunca desenvolveu ninguém; fala mal de ex-times de forma generalizada.

=== TRAÇOS GERAIS QUE PESAM NO VAREJO ===
+ Disponibilidade total de horário (inclusive fim de semana e feriado — O VAREJO FUNCIONA)
+ Estabilidade (empregos de 1+ ano) com progressão
+ Proximidade/transporte viável até a loja (deslocamento impossível = problema real)
+ Primeiro emprego jovem com curso técnico/voluntariado pode PONTUAR em funções júnior
+ Vivência em caixa + venda + reposição = perfil "loja completa" valioso
- Incompatibilidade clara de horário (só pode trabalhar meia-periodo sem dizer antes)
- Saltos de emprego sem narrativa (3 empregos em 4 meses repetidamente)
- Currículo 100% genérico (sem NENHUM dado da área)

=== COMO PONTUAR (calibração) ===
Requisito OBRIGATÓRIO não atendido (ex.: menor de 18 para função que exige, ou sem experiência NENHUMA onde é obrigatória) → ELIMINADO e diga qual requisito.
Compatibilidade forte (experiência direta + números + disponibilidade) → ALTA (70-100).
Compatibilidade parcial (tem experiência mas sem números, ou disponibilidade parcial) → MEDIA (45-69).
Compatibilidade fraca (só tangencial, primeiro emprego com potencial) → BAIXA (25-44).
Use a BAND para o veredito e o score para a calibração fina. NUNCA invente experiência que não está no currículo; NUNCA penalize por deficiência, gênero, etnia ou escolaridade quando a função não exigir.`

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

  const age = computeAge(candidate.birth_date as string | null | undefined)

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
      // Idade calculada por CÓDIGO (data completa) — nunca peça ao modelo para
      // deduzir idade a partir do ano (era a fonte do erro dos 18 anos).
      idade_calculada: age,
      maior_de_18: age !== null ? age >= 18 : null,
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
    'Você é o ANALISTA SÊNIO de RH do FLOW, especialista em seleção para VAREJO brasileiro. Analise o candidato para a vaga e devolve JSON.',
    RETAIL_KNOWLEDGE_BASE,
    'PROCESSO DE ANÁLISE (siga nesta ordem):',
    '1. Idade: use SEMPRE idade_calculada do JSON (cálculo por código). Se maior_de_18 for false e a vaga/função exigir 18+, ELIMINE citando isso. NUNCA calcule idade você mesmo nem use o ano de nascimento para deduzir.',
    '2. Identifique a ÁREA da vaga (atendimento, vendas, VM, estoque, gerência) e aplique o referencial da área do conhecimento acima para ler o currículo.',
    '3. Procure SINAIS FORTES/FRACOS/RED FLAGS específicos da área — cite EVIDÊNCIAS do currículo (empresa, número, período) em cada ponto; nunca invente.',
    '4. Valide as regras_do_banco (idade mínima, experiência, localização/transporte, palavras-chave) — requisito obrigatório não atendido = ELIMINADO.',
    '5. Calibre score/band conforme a seção COMO PONTUAR.',
    '6. Siga as INSTRUÇÕES_ADICIONAIS do RH quando houver (elas têm prioridade sobre o default, exceto leis/ética).',
    'Regras de formato:',
    '- score = compatibilidade 0..100 (inteiro).',
    '- band = ALTA | MEDIA | BAIXA | ELIMINADO.',
    '- positives/negatives: até 5 frases CURTAS cada, cada uma com evidência concreta do currículo.',
    '- experience_analysis: histórico identificado (empresas, períodos, tempo de casa, progressão, estabilidade).',
    '- transport_analysis: deslocamento estimado até a loja (cidade/endereço vs local da vaga).',
    '- conclusion: recomendação final em 1-2 frases para o RH (contratar para entrevista? para qual função?).',
    '- details: objeto livre com achados (age, meets_min_age, estimated_fares, job_hopping, first_job, sales_or_service, area_detected, evidence...).',
    '- Nunca use deficiência, gênero, etnia ou religião como critério.',
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
