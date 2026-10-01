// Motor de busca do Recruta+ — tolerante a erro de digitação, acento e
// variação de palavra ("vendendor" → "Vendedor", "aux de limpeza" →
// "Auxiliar de Limpeza", "estoque" → "Estoquista").
//
// Como funciona: cada termo digitado é comparado com TODAS as palavras dos
// campos da vaga (título pesa mais que descrição). A comparação aceita:
//   • igualdade exata                  → 1.00
//   • começa com o termo               → 0.92
//   • contém o termo                   → 0.84
//   • parecido (distância de edição)   → até 0.90 (erro de digitação)
//   • sinônimo/área do termo           → 0.80 (vendas ≈ vendedor)
// O resultado final é a média dos termos + bônus de campo, virando o
// percentual de "adequação" mostrado no resultado.

export type SearchableJob = {
  title: string
  company_name: string | null
  location: string | null
  work_model: string | null
  employment_type: string
  description: string | null
  requirements: string[] | null
  benefits: string[] | null
}

const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os',
  'para', 'pra', 'com', 'um', 'uma', 'uns', 'umas', 'por', 'ao', 'aos', 'à', 'às', 'que'
])

/** Sinônimos por área — amplia a busca para o "sentido" do termo. */
const SYNONYMS: Record<string, string[]> = {
  vendas: ['vendedor', 'venda', 'comercial', 'consultor', 'representante'],
  vendedor: ['vendas', 'venda', 'comercial', 'consultor'],
  vendas_externas: ['vendedor', 'externo', 'campo'],
  atendimento: ['atendente', 'recepcao', 'recepção', 'balcao', 'balcão', 'sac'],
  atendente: ['atendimento', 'recepcao', 'recepção', 'balcao', 'balcão'],
  caixa: ['operador de caixa', 'frente de loja', 'checkout'],
  estoque: ['estoquista', 'almoxarife', 'almoxarifado', 'repositor', 'expedicao', 'expedição'],
  estoquista: ['estoque', 'almoxarifado', 'repositor'],
  repositor: ['reposição', 'reposicao', 'estoque', 'gondola', 'gôndola', 'abastecimento'],
  limpeza: ['faxina', 'faxineiro', 'servicos gerais', 'serviços gerais', 'zeladoria', 'conservacao', 'conservação'],
  faxina: ['limpeza', 'servicos gerais', 'serviços gerais'],
  zelador: ['zeladoria', 'limpeza', 'conservacao', 'conservação', 'manutencao', 'manutenção'],
  auxiliar: ['ajudante', 'assistente', 'operador', 'ajudante geral'],
  ajudante: ['auxiliar', 'servente', 'ajudante geral'],
  assistente: ['auxiliar', 'analista junior'],
  motorista: ['entregador', 'condutor', 'motorista entregador', 'logistica', 'logística'],
  entregador: ['motoboy', 'motorista', 'entrega', 'logistica', 'logística'],
  logistica: ['estoque', 'expedicao', 'expedição', 'conferente', 'separador', 'armazem', 'armazém'],
  cozinha: ['cozinheiro', 'auxiliar de cozinha', 'copeiro', 'chef', 'confeiteiro'],
  cozinheiro: ['cozinha', 'chef', 'confeiteiro', 'chapeiro'],
  garcom: ['garçom', 'atendimento', 'restaurante', 'bar'],
  seguranca: ['segurança', 'vigilante', 'porteiro', 'controlador de acesso'],
  vigilante: ['seguranca', 'segurança', 'porteiro'],
  porteiro: ['vigilante', 'controlador de acesso', 'zelador'],
  administrativo: ['administração', 'administracao', 'escritorio', 'escritório', 'backoffice', 'auxiliar administrativo', 'assistente administrativo'],
  administracao: ['administrativo', 'escritorio', 'escritório', 'rh', 'financeiro'],
  financeiro: ['contas', 'contabil', 'contábil', 'faturamento', 'caixa', 'financas', 'finanças'],
  rh: ['recursos humanos', 'gente e gestao', 'gente e gestão', 'departamento pessoal', 'recrutamento'],
  ti: ['tecnologia', 'informatica', 'informática', 'suporte', 'desenvolvedor', 'programador', 'sistemas'],
  tecnologia: ['ti', 'suporte', 'desenvolvedor', 'sistemas', 'infraestrutura'],
  suporte: ['ti', 'tecnologia', 'helpdesk', 'atendimento'],
  marketing: ['comunicacao', 'comunicação', 'social media', 'midias', 'mídias', 'digital'],
  loja: ['varejo', 'comercio', 'comércio', 'vendas', 'atendimento', 'balcao', 'balcão'],
  varejo: ['loja', 'comercio', 'comércio', 'vendas', 'atendimento'],
  manutencao: ['manutenção', 'mecanico', 'mecânico', 'eletricista', 'reparo', 'tecnico', 'técnico'],
  mecanico: ['manutencao', 'manutenção', 'automotiva', 'oficina'],
  eletricista: ['manutencao', 'manutenção', 'eletrica', 'elétrica'],
  producao: ['produção', 'fabrica', 'fábrica', 'operador', 'industria', 'indústria', 'linha de producao'],
  operador: ['producao', 'produção', 'operador de maquina', 'maquina'],
  fiscal: ['fiscal de loja', 'prevencao', 'prevenção', 'seguranca', 'segurança'],
  recepcao: ['recepcionista', 'recepção', 'atendimento', 'frente'],
  recepcionista: ['recepcao', 'recepção', 'atendimento'],
  estagio: ['estágio', 'estagiario', 'estagiário', 'trainee', 'aprendiz', 'jovem aprendiz'],
  estagiario: ['estagio', 'estágio', 'trainee', 'aprendiz'],
  aprendiz: ['jovem aprendiz', 'estagio', 'estágio', 'trainee'],
  home: ['remoto', 'home office', 'teletrabalho', 'hibrido', 'híbrido'],
  remoto: ['home office', 'teletrabalho', 'distancia', 'distância'],
  pcd: ['deficiencia', 'deficiência', 'pessoa com deficiencia', 'acessibilidade'],
  saude: ['enfermagem', 'clinica', 'clínica', 'hospital', 'farmacia', 'farmácia'],
  enfermagem: ['tecnico de enfermagem', 'enfermeiro', 'saude', 'saúde'],
  beleza: ['cabeleireiro', 'esteticista', 'manicure', 'barbeiro'],
  construcao: ['construção', 'obra', 'pedreiro', 'servente', 'engenharia'],
  educacao: ['educação', 'professor', 'instrutor', 'pedagogico', 'pedagógico']
}

