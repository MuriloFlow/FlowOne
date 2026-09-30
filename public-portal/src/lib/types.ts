// Tipos espelham as tabelas rh_* (mesma database do FLOW).
export type RhJob = {
  id: string
  slug: string
  title: string
  department: string | null
  location: string | null
  work_model: string
  employment_type: string
  contract_type: string
  status: string
  description: string | null
  responsibilities: string[]
  requirements: string[]
  benefits: string[]
  salary_min: number | null
  salary_max: number | null
  salary_visible: boolean
  openings: number
}

export type RhQuestion = {
  id: string
  scope: 'GLOBAL' | 'JOB'
  job_id: string | null
  type: string
  label: string
  placeholder: string | null
  help_text: string | null
  required: boolean
  order_index: number
  active: boolean
  options?: { true_points?: number } | null
}

export type RhOption = {
  id: string
  question_id: string
  value: string
  label: string
  points: number
  effect: string
  order_index: number
}

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  CLT: 'CLT',
  PJ: 'PJ',
  ESTAGIO: 'Estágio',
  TRAINEE: 'Trainee',
  TEMPORARIO: 'Temporário',
  MEIO_PERIODO: 'Meio período'
}

export type AnswerValue = string | string[] | boolean | number | null