/** Normaliza: minúsculas, sem acento, sem pontuação, espaços simples. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token))
}

/** Distância de edição com corte (early-exit) para performance. */
export function levenshtein(a: string, b: string, max = 4): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const previous = new Array<number>(b.length + 1)
  const current = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j += 1) previous[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i
    let rowMin = current[0]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost)
      if (current[j] < rowMin) rowMin = current[j]
    }
    if (rowMin > max) return max + 1
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j]
  }
  return previous[b.length]
}

/** Similaridade 0..1 entre dois termos (com tolerância a erro de digitação). */
export function wordSimilarity(term: string, word: string): number {
  if (!term || !word) return 0
  if (term === word) return 1
  if (word.startsWith(term)) {
    // "vend" → "vendedor": forte, mas menor para termos muito curtos.
    return term.length <= 2 ? 0.7 : 0.92
  }
  if (term.length >= 4 && word.includes(term)) return 0.84
  // Erro de digitação: só vale para termos razoavelmente longos.
  if (term.length >= 4 && word.length >= 4) {
    const distance = levenshtein(term, word, 2)
    if (distance <= 2) {
      const ratio = 1 - distance / Math.max(term.length, word.length)
      return Math.min(0.9, Math.max(0.6, ratio))
    }
  }
  return 0
}

type FieldKey = 'title' | 'company_name' | 'location' | 'work_model' | 'description' | 'requirements' | 'benefits'

const FIELD_WEIGHT: Record<FieldKey, number> = {
  title: 1,
  company_name: 0.85,
  location: 0.8,
  work_model: 0.75,
  requirements: 0.7,
  benefits: 0.65,
  description: 0.55
}

export type JobScore = {
  score: number
  /** 0..99 — percentual de adequação exibido no card. */
  adequacy: number
  /** Campo onde o termo bateu melhor (para mostrar "encontrado em…"). */
  matchedField: FieldKey | null
  matchedWord: string | null
}

/** Expande um termo digitado com sinônimos/áreas conhecidas. */
export function expandTerm(term: string): string[] {
  const direct = SYNONYMS[term]
  if (direct) return [term, ...direct.map(normalize)]
  // plural simples: "vendedores" → "vendedor"
  if (term.endsWith('s') && term.length > 4) {
    const singular = term.slice(0, -1)
    const singularSynonyms = SYNONYMS[singular]
    if (singularSynonyms) return [term, singular, ...singularSynonyms.map(normalize)]
  }
  return [term]
}

/** Avalia o quanto uma vaga combina com a busca digitada. */
export function scoreJob(query: string, job: SearchableJob): JobScore {
  const terms = tokenize(query)
  if (terms.length === 0) {
    return { score: 1, adequacy: 100, matchedField: null, matchedWord: null }
  }

  const fields: Array<[FieldKey, string]> = [
    ['title', job.title],
    ['company_name', job.company_name ?? ''],
    ['location', job.location ?? ''],
    ['work_model', job.work_model ?? ''],
    ['description', job.description ?? ''],
    ['requirements', (job.requirements ?? []).join(' ')],
    ['benefits', (job.benefits ?? []).join(' ')]
  ]
  const indexed = fields.map(([key, value]) => ({
    key,
    words: tokenize(value).concat(value ? [normalize(value)] : [])
  }))

  let total = 0
  let bestField: FieldKey | null = null
  let bestFieldScore = 0
  let bestWord: string | null = null

  for (const term of terms) {
    const variants = expandTerm(term)
    let termBest = 0
    let termField: FieldKey | null = null
    let termWord: string | null = null

    for (const variant of variants) {
      // Sinônimo vale um pouco menos que o termo original.
      const variantFactor = variant === term ? 1 : 0.82
      for (const field of indexed) {
        for (const word of field.words) {
          const similarity = wordSimilarity(variant, word) * variantFactor
          if (similarity <= termBest) continue
          termBest = similarity
          termField = field.key
          termWord = word
        }
      }
    }

    // O termo casa com o título (ou empresa/local): sobe o peso.
    const weight = termField ? FIELD_WEIGHT[termField] : 0.4
    const weighted = termBest * weight
    total += weighted
    if (weighted > bestFieldScore) {
      bestFieldScore = weighted
      bestField = termField
      bestWord = termWord
    }
  }

  const score = Math.min(1, total / terms.length)
  return {
    score,
    adequacy: scoreToAdequacy(score),
    matchedField: bestField,
    matchedWord: bestWord
  }
}

export function scoreToAdequacy(score: number): number {
  if (score <= 0) return 0
  // 0.45..1.0 → 62..99% (números redondos e críveis, estilo InfoJobs).
  const mapped = 62 + ((score - 0.45) / 0.55) * 37
  return Math.max(62, Math.min(99, Math.round(mapped)))
}

export type ScoredJob<T> = { job: T; score: number; adequacy: number; matchedWord: string | null }

/** Ordena a lista inteira pela relevância (e devolve os que passam do corte). */
export function rankJobs<T extends SearchableJob & { created_at: string }>(
  query: string,
  jobs: T[],
  options: { minScore?: number } = {}
): Array<ScoredJob<T>> {
  const minScore = options.minScore ?? 0.42
  const ranked = jobs.map((job) => {
    const result = scoreJob(query, job)
    return { job, score: result.score, adequacy: result.adequacy, matchedWord: result.matchedWord }
  })
  const filtered = query.trim() ? ranked.filter((item) => item.score >= minScore) : ranked
  filtered.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.03) return b.score - a.score
    return new Date(b.job.created_at).getTime() - new Date(a.job.created_at).getTime()
  })
  return filtered
}

/** Sugestões de termos: quando o usuário erra a palavra, mostramos a certa. */
export function suggestCorrection(query: string, jobs: SearchableJob[]): string | null {
  const terms = tokenize(query)
  if (terms.length !== 1 || terms[0].length < 4) return null
  const term = terms[0]
  const vocabulary = new Set<string>()
  for (const job of jobs) {
    for (const word of tokenize(`${job.title} ${job.description ?? ''}`)) {
      if (word.length >= 4) vocabulary.add(word)
    }
  }
  let best: { word: string; score: number } | null = null
  for (const word of vocabulary) {
    if (word === term) return null // já acertou: sem correção
    const similarity = wordSimilarity(term, word)
    if (similarity >= 0.7 && (!best || similarity > best.score)) best = { word, score: similarity }
  }
  return best && best.score < 1 ? best.word : null
}

/** Termos sugeridos enquanto digita (chips rápidos na busca). */
export const QUICK_TERMS = [
  'Vendas',
  'Atendimento',
  'Estoque',
  'Limpeza',
  'Administrativo',
  'Logística',
  'Cozinha',
  'Motorista'
]
